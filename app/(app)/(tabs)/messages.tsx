import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useConversations, useMessages } from '@/hooks/useMessages';
import Avatar from '@/components/ui/Avatar';
import MessageBubble from '@/components/MessageBubble';
import BotMessageBubble from '@/components/BotMessageBubble';
import ScheduleCallCard from '@/components/ScheduleCallCard';
import RescheduleCard from '@/components/RescheduleCard';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import { getConversationParticipants, markConversationRead } from '@/lib/supabase';
import { getMeetingsForConversation, getPendingReschedule, updateMeetingLink } from '@/lib/meetings';
import { Meeting, Message, RescheduleRequest } from '@/lib/types';

const PLATFORM_LABEL: Record<Meeting['platform'], string> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Teams',
  facetime: 'FaceTime',
  other: 'video call',
};

function formatTime(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMins = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Inline chat embedded in the tab (student or mentor) ─────────────────────

function InlineChat({
  conversationId,
  userId,
  role,
  onBack,
}: {
  conversationId: string;
  userId: string;
  role: 'student' | 'mentor';
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { messages, loading: msgsLoading, send } = useMessages(conversationId);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [otherUser, setOtherUser] = useState<any>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [pendingReschedule, setPendingReschedule] = useState<RescheduleRequest | null>(null);
  const [editingLink, setEditingLink] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch mentor profile + mark conversation read
  useEffect(() => {
    if (!conversationId || !userId) return;
    let cancelled = false;
    getConversationParticipants(conversationId).then(({ data }) => {
      if (cancelled || !mountedRef.current) return;
      if (data) {
        const conv = data as any;
        const other = conv.student_id === userId ? conv.mentor : conv.student;
        if (other) setOtherUser(other);
      }
    });
    markConversationRead(conversationId, role);
    return () => { cancelled = true; };
  }, [conversationId, userId]);

  const loadMeetings = async () => {
    const result = await getMeetingsForConversation(conversationId);
    if (mountedRef.current) setMeetings(result);

    const upcoming = result.find((m) => !m.occurred && new Date(m.scheduled_at) > new Date());
    if (upcoming && mountedRef.current) {
      try {
        const reschedule = await getPendingReschedule(upcoming.id);
        if (mountedRef.current) setPendingReschedule(reschedule);
      } catch {
        // table may not exist yet
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
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    const { error } = await send(userId, content);
    if (!mountedRef.current) return;
    setSending(false);
    if (error) {
      setInput(content);
      Alert.alert('Send failed', (error as any).message ?? 'Could not send message.');
      return;
    }
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleMeetingScheduled = (meeting: Meeting) => {
    setMeetings((prev) => [...prev, meeting]);
    loadMeetings();
  };

  // Derive meeting state
  const now = new Date();
  const upcomingMeeting = meetings.find(
    (m) => !m.occurred && new Date(m.scheduled_at) > now
  );
  const isFirstMeeting = meetings.length === 0;
  const lastMeeting = meetings.length > 0
    ? meetings.reduce((latest, m) =>
        new Date(m.scheduled_at) > new Date(latest.scheduled_at) ? m : latest
      )
    : null;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const showScheduleCard =
    !upcomingMeeting &&
    (!lastMeeting || now.getTime() - new Date(lastMeeting.scheduled_at).getTime() >= sevenDaysMs);

  const isStudent = role === 'student';
  const studentId = isStudent ? userId : (otherUser?.id ?? '');
  const mentorId = isStudent ? (otherUser?.id ?? '') : userId;
  const themeColor = isStudent ? Colors.primary : Colors.accent2;
  const themeColorLight = isStudent ? Colors.primaryLight : Colors.accent2Light;

  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => {
    const prevMsg = messages[index - 1];
    const showTime =
      !prevMsg ||
      new Date(item.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000;
    if ((item as any).sender_type === 'bot') {
      return <BotMessageBubble content={item.content} timestamp={item.created_at} showTime={showTime} />;
    }
    return (
      <MessageBubble
        content={item.content}
        isMine={item.sender_id === userId}
        timestamp={item.created_at}
        showTime={showTime}
      />
    );
  }, [messages, userId]);

  return (
    <>
      {/* ── Chat header ───────────────────────────────────── */}
      <View style={styles.chatHeader}>
        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            style={styles.chatBackBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to student list"
          >
            <Ionicons name="arrow-back" size={20} color={Colors.gray700} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.headerUser}
          onPress={() => mentorId && router.push(`/(app)/mentor/${mentorId}` as any)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`View ${otherUser?.full_name ?? 'mentor'}'s profile`}
        >
          {otherUser ? (
            <Avatar uri={otherUser.avatar_url} name={otherUser.full_name} size={38} />
          ) : (
            <View style={styles.avatarSkeleton} />
          )}
          <View>
            <Text style={styles.chatHeaderName}>
              {otherUser?.full_name ?? '…'}
            </Text>
            <Text style={styles.chatHeaderRole}>
              {upcomingMeeting
                ? `Next call ${new Date(upcomingMeeting.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : role === 'student' ? 'Your mentor' : 'Your student'}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => mentorId && router.push(`/(app)/mentor/${mentorId}` as any)}
          accessibilityRole="button"
          accessibilityLabel="View mentor profile"
        >
          <Ionicons name="information-circle-outline" size={24} color={Colors.gray500} />
        </TouchableOpacity>
      </View>

      {/* ── Upcoming meeting chip ───────────────────────────── */}
      {upcomingMeeting && (
        <View>
          <View style={styles.meetingChip}>
            <Ionicons name="calendar" size={13} color={themeColor} />
            <Text style={styles.meetingChipText}>
              Next call:{' '}
              {new Date(upcomingMeeting.scheduled_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
              {' via '}{PLATFORM_LABEL[upcomingMeeting.platform]}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setLinkInput(upcomingMeeting.meeting_link ?? '');
                setEditingLink((v) => !v);
              }}
              accessibilityLabel={editingLink ? 'Close link editor' : 'Update meeting link'}
              accessibilityRole="button"
            >
              <Ionicons
                name={editingLink ? 'close-circle-outline' : 'link-outline'}
                size={17}
                color={themeColor}
              />
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
                <Text style={styles.linkSaveBtnText}>Save</Text>
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
        {/* ── Cards: reschedule + schedule — above messages ──── */}
        <View style={styles.cardsSection}>
          {upcomingMeeting && (
            <RescheduleCard
              meetingId={upcomingMeeting.id}
              conversationId={conversationId}
              currentUserId={userId}
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
          {showScheduleCard && studentId && mentorId && (
            <ScheduleCallCard
              conversationId={conversationId}
              studentId={studentId}
              mentorId={mentorId}
              scheduledBy={userId}
              isFirstMeeting={isFirstMeeting}
              onScheduled={handleMeetingScheduled}
            />
          )}
        </View>

        {msgsLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyChat}>
            {otherUser && (
              <Avatar uri={otherUser.avatar_url} name={otherUser.full_name} size={72} />
            )}
            <Text style={styles.emptyChatTitle}>
              Your call thread with{'\n'}
              {otherUser?.full_name?.split(' ')[0] ?? 'your mentor'}
            </Text>
            <Text style={styles.emptyChatSub}>
              Introduce yourself and schedule your first monthly call.
            </Text>
            <View style={styles.suggestions}>
              {[
                'Hi! Looking forward to our first call.',
                'When are you available for a call this week?',
                "What's the best time for our first session?",
              ].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.suggestion}
                  onPress={() => setInput(s)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Use: ${s}`}
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
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
            renderItem={renderItem}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={10}
            initialNumToRender={20}
          />
        )}


        {/* ── Input row ────────────────────────────────────── */}
        <View style={styles.chatInputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Send a message..."
              placeholderTextColor={Colors.gray400}
              multiline
              maxLength={1000}
              accessibilityLabel="Message input"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
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
    </>
  );
}

// ─── Root screen ─────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { conversations, loading } = useConversations(user?.id ?? '');
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);

  const isStudent = profile?.role === 'student';

  // ── Student path: always render inline chat, no outer spinner ───────────
  if (isStudent) {
    if (loading) {
      return (
        <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    if (conversations.length === 0) {
      return (
        <View style={[styles.root, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrowText}>CALLS</Text>
              <Text style={styles.title}>Call Threads</Text>
            </View>
          </View>
          <View style={styles.empty}>
            <View style={styles.emptyOuter}>
              <View style={styles.emptyInner}>
                <Ionicons name="calendar-outline" size={36} color={Colors.primary} />
              </View>
            </View>
            <Text style={styles.emptyTitle}>No call threads yet</Text>
            <Text style={styles.emptySubtitle}>
              Once you're matched with a mentor, your call thread will appear here.
            </Text>
            <TouchableOpacity
              style={styles.discoverOuter}
              onPress={() => router.push('/(app)/(tabs)/discover')}
              accessibilityLabel="View your mentor match"
              accessibilityRole="button"
            >
              <View style={styles.discoverInner}>
                <Text style={styles.discoverBtnText}>View Your Mentor</Text>
                <View style={styles.discoverArrow}>
                  <Ionicons name="arrow-forward" size={13} color={Colors.white} />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const studentConvoId = conversations[0]?.id;
    if (!studentConvoId) {
      return (
        <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <InlineChat
          conversationId={studentConvoId}
          userId={user!.id}
          role="student"
        />
      </View>
    );
  }

  // ── Mentor path ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.accent2} />
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: Colors.mentorHeaderBg }]}>
          <Text style={styles.eyebrowText}>CALLS</Text>
          <Text style={styles.title}>Call Threads</Text>
        </View>
        <View style={styles.empty}>
          <View style={[styles.emptyOuter, { backgroundColor: Colors.accent2Light, borderColor: Colors.accent2Glow }]}>
            <View style={[styles.emptyInner, { backgroundColor: Colors.accent2Light }]}>
              <Ionicons name="calendar-outline" size={36} color={Colors.accent2} />
            </View>
          </View>
          <Text style={styles.emptyTitle}>No call threads yet</Text>
          <Text style={styles.emptySubtitle}>
            Your call thread will appear here once you're matched with a student.
          </Text>
        </View>
      </View>
    );
  }

  // Single student: go straight into the chat (no picker needed)
  // Multiple students: show picker unless one has already been selected
  const convoToShow =
    conversations.length === 1
      ? conversations[0].id
      : selectedConvoId;

  if (convoToShow) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <InlineChat
          conversationId={convoToShow}
          userId={user!.id}
          role="mentor"
          onBack={conversations.length > 1 ? () => setSelectedConvoId(null) : undefined}
        />
      </View>
    );
  }

  // ── Student picker (mentor with 2+ students) ──────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: Colors.mentorHeaderBg }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrowText}>CALLS</Text>
          <Text style={styles.title}>Call Threads</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{conversations.length}</Text>
        </View>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const student = (item as any).student;
          const isUnread = item.mentor_unread > 0;
          return (
            <TouchableOpacity
              style={[styles.convoItem, isUnread && styles.convoItemUnread]}
              onPress={() => setSelectedConvoId(item.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${student?.full_name ?? 'student'}`}
            >
              {isUnread && <View style={styles.unreadAccent} />}
              <Avatar uri={student?.avatar_url} name={student?.full_name} size={46} />
              <View style={styles.convoInfo}>
                <View style={styles.convoTop}>
                  <Text
                    style={[styles.convoName, isUnread && styles.convoNameUnread]}
                    numberOfLines={1}
                  >
                    {student?.full_name ?? 'Student'}
                  </Text>
                  <Text style={[styles.convoTime, isUnread && styles.convoTimeUnread]}>
                    {formatTime(item.last_message_at)}
                  </Text>
                </View>
                <View style={styles.convoBottom}>
                  <Text
                    style={[styles.convoLast, isUnread && styles.convoLastBold]}
                    numberOfLines={1}
                  >
                    {item.last_message ?? 'No messages yet'}
                  </Text>
                  {isUnread && (
                    <View style={styles.unreadOuter}>
                      <View style={styles.unreadInner}>
                        <Text style={styles.unreadText}>{item.mentor_unread}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Shared header (mentor list view) ─────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    backgroundColor: Colors.primaryDark,
  },
  eyebrowText: {
    ...Typography.caption, color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.sansBold, letterSpacing: 1.5, marginBottom: 4,
  },
  title: { ...Typography.displaySm, color: Colors.white, flex: 1 },
  countPill: {
    minWidth: 26, height: 26, borderRadius: Radius.full,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, marginBottom: 4,
  },
  countPillText: { ...Typography.bodySm, color: Colors.white, fontFamily: Fonts.sansBold },

  // ── Empty state ───────────────────────────────────────────────────────────
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  emptyOuter: {
    padding: 4,
    backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryGlow,
  },
  emptyInner: {
    width: 80, height: 80,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { ...Typography.headingLg, color: Colors.dark },
  emptySubtitle: { ...Typography.bodyMd, color: Colors.gray500, textAlign: 'center' },
  discoverOuter: {
    marginTop: 4, borderRadius: Radius.full,
    backgroundColor: Colors.primary, ...Shadow.teal,
  },
  discoverInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.full,
  },
  discoverBtnText: { ...Typography.bodyMd, color: Colors.white, fontFamily: Fonts.sansBold },
  discoverArrow: {
    width: 24, height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },

  // ── Chat back button (multi-student mentor only) ──────────────────────────
  chatBackBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Student inline chat: header ───────────────────────────────────────────
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.white,
    borderBottomWidth: 1, borderColor: Colors.gray100,
  },
  headerUser: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatarSkeleton: { width: 38, height: 38, backgroundColor: Colors.gray200 },
  chatHeaderName: { fontSize: 15, fontWeight: '700', color: Colors.dark },
  chatHeaderRole: { fontSize: 12, color: Colors.primary, marginTop: 1, fontFamily: Fonts.sansMedium },
  infoBtn: {
    width: 44, height: 44,
    backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
  },

  // ── Meeting chip ──────────────────────────────────────────────────────────
  meetingChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryLight, borderBottomWidth: 1,
    borderColor: Colors.primaryGlow, paddingHorizontal: 16, paddingVertical: 8,
  },
  meetingChipText: {
    ...Typography.bodySm, color: Colors.primary,
    fontFamily: Fonts.sansMedium, flex: 1,
  },

  // ── Meeting link edit row ─────────────────────────────────────────────────
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
  linkSaveBtnText: { fontSize: 13, fontFamily: Fonts.sansBold, color: Colors.white },

  // ── Empty chat (no messages yet) ──────────────────────────────────────────
  emptyChat: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 14,
  },
  emptyChatTitle: {
    fontSize: 18, fontWeight: '700', color: Colors.dark, textAlign: 'center', lineHeight: 26,
  },
  emptyChatSub: { fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 20 },
  suggestions: { alignSelf: 'stretch', gap: 8, marginTop: 8 },
  suggestion: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: Colors.primaryGlow,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  suggestionText: { fontSize: 14, color: Colors.primary, fontWeight: '500', flex: 1 },

  // ── Message list ──────────────────────────────────────────────────────────
  messageList: { paddingVertical: 12, paddingHorizontal: 4 },

  // ── Cards section (reschedule + schedule — above messages) ────────────────
  cardsSection: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },

  // ── Chat input ────────────────────────────────────────────────────────────
  chatInputContainer: {
    backgroundColor: Colors.white,
    borderTopWidth: 1, borderColor: Colors.gray100,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
  },
  textInput: {
    flex: 1, backgroundColor: Colors.background, borderRadius: Radius.xl,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: Colors.dark, maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.gray300, shadowOpacity: 0, elevation: 0 },

  // ── Mentor list items ─────────────────────────────────────────────────────
  list: { paddingVertical: 8, paddingBottom: 16 },
  convoItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    backgroundColor: Colors.white, position: 'relative',
  },
  convoItemUnread: { backgroundColor: Colors.primaryLight },
  unreadAccent: {
    position: 'absolute', left: 0, top: 12, bottom: 12,
    width: 3, borderRadius: 2, backgroundColor: Colors.accent2,
  },
  convoInfo: { flex: 1 },
  convoTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 5,
  },
  convoName: { ...Typography.headingSm, color: Colors.dark, flex: 1 },
  convoNameUnread: { fontFamily: Fonts.sansBold },
  convoTime: { ...Typography.caption, color: Colors.gray400, marginLeft: 8 },
  convoTimeUnread: { color: Colors.primary, fontFamily: Fonts.sansSemiBold },
  convoBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convoLast: { ...Typography.bodyMd, color: Colors.gray500, flex: 1 },
  convoLastBold: { color: Colors.dark, fontFamily: Fonts.sansSemiBold },
  unreadOuter: { borderRadius: Radius.full, backgroundColor: Colors.accent2, ...Shadow.sm },
  unreadInner: {
    minWidth: 16, height: 16, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  unreadText: { ...Typography.caption, color: Colors.white, fontFamily: Fonts.sansBold },
  separator: { height: 1, backgroundColor: Colors.gray100, marginLeft: 84 },
});
