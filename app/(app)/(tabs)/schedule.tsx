import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Animated, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useConversations } from '@/hooks/useMessages';
import Avatar from '@/components/ui/Avatar';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import {
  getStudentMeetings, getMentorMeetings, updateMeetingOutcome,
  getActionItems, addActionItem, toggleActionItem, deleteActionItem,
  respondToMeetingInviteInApp,
} from '@/lib/meetings';
import { isGCalAuthorized, authorizeGoogleCalendar, createGCalEvent } from '@/lib/googleCalendar';
import { ActionItem } from '@/lib/types';

// ── Platform metadata ─────────────────────────────────────────
const PLATFORM_META: Record<string, { label: string; color: string }> = {
  zoom: { label: 'Zoom', color: '#2D8CFF' },
  google_meet: { label: 'Google Meet', color: '#00897B' },
  teams: { label: 'Microsoft Teams', color: '#6264A7' },
  facetime: { label: 'FaceTime', color: '#34C759' },
  other: { label: 'Video Call', color: Colors.gray500 },
};

function formatMeetingDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isUpcoming(dateStr: string): boolean {
  return new Date(dateStr) > new Date();
}

// ── Meeting card ───────────────────────────────────────────────
function MeetingCard({
  meeting, role, userId, onNotes, onRespond,
}: {
  meeting: any;
  role: 'student' | 'mentor';
  userId: string;
  onNotes: (m: any) => void;
  onRespond: (meetingId: string, action: 'confirmed' | 'declined') => Promise<void>;
}) {
  const upcoming = isUpcoming(meeting.scheduled_at);
  const other = role === 'student' ? meeting.mentor : meeting.student;
  const otherDetails = role === 'student' ? other?.mentor_profiles : null;
  const platform = PLATFORM_META[meeting.platform] ?? PLATFORM_META.other;
  const myNotes = role === 'student' ? meeting.student_notes : meeting.mentor_notes;

  const [respondLoading, setRespondLoading] = useState<'confirmed' | 'declined' | null>(null);
  const [calAdding, setCalAdding] = useState(false);
  const [calAdded, setCalAdded] = useState(false);

  // I am the non-scheduler if scheduled_by is set and differs from my id,
  // OR if scheduled_by is null and I'm the mentor (old meetings assumed student scheduled)
  const scheduledBy: string | null = meeting.scheduled_by ?? null;
  const isNonScheduler = scheduledBy ? scheduledBy !== userId : role === 'mentor';
  const showRespondButtons = upcoming && meeting.invite_status === 'pending' && isNonScheduler;
  const showAwaitingBadge = upcoming && meeting.invite_status === 'pending' && !isNonScheduler;

  const handleRespond = async (action: 'confirmed' | 'declined') => {
    if (respondLoading) return;
    const label = action === 'confirmed' ? 'Accept' : 'Decline';
    Alert.alert(
      `${label} Meeting?`,
      action === 'confirmed'
        ? 'Confirm this meeting? Both you and the other party will receive a confirmation email.'
        : 'Decline this meeting? The other party will be notified to reschedule.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: label,
          style: action === 'declined' ? 'destructive' : 'default',
          onPress: async () => {
            setRespondLoading(action);
            await onRespond(meeting.id, action);
            setRespondLoading(null);
          },
        },
      ],
    );
  };

  const handleAddToCalendar = async () => {
    if (calAdding || calAdded) return;
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
      const startDate = new Date(meeting.scheduled_at);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const eventUrl = await createGCalEvent({
        title: 'Mentara Mentorship Call',
        startDate,
        endDate,
        description: meeting.meeting_link ? `Join link: ${meeting.meeting_link}` : 'Mentara mentorship session',
        reminderMinutes: 15,
      });
      if (eventUrl) {
        setCalAdded(true);
      } else {
        Alert.alert('Calendar', 'Could not add the event. Please try again.');
      }
    } catch {
      Alert.alert('Calendar', 'Something went wrong. Please try again.');
    } finally {
      setCalAdding(false);
    }
  };

  return (
    <View style={styles.meetingCard}>
      <View style={[styles.meetingStatusBar, { backgroundColor: upcoming ? Colors.accent3 : Colors.gray300 }]} />
      <View style={styles.meetingCardContent}>
        <View style={styles.meetingCardTop}>
          <View style={[styles.platformBadge, { backgroundColor: platform.color + '18' }]}>
            <Ionicons name="videocam-outline" size={12} color={platform.color} />
            <Text style={[styles.platformLabel, { color: platform.color }]}>{platform.label}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: upcoming ? Colors.accent3Light : Colors.gray100 }]}>
            <Text style={[styles.statusBadgeText, { color: upcoming ? Colors.accent3 : Colors.gray500 }]}>
              {upcoming ? 'Upcoming' : meeting.occurred ? 'Completed' : 'Past'}
            </Text>
          </View>
        </View>

        {/* Confirmed / declined badge (non-pending states) */}
        {upcoming && meeting.invite_status === 'confirmed' && (
          <View style={[styles.inviteBadge, { backgroundColor: Colors.accent3Light }]}>
            <Ionicons name="checkmark-circle" size={12} color={Colors.accent3} />
            <Text style={[styles.inviteBadgeText, { color: Colors.accent3 }]}>Confirmed</Text>
          </View>
        )}
        {upcoming && meeting.invite_status === 'declined' && (
          <View style={[styles.inviteBadge, { backgroundColor: Colors.accent2Light }]}>
            <Ionicons name="close-circle" size={12} color={Colors.accent2} />
            <Text style={[styles.inviteBadgeText, { color: Colors.accent2 }]}>Declined — Please Reschedule</Text>
          </View>
        )}

        {/* Awaiting badge for the person who scheduled */}
        {showAwaitingBadge && (
          <View style={styles.invitePending}>
            <Ionicons name="time-outline" size={11} color={Colors.gray400} />
            <Text style={styles.invitePendingText}>
              Awaiting {scheduledBy === meeting.student_id || !scheduledBy ? 'mentor' : 'student'} confirmation
            </Text>
          </View>
        )}

        {/* In-app accept / decline for the non-scheduler */}
        {showRespondButtons && (
          <View style={styles.respondRow}>
            <TouchableOpacity
              style={[styles.respondBtn, styles.respondBtnAccept]}
              onPress={() => handleRespond('confirmed')}
              disabled={!!respondLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Accept meeting"
            >
              {respondLoading === 'confirmed' ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={14} color={Colors.white} />
                  <Text style={styles.respondBtnText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.respondBtn, styles.respondBtnDecline]}
              onPress={() => handleRespond('declined')}
              disabled={!!respondLoading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Decline meeting"
            >
              {respondLoading === 'declined' ? (
                <ActivityIndicator size="small" color={Colors.accent2} />
              ) : (
                <>
                  <Ionicons name="close" size={14} color={Colors.accent2} />
                  <Text style={[styles.respondBtnText, { color: Colors.accent2 }]}>Decline</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Message to reschedule when declined and user was the scheduler */}
        {upcoming && meeting.invite_status === 'declined' && !isNonScheduler && (
          <TouchableOpacity
            style={styles.rescheduleBtn}
            onPress={() => router.push('/(app)/(tabs)/messages' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Go to chat to reschedule this meeting"
          >
            <Ionicons name="chatbubble-outline" size={13} color={Colors.white} />
            <Text style={styles.rescheduleBtnText}>Message to Reschedule</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.meetingDate}>{formatMeetingDate(meeting.scheduled_at)}</Text>

        {other && (
          <View style={styles.personRow}>
            <Avatar uri={other.avatar_url} name={other.full_name} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.personName} numberOfLines={1}>{other.full_name ?? 'Unknown'}</Text>
              {otherDetails?.title && (
                <Text style={styles.personTitle} numberOfLines={1}>{otherDetails.title}</Text>
              )}
            </View>
          </View>
        )}

        {/* Add to Google Calendar — visible for confirmed upcoming meetings on both sides */}
        {upcoming && meeting.invite_status === 'confirmed' && (
          <TouchableOpacity
            style={[styles.calBtn, calAdded && styles.calBtnDone]}
            onPress={handleAddToCalendar}
            disabled={calAdding || calAdded}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={calAdded ? 'Added to calendar' : 'Add to Google Calendar'}
          >
            {calAdding ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : calAdded ? (
              <>
                <Ionicons name="checkmark-circle" size={14} color={Colors.accent3} />
                <Text style={[styles.calBtnText, { color: Colors.accent3 }]}>Added to Calendar</Text>
              </>
            ) : (
              <>
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.calBtnText}>Add to Google Calendar</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {!upcoming && (
          <TouchableOpacity
            style={[styles.notesBtn, !!myNotes && styles.notesBtnFilled]}
            onPress={() => onNotes(meeting)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={myNotes ? 'View or edit notes' : 'Add notes'}
          >
            <Ionicons
              name={myNotes ? 'document-text' : 'document-text-outline'}
              size={14}
              color={myNotes ? Colors.primary : Colors.gray500}
            />
            <Text style={[styles.notesBtnText, !!myNotes && styles.notesBtnTextFilled]}>
              {myNotes ? 'View Notes' : 'Add Notes'}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={myNotes ? Colors.primary : Colors.gray400} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Action item row ────────────────────────────────────────────
function ActionItemRow({
  item, onToggle, onDelete,
}: {
  item: ActionItem;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const overdue = item.due_date && !item.completed && new Date(item.due_date + 'T00:00:00') < new Date();

  return (
    <View style={[styles.actionRow, item.completed && styles.actionRowDone]}>
      <TouchableOpacity
        style={[styles.checkbox, item.completed && styles.checkboxChecked]}
        onPress={() => onToggle(item.id, !item.completed)}
        accessibilityRole="checkbox"
        accessibilityLabel={item.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {item.completed && <Ionicons name="checkmark" size={13} color={Colors.white} />}
      </TouchableOpacity>

      <View style={styles.actionContent}>
        <Text style={[styles.actionText, item.completed && styles.actionTextDone]}>
          {item.content}
        </Text>
        {item.due_date && (
          <Text style={[styles.dueDateText, overdue && styles.dueDateOverdue]}>
            {formatDueDate(item.due_date)}
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={() => onDelete(item.id)}
        style={styles.deleteBtn}
        accessibilityRole="button"
        accessibilityLabel="Delete action item"
      >
        <Ionicons name="close" size={16} color={Colors.gray300} />
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────
export default function MeetingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const role = (profile?.role ?? 'student') as 'student' | 'mentor';
  const isStudent = role === 'student';
  const roleColor = isStudent ? Colors.primary : Colors.accent2;

  const { conversations } = useConversations(user?.id ?? '');
  const conversationId = conversations[0]?.id ?? null;

  const [meetings, setMeetings] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Notes modal
  const [notesModal, setNotesModal] = useState<{ meeting: any; text: string } | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  // Add action item input
  const [newItem, setNewItem] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!user) return;
    // Guard against concurrent fetches triggered by rapid tab-switching via useFocusEffect
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [meetingData, itemData] = await Promise.all([
        isStudent ? getStudentMeetings(user.id) : getMentorMeetings(user.id),
        conversationId ? getActionItems(conversationId) : Promise.resolve([]),
      ]);
      setMeetings(meetingData);
      setActionItems(itemData);
      Animated.stagger(80, [
        Animated.timing(headerFade, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(contentFade, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [user?.id, conversationId, isStudent]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Re-fetch action items if conversationId arrives after tab is already focused
  // (useConversations resolves async so the first load() may run with conversationId = null)
  useEffect(() => {
    if (conversationId) load();
  }, [conversationId, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openNotes = (meeting: any) => {
    const myNotes = isStudent ? meeting.student_notes : meeting.mentor_notes;
    setNotesModal({ meeting, text: myNotes ?? '' });
  };

  const handleSaveNotes = async () => {
    if (!notesModal) return;
    setSavingNotes(true);
    await updateMeetingOutcome(
      notesModal.meeting.id,
      notesModal.meeting.occurred ?? false,
      isStudent ? notesModal.text : undefined,
      !isStudent ? notesModal.text : undefined,
    );
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === notesModal.meeting.id
          ? isStudent
            ? { ...m, student_notes: notesModal.text }
            : { ...m, mentor_notes: notesModal.text }
          : m
      )
    );
    setSavingNotes(false);
    setNotesModal(null);
  };

  const handleAddItem = async () => {
    if (!newItem.trim() || !conversationId || !user || addingItem) return;
    setAddingItem(true);
    const item = await addActionItem(conversationId, user.id, newItem.trim());
    if (item) {
      setActionItems((prev) => [...prev, item]);
      setNewItem('');
    }
    setAddingItem(false);
  };

  const handleToggle = async (id: string, completed: boolean) => {
    setActionItems((prev) => prev.map((i) => i.id === id ? { ...i, completed } : i));
    await toggleActionItem(id, completed);
  };

  const handleDelete = (id: string) => {
    Alert.alert('Remove item', 'Remove this action item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setActionItems((prev) => prev.filter((i) => i.id !== id));
          await deleteActionItem(id);
        },
      },
    ]);
  };

  const handleRespond = useCallback(async (meetingId: string, action: 'confirmed' | 'declined') => {
    if (!user || !profile) return;
    const meeting = meetings.find((m) => m.id === meetingId);
    if (!meeting) return;
    const ok = await respondToMeetingInviteInApp(
      meetingId,
      meeting.conversation_id,
      action,
      user.id,
      meeting.scheduled_by ?? null,
      meeting.student_id,
      profile.full_name ?? (role === 'mentor' ? 'Your mentor' : 'Your student'),
    );
    if (ok) {
      setMeetings((prev) =>
        prev.map((m) => m.id === meetingId ? { ...m, invite_status: action } : m)
      );
    }
  }, [user, profile, role, meetings]);

  const upcoming = meetings.filter((m) => isUpcoming(m.scheduled_at));
  const past = meetings.filter((m) => !isUpcoming(m.scheduled_at));
  const openItems = actionItems.filter((i) => !i.completed);
  const doneItems = actionItems.filter((i) => i.completed);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <Animated.View style={{ opacity: headerFade }}>
        <View style={[styles.header, { backgroundColor: isStudent ? Colors.primaryDark : Colors.mentorHeaderBg }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrowText}>SCHEDULE</Text>
            <Text style={styles.title}>Meetings</Text>
          </View>
          {meetings.length > 0 && (
            <View style={styles.countOuter}>
              <View style={styles.countInner}>
                <Ionicons name="calendar" size={10} color={Colors.white} />
                <Text style={styles.countText}>{meetings.length}</Text>
              </View>
            </View>
          )}
        </View>
      </Animated.View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={roleColor} size="large" />
        </View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: contentFade }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={roleColor} />}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Upcoming meetings ─────────────────────────── */}
            {upcoming.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <View style={[styles.sectionDot, { backgroundColor: Colors.accent3 }]} />
                  <Text style={[styles.sectionLabel, { color: Colors.accent3 }]}>UPCOMING</Text>
                </View>
                {upcoming.map((m) => (
                  <MeetingCard key={m.id} meeting={m} role={role} userId={user?.id ?? ''} onNotes={openNotes} onRespond={handleRespond} />
                ))}
              </View>
            )}

            {/* ── Action items ──────────────────────────────── */}
            {conversationId && (
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <View style={[styles.sectionDot, { backgroundColor: roleColor }]} />
                  <Text style={[styles.sectionLabel, { color: roleColor }]}>ACTION ITEMS</Text>
                  {openItems.length > 0 && (
                    <View style={[styles.itemCountPill, { backgroundColor: roleColor }]}>
                      <Text style={styles.itemCountText}>{openItems.length}</Text>
                    </View>
                  )}
                </View>

                {/* Add new item */}
                <View style={styles.addItemRow}>
                  <TextInput
                    style={styles.addItemInput}
                    value={newItem}
                    onChangeText={setNewItem}
                    placeholder="Add an action item..."
                    placeholderTextColor={Colors.gray400}
                    maxLength={500}
                    returnKeyType="done"
                    onSubmitEditing={handleAddItem}
                    accessibilityLabel="New action item"
                  />
                  <TouchableOpacity
                    style={[styles.addItemBtn, { backgroundColor: roleColor }, (!newItem.trim() || addingItem) && styles.addItemBtnDisabled]}
                    onPress={handleAddItem}
                    disabled={!newItem.trim() || addingItem}
                    accessibilityRole="button"
                    accessibilityLabel="Add item"
                  >
                    {addingItem
                      ? <ActivityIndicator size="small" color={Colors.white} />
                      : <Ionicons name="add" size={20} color={Colors.white} />
                    }
                  </TouchableOpacity>
                </View>

                {openItems.length === 0 && doneItems.length === 0 ? (
                  <View style={styles.emptyItems}>
                    <Text style={styles.emptyItemsText}>
                      No action items yet. Add things to work on between calls.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.actionList}>
                    {openItems.map((item) => (
                      <ActionItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
                    ))}
                    {doneItems.length > 0 && (
                      <>
                        <Text style={styles.doneSectionLabel}>COMPLETED</Text>
                        {doneItems.map((item) => (
                          <ActionItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
                        ))}
                      </>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* ── Past meetings ─────────────────────────────── */}
            {past.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionLabelRow}>
                  <View style={[styles.sectionDot, { backgroundColor: Colors.gray400 }]} />
                  <Text style={[styles.sectionLabel, { color: Colors.gray500 }]}>PAST MEETINGS</Text>
                </View>
                {past.map((m) => (
                  <MeetingCard key={m.id} meeting={m} role={role} userId={user?.id ?? ''} onNotes={openNotes} onRespond={handleRespond} />
                ))}
              </View>
            )}

            {/* Empty state — no meetings and no match yet */}
            {meetings.length === 0 && !conversationId && (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyOuter, !isStudent && { backgroundColor: Colors.accent2Light, borderColor: Colors.accent2Glow }]}>
                  <View style={[styles.emptyInner, !isStudent && { backgroundColor: Colors.accent2Light }]}>
                    <Ionicons name="calendar-outline" size={36} color={roleColor} />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>No meetings yet</Text>
                <Text style={styles.emptySubtitle}>
                  {isStudent
                    ? "Once you're matched with a mentor, you can schedule monthly calls from your Mentor page."
                    : "Your call schedule will appear here once you're matched with a student."}
                </Text>
                {isStudent && (
                  <TouchableOpacity
                    style={[styles.emptyCtaOuter, { backgroundColor: roleColor }]}
                    onPress={() => router.push('/(app)/(tabs)/discover')}
                    accessibilityLabel="Go to My Mentor"
                    accessibilityRole="button"
                  >
                    <View style={styles.emptyCtaInner}>
                      <Text style={styles.emptyCtaText}>Go to My Mentor</Text>
                      <View style={styles.emptyCtaArrow}>
                        <Ionicons name="arrow-forward" size={13} color={Colors.white} />
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* ── Notes modal ───────────────────────────────────────── */}
      <Modal
        visible={notesModal !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setNotesModal(null)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.notesModalOverlay}>
            <TouchableOpacity
              style={styles.notesModalBackdrop}
              onPress={() => setNotesModal(null)}
              activeOpacity={1}
              accessibilityLabel="Close notes"
              accessibilityRole="button"
            />
            <View style={styles.notesModalSheet}>
              <View style={styles.notesModalDragHandle} />
              <View style={styles.notesModalHeader}>
                <View>
                  <Text style={styles.notesModalTitle}>Meeting Notes</Text>
                  {notesModal && (
                    <Text style={styles.notesModalDate}>{formatMeetingDate(notesModal.meeting.scheduled_at)}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setNotesModal(null)} accessibilityLabel="Close" accessibilityRole="button">
                  <Ionicons name="close-circle" size={26} color={Colors.gray300} />
                </TouchableOpacity>
              </View>
              <View style={styles.notesInputWrap}>
                <TextInput
                  style={styles.notesInput}
                  multiline
                  placeholder="What did you discuss? Any follow-ups or takeaways..."
                  placeholderTextColor={Colors.gray400}
                  value={notesModal?.text ?? ''}
                  onChangeText={(t) => setNotesModal((prev) => prev ? { ...prev, text: t } : null)}
                  textAlignVertical="top"
                  maxLength={2000}
                  autoFocus
                  accessibilityLabel="Meeting notes"
                />
              </View>
              <TouchableOpacity
                style={[styles.notesSaveBtn, { backgroundColor: roleColor }, savingNotes && styles.notesSaveBtnDisabled]}
                onPress={handleSaveNotes}
                disabled={savingNotes}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Save notes"
              >
                {savingNotes ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color={Colors.white} />
                    <Text style={styles.notesSaveBtnText}>Save Notes</Text>
                  </>
                )}
              </TouchableOpacity>
              <View style={{ height: 16 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
  },
  eyebrowText: {
    ...Typography.caption, color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.sansBold, letterSpacing: 1.5, marginBottom: 4,
  },
  title: { ...Typography.displaySm, color: Colors.white },
  countOuter: {
    borderRadius: Radius.full, padding: 2,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 2,
  },
  countInner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, height: 26, borderRadius: Radius.full,
  },
  countText: { ...Typography.bodySm, color: Colors.white, fontFamily: Fonts.sansBold },

  scrollContent: { padding: Spacing.md },

  section: { gap: 10, marginBottom: Spacing.xl },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionDot: { width: 7, height: 7, borderRadius: 3.5 },
  sectionLabel: { ...Typography.caption, fontFamily: Fonts.sansBold, letterSpacing: 1.4 },
  itemCountPill: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  itemCountText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  // ── Meeting card ───────────────────────────────────────────
  meetingCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', overflow: 'hidden', ...Shadow.sm,
  },
  meetingStatusBar: { width: 4 },
  meetingCardContent: { flex: 1, padding: 14, gap: 10 },
  meetingCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  platformBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
  },
  platformLabel: { ...Typography.caption, fontFamily: Fonts.sansSemiBold },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  statusBadgeText: { ...Typography.caption, fontFamily: Fonts.sansBold },
  meetingDate: { ...Typography.headingSm, color: Colors.dark },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personName: { ...Typography.bodySm, fontFamily: Fonts.sansBold, color: Colors.dark },
  personTitle: { ...Typography.caption, color: Colors.gray500 },
  notesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.md, backgroundColor: Colors.gray100,
    borderWidth: 1, borderColor: Colors.border, alignSelf: 'flex-start',
  },
  notesBtnFilled: { backgroundColor: Colors.primaryLight, borderColor: Colors.primaryGlow },
  notesBtnText: { ...Typography.bodySm, color: Colors.gray500, fontFamily: Fonts.sansMedium },
  notesBtnTextFilled: { color: Colors.primary, fontFamily: Fonts.sansSemiBold },

  inviteBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.sm, alignSelf: 'flex-start', marginTop: 6,
  },
  inviteBadgeText: { fontSize: 12, fontFamily: Fonts.sansMedium },
  invitePending: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5,
  },
  invitePendingText: { fontSize: 11, color: Colors.gray400, fontFamily: Fonts.sans },
  rescheduleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 8,
    alignSelf: 'flex-start', marginTop: 8,
  },
  rescheduleBtnText: {
    fontSize: 12, color: Colors.white, fontFamily: Fonts.sansBold,
  },

  respondRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  respondBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5,
  },
  respondBtnAccept: { backgroundColor: Colors.accent3, borderColor: Colors.accent3 },
  respondBtnDecline: { backgroundColor: 'transparent', borderColor: Colors.accent2 },
  respondBtnText: { fontSize: 13, fontFamily: Fonts.sansBold, color: Colors.white },

  calBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingVertical: 9, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.primaryGlow,
    backgroundColor: Colors.primaryLight,
  },
  calBtnDone: { borderColor: Colors.accent3 + '40', backgroundColor: Colors.accent3 + '12' },
  calBtnText: { fontSize: 13, fontFamily: Fonts.sansSemiBold, color: Colors.primary },

  // ── Action items ───────────────────────────────────────────
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addItemInput: {
    flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: Colors.dark, ...Shadow.sm,
  },
  addItemBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center', ...Shadow.sm,
  },
  addItemBtnDisabled: { opacity: 0.45 },

  emptyItems: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, alignItems: 'center',
  },
  emptyItemsText: { ...Typography.bodySm, color: Colors.gray400, textAlign: 'center' },

  actionList: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  actionRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  actionRowDone: { backgroundColor: Colors.gray100 },
  checkbox: {
    width: 22, height: 22,
    borderWidth: 2, borderColor: Colors.gray300,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxChecked: { backgroundColor: Colors.accent3, borderColor: Colors.accent3 },
  actionContent: { flex: 1, gap: 3 },
  actionText: { fontSize: 14, color: Colors.dark, lineHeight: 20 },
  actionTextDone: { color: Colors.gray400, textDecorationLine: 'line-through' },
  dueDateText: { fontSize: 12, color: Colors.gray500, fontFamily: Fonts.sansMedium },
  dueDateOverdue: { color: Colors.accent2 },
  deleteBtn: { padding: 2, marginTop: 2, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  doneSectionLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.gray400,
    letterSpacing: 1.2, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4,
  },

  // ── Empty state ────────────────────────────────────────────
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  emptyOuter: {
    padding: 4,
    backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryGlow,
  },
  emptyInner: {
    width: 80, height: 80,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { ...Typography.headingLg, color: Colors.dark, textAlign: 'center' },
  emptySubtitle: { ...Typography.bodyMd, color: Colors.gray500, textAlign: 'center', lineHeight: 22 },
  emptyCtaOuter: {
    marginTop: 4, borderRadius: Radius.full, padding: 3,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  emptyCtaInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  emptyCtaArrow: {
    width: 24, height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },

  // ── Notes modal ────────────────────────────────────────────
  notesModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  notesModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  notesModalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl,
  },
  notesModalDragHandle: {
    alignSelf: 'center', width: 38, height: 4, borderRadius: 2,
    backgroundColor: Colors.gray200, marginTop: 10, marginBottom: 4,
  },
  notesModalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  notesModalTitle: { ...Typography.headingMd, color: Colors.dark },
  notesModalDate: { ...Typography.bodySm, color: Colors.gray500, marginTop: 2 },
  notesInputWrap: {
    margin: 16, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, backgroundColor: Colors.background, minHeight: 160,
  },
  notesInput: {
    ...Typography.bodyMd, color: Colors.dark, padding: 14, minHeight: 160,
  },
  notesSaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, paddingVertical: 14, borderRadius: Radius.md,
  },
  notesSaveBtnDisabled: { opacity: 0.6 },
  notesSaveBtnText: { ...Typography.bodyMd, color: Colors.white, fontFamily: Fonts.sansBold },
});
