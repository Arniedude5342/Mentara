import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow, Fonts } from '@/constants/theme';
import { Meeting } from '@/lib/types';
import { isGCalAuthorized, authorizeGoogleCalendar, createGCalEvent } from '@/lib/googleCalendar';

interface ScheduleCallCardProps {
  conversationId: string;
  studentId: string;
  mentorId: string;
  scheduledBy: string;
  isFirstMeeting: boolean;
  onScheduled: (meeting: Meeting) => void;
}

type Platform = Meeting['platform'];

const PLATFORMS: { key: Platform; label: string; icon: any }[] = [
  { key: 'zoom', label: 'Zoom', icon: 'videocam-outline' },
  { key: 'google_meet', label: 'Google Meet', icon: 'logo-google' },
  { key: 'teams', label: 'Teams', icon: 'people-outline' },
  { key: 'facetime', label: 'FaceTime', icon: 'phone-portrait-outline' },
  { key: 'other', label: 'Other', icon: 'link-outline' },
];

export default function ScheduleCallCard({
  conversationId,
  studentId,
  mentorId,
  scheduledBy,
  isFirstMeeting,
  onScheduled,
}: ScheduleCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [platform, setPlatform] = useState<Platform>('zoom');
  const [meetingLink, setMeetingLink] = useState('');
  const [dateText, setDateText] = useState('');
  const [saving, setSaving] = useState(false);
  const [scheduledMeeting, setScheduledMeeting] = useState<Meeting | null>(null);
  const [calAdding, setCalAdding] = useState(false);
  const [calAdded, setCalAdded] = useState(false);
  const schedulingRef = useRef(false);
  const parsedDateRef = useRef<Date | null>(null);
  // Stable UUID generated on first submit attempt and reused on network retries,
  // so the DB idempotency constraint returns the existing row instead of inserting twice.
  const idempotencyKeyRef = useRef<string>('');

  const parseFlexDate = (text: string): Date | null => {
    const cleaned = text.trim();
    const m1 = cleaned.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i
    );
    if (m1) {
      let h = parseInt(m1[4], 10);
      const min = parseInt(m1[5], 10);
      const ampm = m1[6];
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      }
      return new Date(parseInt(m1[3], 10), parseInt(m1[1], 10) - 1, parseInt(m1[2], 10), h, min);
    }
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  };

  const promptAddToCalendar = (meeting: Meeting, startDate: Date) => {
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    Alert.alert(
      'Add to Calendar?',
      "Don't miss your call — add it to your calendar now.",
      [
        {
          text: 'Add to Calendar',
          onPress: () => handleAddToCalendar(meeting, startDate, endDate),
        },
        { text: 'Not now', style: 'cancel' },
      ],
    );
  };

  const handleConfirm = async () => {
    if (schedulingRef.current || saving) return;

    if (!dateText.trim()) {
      Alert.alert('Required', 'Please enter a date and time for the call.');
      return;
    }

    const parsed = parseFlexDate(dateText);
    if (!parsed) {
      Alert.alert('Invalid date', 'Please enter a date like "05/25/2026 at 3:00 PM".');
      return;
    }
    if (parsed <= new Date()) {
      Alert.alert('Invalid date', 'Please select a future date and time.');
      return;
    }

    parsedDateRef.current = parsed;
    schedulingRef.current = true;
    setSaving(true);
    // Generate the key once on the first attempt; retries reuse the same key.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    try {
      const { scheduleMeeting } = await import('@/lib/meetings');
      const meeting = await scheduleMeeting(
        conversationId,
        studentId,
        mentorId,
        parsed,
        platform,
        meetingLink.trim() || null,
        isFirstMeeting,
        idempotencyKeyRef.current,
        scheduledBy,
      );
      if (meeting) {
        setScheduledMeeting(meeting);
        onScheduled(meeting);
        // Auto-prompt after a short delay so the UI settles first.
        setTimeout(() => promptAddToCalendar(meeting, parsed), 400);
      } else {
        Alert.alert('Error', 'Failed to schedule the call. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Something went wrong.');
    } finally {
      schedulingRef.current = false;
      setSaving(false);
    }
  };

  const handleAddToCalendar = async (
    meeting: Meeting,
    startDate: Date,
    endDate: Date,
  ) => {
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
      const description = meeting.meeting_link
        ? `Join link: ${meeting.meeting_link}`
        : 'Mentara mentorship session';
      const eventUrl = await createGCalEvent({
        title: 'Mentara Mentorship Call',
        startDate,
        endDate,
        description,
        reminderMinutes: 15,
      });
      if (eventUrl) {
        setCalAdded(true);
      } else {
        Alert.alert('Calendar', 'Could not add the event. You can try again below.');
      }
    } catch {
      Alert.alert('Calendar', 'Something went wrong. Please try again.');
    } finally {
      setCalAdding(false);
    }
  };

  const handleAddToCalendarPress = () => {
    if (calAdding || calAdded || !scheduledMeeting || !parsedDateRef.current) return;
    const endDate = new Date(parsedDateRef.current.getTime() + 60 * 60 * 1000);
    handleAddToCalendar(scheduledMeeting, parsedDateRef.current, endDate);
  };

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsed}
        onPress={() => setExpanded(true)}
        activeOpacity={0.85}
        accessibilityLabel="Schedule your first call"
        accessibilityRole="button"
      >
        <View style={styles.collapsedLeft}>
          <View style={styles.collapsedIcon}>
            <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
          </View>
          <View>
            <Text style={styles.collapsedTitle}>
              {isFirstMeeting ? 'Schedule your first call' : 'Schedule your next call'}
            </Text>
            <Text style={styles.collapsedSub}>Tap to pick a time and share a meeting link</Text>
          </View>
        </View>
        <Ionicons name="chevron-up" size={18} color={Colors.gray400} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
          <Text style={styles.cardTitle}>Schedule a call</Text>
        </View>
        <TouchableOpacity onPress={() => setExpanded(false)} accessibilityLabel="Collapse" accessibilityRole="button">
          <Ionicons name="chevron-down" size={20} color={Colors.gray400} />
        </TouchableOpacity>
      </View>

      {/* Platform selector */}
      <Text style={styles.fieldLabel}>Platform</Text>
      <View style={styles.platformRow}>
        {PLATFORMS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.platformChip, platform === p.key && styles.platformChipActive]}
            onPress={() => setPlatform(p.key)}
            accessibilityLabel={`Use ${p.label}`}
            accessibilityRole="button"
          >
            <Ionicons
              name={p.icon}
              size={14}
              color={platform === p.key ? Colors.white : Colors.gray500}
            />
            <Text style={[styles.platformChipText, platform === p.key && styles.platformChipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Meeting link */}
      <Text style={styles.fieldLabel}>Call link (optional)</Text>
      <TextInput
        style={styles.input}
        value={meetingLink}
        onChangeText={setMeetingLink}
        placeholder="https://zoom.us/j/..."
        placeholderTextColor={Colors.gray400}
        autoCapitalize="none"
        keyboardType="url"
        accessibilityLabel="Meeting link"
      />

      {/* Date & time */}
      <Text style={styles.fieldLabel}>Date & time</Text>
      <TextInput
        style={styles.input}
        value={dateText}
        onChangeText={setDateText}
        placeholder="month/day/year at (time)"
        placeholderTextColor={Colors.gray400}
        accessibilityLabel="Date and time"
      />
      <Text style={styles.inputHint}>e.g. 05/25/2026 at 3:00 PM</Text>

      <TouchableOpacity
        style={[styles.confirmBtn, (saving || !!scheduledMeeting) && styles.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={saving || !!scheduledMeeting}
        activeOpacity={0.85}
        accessibilityLabel="Confirm call"
        accessibilityRole="button"
      >
        {saving ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : scheduledMeeting ? (
          <>
            <Ionicons name="checkmark-circle" size={18} color={Colors.white} />
            <Text style={styles.confirmBtnText}>Call Scheduled!</Text>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
            <Text style={styles.confirmBtnText}>Confirm Call</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Calendar button — appears after scheduling, in case they dismissed the auto-prompt */}
      {scheduledMeeting && (
        <TouchableOpacity
          style={[styles.calBtn, calAdded && styles.calBtnDone]}
          onPress={handleAddToCalendarPress}
          disabled={calAdding || calAdded}
          activeOpacity={0.85}
          accessibilityLabel="Add to Calendar"
          accessibilityRole="button"
        >
          {calAdding ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : calAdded ? (
            <>
              <Ionicons name="checkmark-circle" size={16} color={Colors.accent3} />
              <Text style={[styles.calBtnText, { color: Colors.accent3 }]}>Added to Calendar</Text>
            </>
          ) : (
            <>
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <Text style={styles.calBtnText}>Add to Calendar</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {scheduledMeeting && (
        <View style={styles.inviteStatusChip}>
          <Ionicons name="time-outline" size={13} color={Colors.gray500} />
          <Text style={styles.inviteStatusText}>
            {scheduledBy === studentId ? 'Awaiting mentor confirmation' : 'Awaiting student confirmation'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
    marginHorizontal: 12, marginBottom: 8,
  },
  collapsedLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  collapsedIcon: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  collapsedTitle: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.dark },
  collapsedSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.gray400, marginTop: 2 },

  card: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 16, marginHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.md, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.dark },

  fieldLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.gray500, marginBottom: -4 },

  platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  platformChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  platformChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  platformChipText: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.gray700 },
  platformChipTextActive: { color: Colors.white },

  input: {
    backgroundColor: Colors.gray100, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray200,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: Fonts.sans, fontSize: 14, color: Colors.dark,
  },
  inputHint: {
    fontFamily: Fonts.sans, fontSize: 11, color: Colors.gray400, marginTop: -6,
  },

  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 13, marginTop: 4,
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.white },

  calBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.md, paddingVertical: 11,
    borderWidth: 1.5, borderColor: Colors.primaryGlow,
    backgroundColor: Colors.primaryLight,
  },
  calBtnDone: {
    borderColor: Colors.accent3 + '40',
    backgroundColor: Colors.accent3 + '12',
  },
  calBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.primary },

  inviteStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.gray100, borderRadius: Radius.sm,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'center',
  },
  inviteStatusText: {
    fontSize: 12, color: Colors.gray500, fontFamily: Fonts.sans,
  },
});
