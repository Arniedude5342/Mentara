import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow, Fonts } from '@/constants/theme';
import { RescheduleRequest } from '@/lib/types';
import {
  requestReschedule, respondToReschedule, cancelReschedule,
} from '@/lib/meetings';

interface RescheduleCardProps {
  meetingId: string;
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  otherUserName: string;
  pendingRequest: RescheduleRequest | null;
  themeColor: string;
  themeColorLight: string;
  onRequestSent: (req: RescheduleRequest) => void;
  onResponded: () => void;
  onCancelled: () => void;
}

export default function RescheduleCard({
  meetingId,
  conversationId,
  currentUserId,
  currentUserName,
  otherUserName,
  pendingRequest,
  themeColor,
  themeColorLight,
  onRequestSent,
  onResponded,
  onCancelled,
}: RescheduleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [dateText, setDateText] = useState('');
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  const isRequester = pendingRequest?.requester_id === currentUserId;
  const isResponder = pendingRequest && !isRequester;

  const parseFlexDate = (text: string): Date | null => {
    const cleaned = text.trim();
    const m = cleaned.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i,
    );
    if (m) {
      let h = parseInt(m[4], 10);
      const min = parseInt(m[5], 10);
      const ampm = m[6];
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      }
      return new Date(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10), h, min);
    }
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  };

  const handleSendRequest = async () => {
    if (submittingRef.current || loading) return;
    const parsed = parseFlexDate(dateText);
    if (!parsed) {
      Alert.alert('Invalid date', 'Please enter a date like "05/30/2026 at 3:00 PM".');
      return;
    }
    if (parsed <= new Date()) {
      Alert.alert('Invalid date', 'Please select a future date and time.');
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    try {
      const req = await requestReschedule(
        meetingId, conversationId, currentUserId, parsed, currentUserName,
      );
      if (req) {
        setExpanded(false);
        setDateText('');
        onRequestSent(req);
      } else {
        Alert.alert('Error', 'Could not send reschedule request. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleRespond = async (action: 'approved' | 'declined') => {
    if (!pendingRequest || loading) return;
    setLoading(true);
    try {
      const proposedAt = new Date(pendingRequest.proposed_at);
      const ok = await respondToReschedule(
        pendingRequest.id, meetingId, conversationId,
        action, proposedAt, currentUserName,
      );
      if (ok) {
        onResponded();
      } else {
        Alert.alert('Error', 'Could not process your response. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!pendingRequest || loading) return;
    Alert.alert('Cancel request', 'Cancel your reschedule request?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const ok = await cancelReschedule(pendingRequest.id, conversationId);
          setLoading(false);
          if (ok) onCancelled();
        },
      },
    ]);
  };

  // ── Responder view: someone wants to reschedule ────────────────
  if (isResponder && pendingRequest) {
    const proposed = new Date(pendingRequest.proposed_at);
    const dateStr = proposed.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: themeColorLight }]}>
            <Ionicons name="calendar-outline" size={18} color={themeColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Reschedule request</Text>
            <Text style={styles.cardSub}>
              {otherUserName.split(' ')[0]} wants to move the call to{' '}
              <Text style={[styles.proposedTime, { color: themeColor }]}>{dateStr}</Text>
            </Text>
          </View>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.approveBtn, { backgroundColor: themeColor }]}
            onPress={() => handleRespond('approved')}
            disabled={loading}
            accessibilityLabel="Approve reschedule"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark" size={15} color={Colors.white} />
                <Text style={styles.approveBtnText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() => handleRespond('declined')}
            disabled={loading}
            accessibilityLabel="Decline reschedule"
            accessibilityRole="button"
          >
            <Text style={[styles.declineBtnText, { color: themeColor }]}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Requester view: waiting for response ──────────────────────
  if (isRequester && pendingRequest) {
    const proposed = new Date(pendingRequest.proposed_at);
    const dateStr = proposed.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: themeColorLight }]}>
            <Ionicons name="time-outline" size={18} color={themeColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Reschedule pending</Text>
            <Text style={styles.cardSub}>
              Proposed:{' '}
              <Text style={[styles.proposedTime, { color: themeColor }]}>{dateStr}</Text>
              {'\n'}Waiting for {otherUserName.split(' ')[0]} to respond.
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCancel}
            disabled={loading}
            accessibilityLabel="Cancel reschedule request"
            accessibilityRole="button"
          >
            <Text style={[styles.cancelLink, { color: Colors.gray400 }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Form view: request a reschedule ───────────────────────────
  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsed}
        onPress={() => setExpanded(true)}
        activeOpacity={0.85}
        accessibilityLabel="Request a reschedule"
        accessibilityRole="button"
      >
        <View style={styles.collapsedLeft}>
          <View style={[styles.iconWrap, { backgroundColor: themeColorLight }]}>
            <Ionicons name="refresh-outline" size={18} color={themeColor} />
          </View>
          <View>
            <Text style={styles.cardTitle}>Request reschedule</Text>
            <Text style={styles.cardSub}>Propose a new date and time</Text>
          </View>
        </View>
        <Ionicons name="chevron-up" size={17} color={Colors.gray400} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconWrap, { backgroundColor: themeColorLight }]}>
          <Ionicons name="refresh-outline" size={18} color={themeColor} />
        </View>
        <Text style={styles.cardTitle}>Request reschedule</Text>
        <TouchableOpacity
          onPress={() => { setExpanded(false); setDateText(''); }}
          accessibilityLabel="Collapse"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-down" size={18} color={Colors.gray400} />
        </TouchableOpacity>
      </View>

      <Text style={styles.fieldLabel}>Proposed new date & time</Text>
      <TextInput
        style={styles.input}
        value={dateText}
        onChangeText={setDateText}
        placeholder="month/day/year at (time)"
        placeholderTextColor={Colors.gray400}
        accessibilityLabel="Proposed date and time"
      />
      <Text style={styles.inputHint}>e.g. 05/30/2026 at 3:00 PM</Text>

      <TouchableOpacity
        style={[styles.sendBtn, { backgroundColor: themeColor }, loading && { opacity: 0.6 }]}
        onPress={handleSendRequest}
        disabled={loading}
        activeOpacity={0.85}
        accessibilityLabel="Send reschedule request"
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <>
            <Ionicons name="send-outline" size={15} color={Colors.white} />
            <Text style={styles.sendBtnText}>Send Request</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 14, marginHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm, gap: 10,
  },
  collapsed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm, marginHorizontal: 12, marginBottom: 8,
  },
  collapsedLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 34, height: 34, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardTitle: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.dark },
  cardSub: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.gray500, marginTop: 1, lineHeight: 17 },
  proposedTime: { fontFamily: Fonts.sansSemiBold },
  cancelLink: { fontFamily: Fonts.sans, fontSize: 12 },

  actionRow: { flexDirection: 'row', gap: 10 },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: Radius.md,
  },
  approveBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.white },
  declineBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray200,
  },
  declineBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 14 },

  fieldLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.gray500, marginBottom: -4 },
  input: {
    backgroundColor: Colors.gray100, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.gray200,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: Fonts.sans, fontSize: 14, color: Colors.dark,
  },
  inputHint: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.gray400, marginTop: -6 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.md, paddingVertical: 12,
  },
  sendBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.white },
});
