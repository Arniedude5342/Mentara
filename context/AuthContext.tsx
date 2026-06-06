import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase, getProfile, updateProfile } from '@/lib/supabase';
import { mapAuthError } from '@/lib/authUtils';
import { Profile } from '@/lib/types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  error: null,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string, attempt = 0) => {
    const { data, error: profileError } = await getProfile(userId);

    if (profileError) {
      setProfile(null);
      return;
    }

    // Profile row may not exist yet if the handle_new_user trigger hasn't committed —
    // retry once after a short delay before giving up.
    if (!data) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500));
        return loadProfile(userId, attempt + 1);
      }
      setProfile(null);
      return;
    }

    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const applyPendingOAuthRole = useCallback(async (userId: string) => {
    try {
      const raw = await SecureStore.getItemAsync('mentara_pending_role');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { role: string; timestamp: number };
      const ageMs = Date.now() - parsed.timestamp;
      if (ageMs > 10 * 60 * 1000) {
        // Stale — discard
        await SecureStore.deleteItemAsync('mentara_pending_role');
        return;
      }
      if (parsed.role === 'student' || parsed.role === 'mentor') {
        await updateProfile(userId, { role: parsed.role as 'student' | 'mentor' });
      }
      await SecureStore.deleteItemAsync('mentara_pending_role');
    } catch {
      // Non-fatal
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[AuthContext] signOut error (clearing local session anyway):', error.message);
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    setError(null);
  }, []);

  // Guard against concurrent loadProfile calls (e.g. multiple OAuth events firing simultaneously)
  const loadingProfileRef = useRef(false);

  useEffect(() => {
    // Initial session load — wrapped in try/catch so a network failure
    // does NOT leave loading: true forever (which would freeze the splash screen)
    const initSession = async () => {
      try {
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          await loadProfile(initialSession.user.id);
        }
      } catch (e: any) {
        setError(mapAuthError(e.message ?? 'Failed to initialize session'));
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Guard against concurrent loads — if initSession is still in-flight
        // or a previous listener call is already loading, do not re-enter.
        if (!loadingProfileRef.current) {
          loadingProfileRef.current = true;
          setLoading(true);
          // For OAuth sign-ins apply any pending role before loading the profile
          const applyThenLoad = event === 'SIGNED_IN'
            ? applyPendingOAuthRole(newSession.user.id).then(() => loadProfile(newSession.user.id))
            : loadProfile(newSession.user.id);
          applyThenLoad
            .catch(() => {})
            .finally(() => {
              loadingProfileRef.current = false;
              setLoading(false);
            });
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const contextValue = useMemo(
    () => ({ session, user, profile, loading, error, refreshProfile, signOut: handleSignOut }),
    [session, user, profile, loading, error, refreshProfile, handleSignOut]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
