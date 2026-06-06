import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { StudentGoal, VoiceMemo } from './types';

// Required for OAuth session handling on mobile
WebBrowser.maybeCompleteAuthSession();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Mentara] Missing env vars: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in your .env file.'
  );
}

// Fix 2: SecureStore adapter replaces AsyncStorage for encrypted token storage
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On web, Supabase handles storage natively via localStorage — don't override it
    ...(Platform.OS !== 'web' && { storage: SecureStoreAdapter }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// ─── Mentor Detail Cache ──────────────────────────────────────
// Used by MentorHubScreen in discover.tsx so mentors don't re-fetch
// their own profile on every tab visit.
const _mentorDetailCache = new Map<string, { data: any; ts: number }>();
const MENTOR_CACHE_TTL = 60_000; // 60 seconds


// ─── Rate Limiting (private) ──────────────────────────────────

export async function checkRateLimit(key: string, maxAttempts = 5, windowMinutes = 15): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_attempts: maxAttempts,
    p_window_minutes: windowMinutes,
  });
  if (error) {
    // Fail open so a broken RPC never blocks users, but log it so we notice outages
    if (__DEV__) console.warn('[RateLimit] RPC error, failing open:', error.message);
    return true;
  }
  return data === true;
}

// ─── Auth Helpers ────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
  role: 'student' | 'mentor',
  extraMetadata?: Record<string, unknown>,
) {
  const allowed = await checkRateLimit(`signup:${email.toLowerCase()}`);
  if (!allowed) {
    return { data: null, error: { message: 'Too many sign-up attempts. Please wait 15 minutes before trying again.' } };
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Merge role with any extra metadata (e.g. full_name) so that the
    // handle_new_user trigger can read them even when email confirmation is
    // required and data.session is null.
    options: { data: { role, ...extraMetadata } },
  });
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const allowed = await checkRateLimit(`signin:${email.toLowerCase()}`);
  if (!allowed) {
    return { data: null, error: { message: 'Too many sign-in attempts. Please wait 15 minutes before trying again.' } };
  }
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    // Web: standard redirect flow
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    return { data, error };
  }

  // makeRedirectUri returns mentara:// in production/dev builds,
  // and exp://ip:port/--/ in Expo Go — so the browser session closes correctly.
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'mentara', path: '/' });
  if (__DEV__) console.log('[Google OAuth] redirectUri:', redirectUri);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) return { data, error };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

  if (result.type === 'success' && result.url) {
    const url = result.url;
    const queryStr = url.includes('?') ? url.split('?')[1]?.split('#')[0] ?? '' : '';
    const hashStr  = url.includes('#') ? url.split('#')[1] ?? '' : '';
    const code         = new URLSearchParams(queryStr).get('code');
    const accessToken  = new URLSearchParams(hashStr).get('access_token');
    const refreshToken = new URLSearchParams(hashStr).get('refresh_token');

    // Supabase code flow: server returned ?code= in the query string
    if (code) {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(url);
        return { data: sessionData, error: sessionError };
      } catch (e: any) {
        return { data: null, error: { message: e?.message ?? 'Google sign-in failed. Please try again.' } };
      }
    }

    // Implicit flow fallback: server returned tokens in the URL hash
    if (accessToken) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken ?? '',
      });
      return { data: sessionData, error: sessionError };
    }
  }

  return { data: null, error: result.type === 'cancel' ? { message: 'Sign-in was cancelled.' } : { message: 'Google sign-in failed. Please try again.' } };
}

export async function signInWithApple() {
  // expo-apple-authentication is iOS-only. On non-iOS platforms, return a
  // clear error so callers can hide the Apple button rather than crash.
  if (Platform.OS !== 'ios') {
    return { data: null, error: { message: 'Sign in with Apple is only available on iOS.' } };
  }

  try {
    // Lazy import so Android/web bundles don't fail at module parse time
    const AppleAuthentication = await import('expo-apple-authentication');

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { data: null, error: { message: 'Apple sign-in did not return an identity token.' } };
    }

    // Apple only includes full_name on the VERY FIRST sign-in — capture it now.
    const fullName = credential.fullName
      ? `${credential.fullName.givenName ?? ''} ${credential.fullName.familyName ?? ''}`.trim()
      : '';

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    // If first-time sign-in and we received a name, persist it to profiles.
    // Use the rate-limited updateProfile helper to keep all profile writes
    // on a single path (consistency + observability).
    if (!error && data?.user && fullName) {
      await updateProfile(data.user.id, { full_name: fullName });
    }

    return { data, error };
  } catch (e: any) {
    if (e.code === 'ERR_REQUEST_CANCELED') {
      // User dismissed the Apple sheet — not a real error
      return { data: null, error: null };
    }
    return { data: null, error: { message: e.message ?? 'Apple sign-in failed. Please try again.' } };
  }
}

export async function resetPassword(email: string) {
  const allowed = await checkRateLimit(`reset:${email.toLowerCase()}`);
  if (!allowed) {
    return { data: null, error: { message: 'Too many password reset attempts. Please wait 15 minutes before trying again.' } };
  }
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  return { data, error };
}

// ─── Profile Helpers ─────────────────────────────────────────

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
}

export async function updateProfile(userId: string, updates: Partial<{
  full_name: string;
  bio: string;
  location: string;
  website: string;
  avatar_url: string;
  onboarding_complete: boolean;
  role: 'student' | 'mentor';
}>) {
  const allowed = await checkRateLimit(`profile_update:${userId}`, 10, 15);
  if (!allowed) {
    return { data: null, error: { message: 'Too many profile updates. Please wait before trying again.' } };
  }
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  // Bust mentor detail cache: getMentorById joins profiles, so a profile update
  // (e.g. avatar_url, full_name) must invalidate the cached mentor row.
  if (!error) _mentorDetailCache.delete(userId);
  return { data, error };
}

// ─── Student Profile Helpers ──────────────────────────────────

export async function upsertStudentProfile(userId: string, profile: Partial<{
  grade_level: string;
  fields_of_interest: string[];
  learning_goals: string;
  availability: string[];
  preferred_communication: string[];
}>) {
  const allowed = await checkRateLimit(`student_profile:${userId}`, 10, 15);
  if (!allowed) {
    return { data: null, error: { message: 'Too many profile updates. Please wait before trying again.' } };
  }
  const { data, error } = await supabase
    .from('student_profiles')
    .upsert({ id: userId, ...profile })
    .select()
    .single();
  return { data, error };
}

export async function getStudentProfile(userId: string) {
  const { data, error } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
}

export async function getMentorProfile(userId: string) {
  const { data, error } = await supabase
    .from('mentor_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  return { data, error };
}

// ─── Mentor Profile Helpers ───────────────────────────────────

export async function upsertMentorProfile(userId: string, profile: Partial<{
  title: string;
  institution: string;
  fields_of_expertise: string[];
  years_experience: number;
  availability: string[];
  hourly_rate: number;
  is_free: boolean;
  linkedin_url: string;
  preferred_student_levels: string[];
  mentoring_style: string;
  languages: string[];
}>) {
  const allowed = await checkRateLimit(`mentor_profile:${userId}`, 10, 15);
  if (!allowed) {
    return { data: null, error: { message: 'Too many profile updates. Please wait before trying again.' } };
  }
  const { data, error } = await supabase
    .from('mentor_profiles')
    .upsert({ id: userId, ...profile })
    .select()
    .single();
  // Bust the mentor detail cache so the next read shows the updated profile
  if (!error) _mentorDetailCache.delete(userId);
  return { data, error };
}

// ─── Mentor Detail ────────────────────────────────────────────

export async function getMentorById(mentorId: string) {
  const cached = _mentorDetailCache.get(mentorId);
  if (cached && Date.now() - cached.ts < MENTOR_CACHE_TTL) {
    return { data: cached.data, error: null };
  }

  const { data, error } = await supabase
    .from('mentor_profiles')
    .select(`
      *,
      profile:profiles!mentor_profiles_id_fkey(id, full_name, avatar_url, bio, location, website, role)
    `)
    .eq('id', mentorId)
    .maybeSingle();
  if (!error && data) _mentorDetailCache.set(mentorId, { data, ts: Date.now() });
  return { data, error };
}

// ─── Conversations & Messages ─────────────────────────────────

export async function getOrCreateConversation(studentId: string, mentorId: string) {
  const { data: { user: currentUser } } = await supabase.auth.getUser();
  const allowed = await checkRateLimit(`conversation:${currentUser?.id ?? studentId}`);
  if (!allowed) {
    return { data: null, error: { message: 'Too many conversation requests. Please wait 15 minutes before trying again.' } };
  }

  // Atomic upsert via RPC: eliminates the TOCTOU race where two concurrent callers
  // both read "no row" and both attempt an INSERT, causing a unique-constraint error.
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_student_id: studentId,
    p_mentor_id: mentorId,
  });
  return { data, error };
}

export async function getConversations(userId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, student_id, mentor_id, last_message, last_message_at, student_unread, mentor_unread, created_at,
      student:profiles!conversations_student_id_fkey(id, full_name, avatar_url, role),
      mentor:profiles!conversations_mentor_id_fkey(id, full_name, avatar_url, role)
    `)
    .or(`student_id.eq.${userId},mentor_id.eq.${userId}`)
    .order('last_message_at', { ascending: false })
    .limit(50);
  return { data, error };
}

/** Fetch a single conversation with both participant profiles expanded. */
export async function getConversationParticipants(conversationId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, student_id, mentor_id,
      student:profiles!conversations_student_id_fkey(id, full_name, avatar_url, role),
      mentor:profiles!conversations_mentor_id_fkey(id, full_name, avatar_url, role)
    `)
    .eq('id', conversationId)
    .single();
  return { data, error };
}

export async function markConversationRead(conversationId: string, _role?: 'student' | 'mentor') {
  const allowed = await checkRateLimit(`mark_read:${conversationId}`, 30, 15);
  if (!allowed) return { error: null };

  // Derive column from the authenticated user's actual relationship to the conversation
  // rather than trusting the caller-supplied role (prevents cross-user badge spoofing).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: null };
  const { data: conv } = await supabase
    .from('conversations')
    .select('student_id, mentor_id')
    .eq('id', conversationId)
    .single();
  if (!conv) return { error: null };
  const column = conv.student_id === user.id ? 'student_unread'
    : conv.mentor_id === user.id ? 'mentor_unread'
    : null;
  if (!column) return { error: null }; // caller is not a participant

  const { error } = await supabase
    .from('conversations')
    .update({ [column]: 0 })
    .eq('id', conversationId);
  return { error };
}

// Returns the 100 most recent messages. Pass beforeId to load older messages
// (cursor pagination). Realtime delivers new messages live via subscription,
// so the initial load only needs a recent window.
export async function getMessages(conversationId: string, beforeId?: string) {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (beforeId) {
    // Fetch the cursor row's timestamp so we can do a range filter
    const { data: cursor } = await supabase
      .from('messages')
      .select('created_at')
      .eq('id', beforeId)
      .single();
    if (cursor) {
      query = query.lt('created_at', cursor.created_at);
    }
  }

  const { data, error } = await query;
  // Reverse so messages render oldest-first in the UI
  return { data: data ? [...data].reverse() : data, error };
}

export async function sendMessage(conversationId: string, senderId: string, content: string) {
  const trimmed = content.trim();
  if (!trimmed) return { data: null, error: { message: 'Message cannot be empty.' } };
  if (trimmed.length > 3000) return { data: null, error: { message: 'Message must be 3,000 characters or fewer.' } };

  const allowed = await checkRateLimit(`message:${senderId}`);
  if (!allowed) {
    return { data: null, error: { message: 'Too many messages. Please wait 15 minutes before trying again.' } };
  }
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content: trimmed })
    .select()
    .single();

  // Fire-and-forget push notification to the other participant.
  // messageId is passed so the edge function can claim notification_sent_at
  // atomically, preventing duplicate pushes on Supabase infra retries.
  if (!error && data) {
    supabase.functions.invoke('notify-new-message', {
      body: { conversationId, senderId, messagePreview: trimmed.slice(0, 80), messageId: data.id },
    }).catch(() => {});
    supabase.functions.invoke('bot-message-handler', {
      body: { conversationId, senderId, messageId: data.id },
    }).catch(() => {});
  }

  return { data, error };
}

// ─── Account Deletion ─────────────────────────────────────────

/**
 * Permanently deletes the signed-in user's account and all associated data.
 * Calls the `delete-account` Supabase Edge Function, which uses the service
 * role key server-side — the client never touches admin credentials.
 * After successful deletion the caller must call signOut() to clear local state.
 */
export async function deleteAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { error: { message: 'You must be signed in to delete your account.' } };
  }

  const allowed = await checkRateLimit(`delete_account:${session.user.id}`, 3, 60);
  if (!allowed) {
    return { error: { message: 'Too many deletion attempts. Please wait before trying again.' } };
  }

  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    return { error: { message: error.message ?? 'Account deletion failed. Please try again.' } };
  }

  // User is deleted server-side — sign out locally only (no server revoke,
  // the user no longer exists). This fires SIGNED_OUT via onAuthStateChange,
  // which triggers the AppLayout guard to navigate to '/'.
  await supabase.auth.signOut({ scope: 'local' });

  return { error: null };
}

// ─── Avatar Upload ────────────────────────────────────────────

// ─── Push Tokens ──────────────────────────────────────────────

export async function savePushToken(userId: string, token: string, platform: 'ios' | 'android') {
  const allowed = await checkRateLimit(`push_token:${userId}`, 10, 15);
  if (!allowed) return { error: null }; // silently skip — token is already saved from last time
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' },
    );
  return { error };
}

// ─── Student Goals ────────────────────────────────────────────

export async function getStudentGoals(studentId: string): Promise<StudentGoal[]> {
  const { data, error } = await supabase
    .from('student_goals')
    .select('*')
    .eq('student_id', studentId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as StudentGoal[];
}

export async function addStudentGoal(
  studentId: string,
  title: string,
  description?: string,
  targetDate?: string,
  idempotencyKey?: string,
): Promise<StudentGoal | null> {
  const allowed = await checkRateLimit(`add_goal:${studentId}`, 20, 15);
  if (!allowed) return null;
  const trimmed = title.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 200) return null;
  const { data, error } = await supabase
    .from('student_goals')
    .insert({
      student_id: studentId,
      title: trimmed,
      description: description ?? null,
      target_date: targetDate ?? null,
      ...(idempotencyKey ? { client_idempotency_key: idempotencyKey } : {}),
    })
    .select()
    .single();

  // Idempotent retry: unique-constraint violation means goal was already created
  if (error && error.code === '23505' && idempotencyKey) {
    const { data: existing } = await supabase
      .from('student_goals')
      .select('*')
      .eq('client_idempotency_key', idempotencyKey)
      .single();
    if (existing) return existing as StudentGoal;
  }

  if (error) return null;
  return data as StudentGoal;
}

export async function toggleStudentGoal(goalId: string, status: 'active' | 'completed'): Promise<boolean> {
  const allowed = await checkRateLimit(`toggle_goal:${goalId}`, 10, 15);
  if (!allowed) return false;
  const { error } = await supabase
    .from('student_goals')
    .update({ status })
    .eq('id', goalId);
  return !error;
}

export async function deleteStudentGoal(goalId: string): Promise<boolean> {
  const allowed = await checkRateLimit(`delete_goal:${goalId}`, 5, 15);
  if (!allowed) return false;
  const { error } = await supabase
    .from('student_goals')
    .delete()
    .eq('id', goalId);
  return !error;
}

// ─── Voice Memos ──────────────────────────────────────────────

export async function getVoiceMemoForMeeting(meetingId: string): Promise<VoiceMemo | null> {
  const { data, error } = await supabase
    .from('voice_memos')
    .select('*')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (error) return null;
  return data as VoiceMemo | null;
}

export async function insertVoiceMemo(
  meetingId: string,
  studentId: string,
  conversationId: string,
  audioUrl: string,
): Promise<VoiceMemo | null> {
  const allowed = await checkRateLimit(`voice_memo:${studentId}`, 5, 15);
  if (!allowed) return null;
  const { data, error } = await supabase
    .from('voice_memos')
    .insert({ meeting_id: meetingId, student_id: studentId, conversation_id: conversationId, audio_url: audioUrl })
    .select()
    .single();
  if (error) return null;
  return data as VoiceMemo;
}

export async function getRecentVoiceMemos(studentId: string, limit = 3): Promise<VoiceMemo[]> {
  const { data, error } = await supabase
    .from('voice_memos')
    .select('*')
    .eq('student_id', studentId)
    .eq('processing_status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as VoiceMemo[];
}

export async function removePushToken(userId: string, token: string) {
  const allowed = await checkRateLimit(`remove_push_token:${userId}`, 10, 15);
  if (!allowed) return { error: null };
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token);
  return { error };
}

// ─── Referral Helpers ─────────────────────────────────────────

export async function getMyReferralCode(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single();
  return data?.referral_code ?? null;
}

export async function getReferredByInfo(userId: string): Promise<{ name: string | null; id: string | null } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', userId)
    .single();
  if (!data?.referred_by) return null;
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', data.referred_by)
    .single();
  return referrer ? { id: referrer.id, name: referrer.full_name } : null;
}

export async function getMyReferrals(userId: string, limit = 100): Promise<Array<{ id: string; full_name: string | null }>> {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('referred_by', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{ id: string; full_name: string | null }>;
}

export async function applyReferralCode(code: string, newUserId: string): Promise<boolean> {
  const allowed = await checkRateLimit(`referral:${newUserId}`, 5, 15);
  if (!allowed) return false;
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id')
    .eq('referral_code', code.toUpperCase())
    .single();
  if (!referrer || referrer.id === newUserId) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ referred_by: referrer.id })
    .eq('id', newUserId);
  return !error;
}

// ─── Block Helpers ────────────────────────────────────────────

export async function blockUser(blockerId: string, blockedId: string): Promise<boolean> {
  const allowed = await checkRateLimit(`block:${blockerId}`, 10, 15);
  if (!allowed) return false;
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });
  return !error;
}

export async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .single();
  return !!data;
}

// ─── Achievement Helpers ──────────────────────────────────────

export async function unlockAchievement(userId: string, achievement: string): Promise<void> {
  const allowed = await checkRateLimit(`achievement:${userId}`, 20, 15);
  if (!allowed) return;
  await supabase.rpc('unlock_achievement', { p_user_id: userId, p_achievement: achievement });
}

export async function getUserAchievements(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('achievements')
    .eq('id', userId)
    .single();
  return data?.achievements ?? [];
}

// ─── Edge Function Triggers ───────────────────────────────────

export async function triggerAutoAssignMentor(studentId: string) {
  return supabase.functions.invoke('auto-assign-mentor', { body: { studentId } });
}

export async function triggerAutoVerifyMentor(mentorId: string) {
  return supabase.functions.invoke('auto-verify-mentor', { body: { mentorId } });
}

// ─── Password Update ──────────────────────────────────────────

export async function updatePassword(newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    return { data: null, error: { message: 'Password must be at least 8 characters.' } };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const allowed = await checkRateLimit(`password_update:${user.id}`, 3, 60);
    if (!allowed) {
      return { data: null, error: { message: 'Too many password update attempts. Please wait an hour before trying again.' } };
    }
  }
  return supabase.auth.updateUser({ password: newPassword });
}

export async function uploadAvatar(userId: string, uri: string) {
  const allowed = await checkRateLimit(`avatar_upload:${userId}`, 5, 15);
  if (!allowed) {
    return { url: null, error: { message: 'Too many upload attempts. Please wait before trying again.' } };
  }
  const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
  const rawExt = uri.split('.').pop()?.toLowerCase() ?? '';
  const ext = ALLOWED_EXTS.includes(rawExt) ? rawExt : 'jpg';
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const fileName = `${userId}/avatar.${ext}`;
  try {
    // Use expo-file-system base64 read — avoids the 0-byte Blob bug on iOS Hermes
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as const });
    if (!base64 || base64.length === 0) {
      return { url: null, error: { message: 'Failed to read image file.' } };
    }
    // Enforce a 5 MB limit (base64 is ~1.37× binary size)
    if (base64.length > 5 * 1024 * 1024 * 1.37) {
      return { url: null, error: { message: 'Image must be under 5 MB.' } };
    }
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, bytes, { contentType, upsert: true });
    if (error) return { url: null, error };
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    // Append a timestamp so React Native's image cache treats this as a new image.
    // Without this, the URL stays identical after re-upload and the old photo stays visible.
    return { url: `${urlData.publicUrl}?t=${Date.now()}`, error: null };
  } catch (e: any) {
    return { url: null, error: { message: e?.message ?? 'Upload failed.' } };
  }
}
