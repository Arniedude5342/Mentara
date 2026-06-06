import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useMessages } from '@/hooks/useMessages';
import MessageBubble from '@/components/MessageBubble';
import BotMessageBubble from '@/components/BotMessageBubble';
import ScheduleCallCard from '@/components/ScheduleCallCard';
import ActionItemsCard from '@/components/ActionItemsCard';
import VoiceMemoCard from '@/components/VoiceMemoCard';
import PostMeetingRatingCard from '@/components/PostMeetingRatingCard';
import RescheduleCard from '@/components/RescheduleCard';
import Avatar from '@/components/ui/Avatar';
import { Colors, Radius, Shadow, Fonts, Typography } from '@/constants/theme';
import { isGCalAuthorized, authorizeGoogleCalendar, createGCalEvent } from '@/lib/googleCalendar';
import { supabase, getConversationParticipants, markConversationRead, getVoiceMemoForMeeting, blockUser } from '@/lib/supabase';
import { getMeetingsForConversation, getPendingReschedule, updateMeetingLink } from '@/lib/meetings';
import { Meeting, RescheduleRequest } from '@/lib/types';

export default function ChatScreen() {
  const rawParams = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(rawParams.id) ? rawParams.id[0] : (rawParams.id ?? '');
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { messages, loading, send } = useMessages(conversationId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [memoMeetingIds, setMemoMeetingIds] = useState<Set<string>>(new Set());
  const [calAdding, setCalAdding] = useState(false);
  const [calAddedIds, setCalAddedIds] = useState<Set<string>>(new Set());
  const [pendingReschedule, setPendingReschedule] = useState<RescheduleRequest | null>(null);
  const [editingLink, setEditingLink] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!conversationId || !user) return;
    let cancelled = false;
    getConversationParticipants(conversationId).then(({ data, error }) => {
      if (cancelled || !mountedRef.current) return;
      if (error || !data) {
        Alert.alert('Not found', 'This conversation could not be found.', [
          { text: 'Go Back', onPress: () => router.back() },
        ]);
        return;
      }
      const conv = data as any;
      const other = conv.student_id === user.id ? conv.mentor : conv.student;
      if (other) setOtherUser(other);
    });
    const role = profile?.role ?? 'student';
    markConversationRead(conversationId, role as 'student' | 'mentor');
    return () => { cancelled = true; };
  }, [conversationId, user]);

  const loadMeetings = async () => {
    if (!conversationId) return;
    const result = await getMeetingsForConversation(conversationId);
    if (!mountedRef.current) return;
    setMeetings(result);

    // Find which occurred meetings already have voice memos
    const occurredMeetings = result.filter((m) => m.occurred === true);
    const memoChecks = await Promise.all(
      occurredMeetings.map(async (m) => {
        const memo = await getVoiceMemoForMeeting(m.id);
        return memo ? m.id : null;
      })
    );
    if (mountedRef.current) {
      setMemoMeetingIds(new Set(memoChecks.filter(Boolean) as string[]));
    }

    // Check for a pending reschedule on the upcoming meeting
    const upcoming = result.find((m) => !m.occurred && new Date(m.scheduled_at) > new Date());
    if (upcoming && mountedRef.current) {
      try {
        const reschedule = await getPendingReschedule(upcoming.id);
        if (mountedRef.current) setPendingReschedule(reschedule);
      } catch {
        // Table may not exist yet — fail silently
      }
    } else if (mountedRef.current) {
      setPendingReschedule(null);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !user || sending) return;
    if (!conversationId) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    const { error } = await send(user.id, content);
    if (!mountedRef.current) return;
    setSending(false);
    if (error) {
      setInput(content);
      Alert.alert('Send failed', (error as any).message ?? 'Could not send message. Please try again.');
      return;
    }
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleMeetingScheduled = (meeting: Meeting) => {
    setMeetings((prev) => [...prev, meeting]);
    loadMeetings();
  };

  const now = new Date();
  const upcomingMeeting = meetings.find(
    (m) => !m.occurred && new Date(m.scheduled_at) > now
  );
  const isFirstMeeting = meetings.length === 0;

  // Show schedule card when: no upcoming meeting, AND either never had a meeting
  // or the most recent meeting was 7+ days ago (time for a new monthly call)
  const lastMeeting = meetings.length > 0
    ? meetings.reduce((latest, m) =>
        new Date(m.scheduled_at) > new Date(latest.scheduled_at) ? m : latest
      )
    : null;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const showScheduleCard =
    !upcomingMeeting &&
    (!lastMeeting || now.getTime() - new Date(lastMeeting.scheduled_at).getTime() >= sevenDaysMs);

  const isStudent = profile?.role === 'student';
  const studentId = isStudent ? (user?.id ?? '') : (otherUser?.id ?? '');
  const mentorId = isStudent ? (otherUser?.id ?? '') : (user?.id ?? '');

  // Priority cards derived from meetings state
  const pendingCheckinMeeting = meetings.find(
    (m) => m.check_in_sent_at && m.occurred === false
  ) ?? null;
  const pendingVoiceMemo = isStudent
    ? (meetings.find((m) => m.occurred === true && !memoMeetingIds.has(m.id)) ?? null)
    : null;

  const themeColor = isStudent ? Colors.primary : Colors.accent2;
  const themeColorLight = isStudent ? Colors.primaryLight : Colors.accent2Light;
  const themeColorGlow = isStudent ? Colors.primaryGlow : Colors.accent2Glow;

  const handleBlockUser = () => {
    if (!user || !otherUser) return;
    Alert.alert(
      `Block ${otherUser.full_name ?? 'User'}`,
      'They will no longer be able to contact you. This action cannot be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const ok = await blockUser(user.id, otherUser.id);
            if (ok) {
              Alert.alert('Blocked', `${otherUser.full_name ?? 'User'} has been blocked.`);
              router.back();
            } else {
              Alert.alert('Error', 'Could not block user. Please try again.');
            }
          },
        },
      ],
    );
  };

  const handleReportUser = () => {
    if (!otherUser) return;
    const subject = encodeURIComponent(`Report: User ${otherUser.id}`);
    const body = encodeURIComponent(
      `I want to report this user:\n\nName: ${otherUser.full_name ?? 'Unknown'}\nUser ID: ${otherUser.id}\nConversation ID: ${conversationId}\n\nReason:\n[Please describe what happened]`
    );
    Linking.openURL(`mailto:mentarasupport@gmail.com?subject=${subject}&body=${body}`).catch(() => {});
  };

  const handleMoreOptions = () => {
    Alert.alert(
      otherUser?.full_name ?? 'Options',
      undefined,
      [
        { text: 'Report User', onPress: handleReportUser },
        { text: 'Block User', style: 'destructive', onPress: handleBlockUser },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleAddToCalendar = async (meeting: Meeting) => {
    if (calAdding || calAddedIds.has(meeting.id)) return;
    setCalAdding(true);
    try {
      const authorized = await isGCalAuthorized();
      if (!authorized) {
        const ok = await authorizeGoogleCalendar();
        if (!ok) {
          Alert.alert('Calendar', 'Google Calendar authorization was cancelled.');
          return;
        }
      }
      const start = new Date(meeting.scheduled_at);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const description = meeting.meeting_link
        ? `Join link: ${meeting.meeting_link}`
        : 'Mentara mentorship session';
      const result = await createGCalEvent({
        title: 'Mentara Mentorship Call',
        startDate: start,
        endDate: end,
        description,
        reminderMinutes: 15,
      });
      if (result) {
        setCalAddedIds((prev) => new Set([...prev, meeting.id]));
      } else {
        Alert.alert('Calendar', 'Could not add the event. Please try again.');
      }
    } catch {
      Alert.alert('Calendar', 'Something went wrong. Please try again.');
    } finally {
      setCalAdding(false);
    }
  };

  const platformLabel: Record<Meeting['platform'], string> = {
    zoom: 'Zoom',
    google_meet: 'Google Meet',
    teams: 'Teams',
    facetime: 'FaceTime',
    other: 'video call',
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: themeColorLight, borderColor: themeColorGlow }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={themeColor} />
        </TouchableOpacity>

        {otherUser ? (
          <TouchableOpacity
            style={styles.headerUser}
            onPress={() => {
              if (otherUser.role === 'mentor') {
                router.push(`/(app)/mentor/${otherUser.id}` as any);
              }
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`View ${otherUser.full_name}'s profile`}
          >
            <Avatar uri={otherUser.avatar_url} name={otherUser.full_name} size={38} />
            <View>
              <Text style={styles.headerName}>{otherUser.full_name}</Text>
              <Text style={[styles.headerRole, { color: themeColor }]}>Monthly Call</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerUser}>
            <View style={styles.headerAvatarSkeleton} />
            <View style={styles.headerTextSkeleton} />
          </View>
        )}

        <TouchableOpacity
          style={styles.infoBtn}
          onPress={handleMoreOptions}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-vertical" size={22} color={Colors.gray500} />
        </TouchableOpacity>
      </View>

      {/* ── Meeting chip (upcoming call) ─────────────────────── */}
      {upcomingMeeting && (
        <View>
          <View style={[styles.meetingChip, { backgroundColor: themeColorLight, borderColor: themeColorGlow }]}>
            <Ionicons name="calendar" size={13} color={themeColor} />
            <Text style={[styles.meetingChipText, { color: themeColor }]}>
              Next call:{' '}
              {new Date(upcomingMeeting.scheduled_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {' via '}
              {platformLabel[upcomingMeeting.platform]}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLinkInput(upcomingMeeting.meeting_link ?? '');
                setEditingLink((v) => !v);
              }}
              accessibilityLabel={editingLink ? 'Close link editor' : 'Update meeting link'}
              accessibilityRole="button"
              style={styles.calChipBtn}
            >
              <Ionicons
                name={editingLink ? 'close-circle-outline' : 'link-outline'}
                size={16}
                color={themeColor}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAddToCalendar(upcomingMeeting)}
              disabled={calAdding || calAddedIds.has(upcomingMeeting.id)}
              accessibilityLabel="Add to Google Calendar"
              accessibilityRole="button"
              style={[styles.calChipBtn, calAddedIds.has(upcomingMeeting.id) && styles.calChipBtnDone]}
            >
              {calAdding ? (
                <ActivityIndicator size="small" color={themeColor} />
              ) : calAddedIds.has(upcomingMeeting.id) ? (
                <Ionicons name="checkmark-circle" size={16} color={Colors.accent3} />
              ) : (
                <Ionicons name="calendar-outline" size={16} color={themeColor} />
              )}
            </TouchableOpacity>
          </View>
          {editingLink && (
            <View style={styles.linkEditRow}>
              <TextInput
                style={styles.linkInput}
                value={linkInput}
                onChangeText={setLinkInput}
                placeholder="Paste new meeting link..."
                placeholderTextColor={Colors.gray400}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                accessibilityLabel="New meeting link"
              />
              <TouchableOpacity
                style={[styles.linkSaveBtn, { backgroundColor: themeColor }]}
                onPress={async () => {
                  const ok = await updateMeetingLink(upcomingMeeting.id, linkInput);
                  if (ok) {
                    setEditingLink(false);
                    loadMeetings();
                  } else {
                    Alert.alert('Invalid link', 'Please enter a valid https:// URL.');
                  }
                }}
                accessibilityLabel="Save meeting link"
                accessibilityRole="button"
              >
                <Text style={[styles.linkSaveBtnText, { color: Colors.white }]}>Save</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Priority cards — above messages, below header ───── */}
        <View style={styles.cardsSection}>
          {/* Voice memo (student only, after occurred meeting) */}
          {pendingVoiceMemo && studentId && (
            <VoiceMemoCard
              meeting={pendingVoiceMemo}
              studentId={studentId}
              conversationId={conversationId}
              onDismiss={() => {
                setMemoMeetingIds((prev) => new Set([...prev, pendingVoiceMemo.id]));
              }}
            />
          )}

          {/* Post-meeting check-in */}
          {pendingCheckinMeeting && !pendingVoiceMemo && (
            <PostMeetingRatingCard
              meetingId={pendingCheckinMeeting.id}
              raterId={user?.id ?? ''}
              rateeId={isStudent ? mentorId : studentId}
              rateeName={otherUser?.full_name ?? ''}
              isStudent={isStudent}
              onSubmitted={() => loadMeetings()}
            />
          )}

          {/* Commitments (collapsible, always rendered once loaded) */}
          {conversationId && user && (
            <ActionItemsCard
              conversationId={conversationId}
              currentUserId={user.id}
              themeColor={themeColor}
            />
          )}

          {/* Reschedule — only when there's an upcoming meeting */}
          {upcomingMeeting && user && (
            <RescheduleCard
              meetingId={upcomingMeeting.id}
              conversationId={conversationId}
              currentUserId={user.id}
              currentUserName={profile?.full_name ?? 'You'}
              otherUserName={otherUser?.full_name ?? 'the other person'}
              pendingRequest={pendingReschedule}
              themeColor={themeColor}
              themeColorLight={themeColorLight}
              onRequestSent={(req) => setPendingReschedule(req)}
              onResponded={() => loadMeetings()}
              onCancelled={() => setPendingReschedule(null)}
            />
          )}

          {/* Schedule call (no upcoming meeting, 7+ days since last) */}
          {showScheduleCard && !pendingVoiceMemo && !pendingCheckinMeeting && conversationId && studentId && mentorId && (
            <ScheduleCallCard
              conversationId={conversationId}
              studentId={studentId}
              mentorId={mentorId}
              scheduledBy={user?.id ?? ''}
              isFirstMeeting={isFirstMeeting}
              onScheduled={handleMeetingScheduled}
            />
          )}
        </View>

        {/* ── Messages ─────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={themeColor} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyChat}>
            {otherUser && (
              <Avatar uri={otherUser.avatar_url} name={otherUser.full_name} size={72} />
            )}
            <Text style={styles.emptyChatTitle}>
              Your call thread with{'\n'}{otherUser?.full_name?.split(' ')[0] ?? 'your mentor'}
            </Text>
            <Text style={styles.emptyChatSub}>
              Introduce yourself and schedule your first monthly call.
            </Text>
            <View style={styles.suggestions}>
              {[
                "Hi! Looking forward to our first call.",
                "When are you available for a call this week?",
                "What's the best time for our first session?",
              ].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.suggestion, { borderColor: themeColorGlow }]}
                  onPress={() => setInput(s)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Use prompt: ${s}`}
                >
                  <Text style={[styles.suggestionText, { color: themeColor }]}>{s}</Text>
                  <Ionicons name="arrow-forward" size={14} color={themeColor} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            style={styles.flex}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const prevMsg = messages[index - 1];
              const showTime = !prevMsg || (
                new Date(item.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000
              );
              if ((item as any).sender_type === 'bot') {
                return (
                  <BotMessageBubble
                    content={item.content}
                    timestamp={item.created_at}
                    showTime={showTime}
                  />
                );
              }
              return (
                <MessageBubble
                  content={item.content}
                  isMine={item.sender_id === user?.id}
                  timestamp={item.created_at}
                  showTime={showTime}
                  messageId={item.id}
                  senderId={item.sender_id}
                  conversationId={conversationId}
                />
              );
            }}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* ── Input bar — always at the very bottom ────────────── */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Send a message..."
              placeholderTextColor={Colors.gray400}
              multiline
              maxLength={1000}
              returnKeyType="default"
              accessibilityLabel="Message input"
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: themeColor }, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="send" size={18} color={Colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  // ── Header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderColor: Colors.gray100,
  },
  backBtn: {
    width: 36, height: 36,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1, borderColor: Colors.primaryGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  headerRole: { fontSize: 12, color: Colors.primary, marginTop: 1, fontFamily: Fonts.sansMedium },
  headerAvatarSkeleton: { width: 38, height: 38, backgroundColor: Colors.gray200 },
  headerTextSkeleton: { width: 100, height: 16, backgroundColor: Colors.gray200 },
  infoBtn: {
    width: 36, height: 36,
    backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
  },

  // ── Meeting chip ──────────────────────────────────────────────────
  meetingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryLight, borderBottomWidth: 1,
    borderColor: Colors.primaryGlow, paddingHorizontal: 16, paddingVertical: 8,
  },
  meetingChipText: {
    ...Typography.bodySm, color: Colors.primary,
    fontFamily: Fonts.sansMedium, flex: 1,
  },
  calChipBtn: {
    width: 30, height: 30, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  calChipBtnDone: { backgroundColor: Colors.accent3 + '15' },
  linkEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  linkInput: {
    flex: 1, backgroundColor: Colors.white,
    borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, color: Colors.dark,
  },
  linkSaveBtn: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: Radius.md,
  },
  linkSaveBtnText: { fontSize: 13, fontFamily: Fonts.sansBold },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Empty state ───────────────────────────────────────────────────
  emptyChat: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 14,
  },
  emptyChatTitle: {
    fontSize: 18, fontWeight: '700', color: Colors.dark, textAlign: 'center', lineHeight: 26,
  },
  emptyChatSub: {
    fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 20,
  },
  suggestions: { alignSelf: 'stretch', gap: 8, marginTop: 8 },
  suggestion: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.primaryGlow,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  suggestionText: { fontSize: 14, color: Colors.primary, fontWeight: '500', flex: 1 },

  // ── Message list ──────────────────────────────────────────────────
  messageList: { paddingVertical: 12, paddingHorizontal: 4 },

  // ── Cards section (above messages) ───────────────────────────────
  cardsSection: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  // ── Input container ───────────────────────────────────────────────
  inputContainer: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    paddingTop: 10,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16,
  },
  textInput: {
    flex: 1, backgroundColor: Colors.background,
    borderRadius: 22,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: Colors.dark, maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.gray300 },
});
