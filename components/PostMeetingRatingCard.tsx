import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Fonts } from '@/constants/theme';
import { submitPostMeetingFeedback, updateMeetingOutcome } from '@/lib/meetings';
import * as SecureStore from 'expo-secure-store';

const APP_STORE_ID = 'REPLACE_WITH_APP_STORE_ID'; // fill in after App Store listing is created

interface PostMeetingRatingCardProps {
  meetingId: string;
  raterId: string;
  rateeId: string;
  rateeName: string;
  isStudent: boolean;
  onSubmitted: () => void;
}

export default function PostMeetingRatingCard({
  meetingId,
  raterId,
  rateeId,
  rateeName,
  isStudent,
  onSubmitted,
}: PostMeetingRatingCardProps) {
  const [hadProblems, setHadProblems] = useState<boolean | null>(null);
  const [details, setDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showSatisfactionCheck, setShowSatisfactionCheck] = useState(false);

  const handleSubmit = async () => {
    if (hadProblems === null) {
      Alert.alert('Required', 'Please let us know if you had any issues.');
      return;
    }
    if (hadProblems && !details.trim()) {
      Alert.alert('Required', 'Please describe what happened so we can help.');
      return;
    }
    setSaving(true);
    try {
      const trimmedNotes = notes.trim() || undefined;
      await updateMeetingOutcome(
        meetingId,
        true,
        isStudent ? trimmedNotes : undefined,
        !isStudent ? trimmedNotes : undefined,
      );
      await submitPostMeetingFeedback(
        meetingId,
        raterId,
        rateeId,
        hadProblems,
        hadProblems ? details.trim() : undefined,
      );
      setSubmitted(true);
      onSubmitted();
      // Only show satisfaction check once per install
      const alreadyAsked = await SecureStore.getItemAsync('mentara_review_prompted').catch(() => null);
      if (!alreadyAsked) setShowSatisfactionCheck(true);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to submit feedback.');
    } finally {
      setSaving(false);
    }
  };

  const handleSatisfied = async () => {
    setShowSatisfactionCheck(false);
    await SecureStore.setItemAsync('mentara_review_prompted', 'true').catch(() => {});
    if (APP_STORE_ID !== 'REPLACE_WITH_APP_STORE_ID') {
      Linking.openURL(`itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`);
    }
  };

  const handleNotSatisfied = async () => {
    setShowSatisfactionCheck(false);
    await SecureStore.setItemAsync('mentara_review_prompted', 'true').catch(() => {});
    const subject = encodeURIComponent('Feedback for Mentara');
    const body = encodeURIComponent('Hi Mentara team,\n\nHere is my feedback:\n\n');
    Linking.openURL(`mailto:mentarasupport@gmail.com?subject=${subject}&body=${body}`);
  };

  if (submitted && showSatisfactionCheck) {
    return (
      <View style={styles.satisfactionCard}>
        <Text style={styles.satisfactionTitle}>Enjoying Mentara?</Text>
        <Text style={styles.satisfactionSub}>Your feedback helps us improve for everyone.</Text>
        <View style={styles.satisfactionRow}>
          <TouchableOpacity
            style={[styles.satisfactionBtn, { backgroundColor: Colors.accent3Light }]}
            onPress={handleSatisfied}
            accessibilityRole="button"
            accessibilityLabel="Yes, I love it"
          >
            <Text style={styles.satisfactionEmoji}>👍</Text>
            <Text style={[styles.satisfactionBtnText, { color: Colors.accent3 }]}>Love it!</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.satisfactionBtn, { backgroundColor: Colors.gray100 }]}
            onPress={handleNotSatisfied}
            accessibilityRole="button"
            accessibilityLabel="Could be better"
          >
            <Text style={styles.satisfactionEmoji}>👎</Text>
            <Text style={[styles.satisfactionBtnText, { color: Colors.gray700 }]}>Could be better</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (submitted) {
    return (
      <View style={styles.successCard}>
        <Ionicons name="checkmark-circle" size={24} color={Colors.accent3} />
        <Text style={styles.successText}>Thanks for your feedback!</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.aiBadge}>
        <Ionicons name="sparkles" size={13} color={Colors.accent} />
        <Text style={styles.aiLabel}>Post-Call Reflection</Text>
      </View>

      {/* Meeting notes / learnings */}
      <Text style={styles.subQuestion}>
        {isStudent ? 'Key learnings from this session' : 'Meeting notes'}
      </Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder={
          isStudent
            ? 'What was your biggest takeaway? What will you apply from today?'
            : 'Summarise the session — topics covered, advice given, next steps…'
        }
        placeholderTextColor={Colors.gray400}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        maxLength={1000}
        accessibilityLabel={isStudent ? 'Key learnings' : 'Meeting notes'}
      />

      {/* Problems toggle */}
      <Text style={styles.subQuestion}>Did you have any issues?</Text>
      <View style={styles.choiceRow}>
        <TouchableOpacity
          style={[styles.choiceBtn, hadProblems === false && styles.choiceBtnYes]}
          onPress={() => { setHadProblems(false); setDetails(''); }}
          activeOpacity={0.82}
          accessibilityLabel="No problems"
          accessibilityRole="button"
        >
          <Text style={styles.choiceEmoji}>👍</Text>
          <Text style={[styles.choiceText, hadProblems === false && styles.choiceTextActive]}>
            No issues
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.choiceBtn, hadProblems === true && styles.choiceBtnNo]}
          onPress={() => setHadProblems(true)}
          activeOpacity={0.82}
          accessibilityLabel="Yes, I had issues"
          accessibilityRole="button"
        >
          <Text style={styles.choiceEmoji}>🚩</Text>
          <Text style={[styles.choiceText, hadProblems === true && styles.choiceTextIssue]}>
            Had issues
          </Text>
        </TouchableOpacity>
      </View>

      {hadProblems === true && (
        <TextInput
          style={styles.detailsInput}
          value={details}
          onChangeText={setDetails}
          placeholder="What happened? We'll review this privately and follow up if needed."
          placeholderTextColor={Colors.gray400}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          maxLength={1000}
          accessibilityLabel="Describe what happened"
          autoFocus
        />
      )}

      {hadProblems !== null && (
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.85}
          accessibilityLabel="Submit feedback"
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.submitBtnText}>Submit Feedback</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  aiLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 0.4,
  },
  subQuestion: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    color: Colors.gray700,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 10,
  },
  choiceBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.gray100,
  },
  choiceBtnYes: {
    borderColor: Colors.accent3,
    backgroundColor: Colors.accent3Light,
  },
  choiceBtnNo: {
    borderColor: Colors.accent2,
    backgroundColor: Colors.accent2Light,
  },
  choiceEmoji: { fontSize: 20 },
  choiceText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12,
    color: Colors.gray700,
    textAlign: 'center',
  },
  choiceTextActive: { color: Colors.accent3 },
  choiceTextIssue: { color: Colors.accent2 },
  notesInput: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 12,
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Colors.dark,
    minHeight: 80,
  },
  detailsInput: {
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.accent2,
    padding: 12,
    fontFamily: Fonts.sans,
    fontSize: 14,
    color: Colors.dark,
    minHeight: 100,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.white },

  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.accent3Light,
    borderRadius: Radius.lg,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  successText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.accent3 },

  satisfactionCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 20, marginHorizontal: 16, marginVertical: 8,
    borderWidth: 1, borderColor: Colors.border, gap: 12,
    alignItems: 'center',
  },
  satisfactionTitle: { fontFamily: Fonts.sansBold, fontSize: 18, color: Colors.dark },
  satisfactionSub: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.gray500, textAlign: 'center' },
  satisfactionRow: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  satisfactionBtn: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14,
    borderRadius: Radius.lg,
  },
  satisfactionEmoji: { fontSize: 24 },
  satisfactionBtnText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },
});
