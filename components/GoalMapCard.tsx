import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Modal, ScrollView, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import { StudentGoal } from '@/lib/types';
import {
  getStudentGoals,
  addStudentGoal,
  toggleStudentGoal,
  deleteStudentGoal,
} from '@/lib/supabase';

const MAX_GOALS = 5;

interface Props {
  studentId: string;
  themeColor?: string;
}

export default function GoalMapCard({ studentId, themeColor = Colors.primary }: Props) {
  const [goals, setGoals] = useState<StudentGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const themeLight = themeColor + '12';
  const themeGlow = themeColor + '28';

  const load = useCallback(async () => {
    const data = await getStudentGoals(studentId);
    setGoals(data);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (goal: StudentGoal) => {
    const next: 'active' | 'completed' = goal.status === 'active' ? 'completed' : 'active';
    setGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, status: next } : g));
    await toggleStudentGoal(goal.id, next);
  };

  const handleDelete = (goal: StudentGoal) => {
    Alert.alert('Remove goal', `Remove "${goal.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setGoals((prev) => prev.filter((g) => g.id !== goal.id));
          await deleteStudentGoal(goal.id);
        },
      },
    ]);
  };

  const handleAdd = async () => {
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed.length < 3 || saving) return;
    setSaving(true);
    // A fresh UUID per submit ensures network-layer retries are idempotent
    // while still allowing the user to add the same text twice intentionally.
    const goal = await addStudentGoal(studentId, trimmed, undefined, undefined, crypto.randomUUID());
    if (goal) {
      setGoals((prev) => [...prev, goal]);
      setNewTitle('');
      setShowModal(false);
    }
    setSaving(false);
  };

  const completedCount = goals.filter((g) => g.status === 'completed').length;
  const progressPct = goals.length > 0 ? Math.round((completedCount / goals.length) * 100) : 0;

  return (
    <View style={styles.section}>
      {/* Section label */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionLabelRow}>
          <View style={[styles.sectionLabel, { borderLeftColor: themeColor }]}>
            <Text style={styles.sectionLabelText}>MY GOALS</Text>
          </View>
          <Text style={styles.sectionTitle}>Goal Map</Text>
        </View>
        {goals.length > 0 && goals.length < MAX_GOALS && (
          <TouchableOpacity
            style={[styles.addBtn, { borderColor: themeGlow, backgroundColor: themeLight }]}
            onPress={() => setShowModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Add goal"
          >
            <Ionicons name="add" size={14} color={themeColor} />
            <Text style={[styles.addBtnText, { color: themeColor }]}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={themeColor} style={{ marginTop: 16 }} />
      ) : goals.length === 0 ? (
        /* Empty state */
        <TouchableOpacity
          style={[styles.emptyCard, { borderColor: themeGlow, backgroundColor: themeLight }]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Set your first goal"
        >
          <View style={[styles.emptyIcon, { backgroundColor: themeColor + '20' }]}>
            <Ionicons name="flag-outline" size={24} color={themeColor} />
          </View>
          <Text style={styles.emptyTitle}>Set your first goal</Text>
          <Text style={styles.emptyDesc}>
            What do you want to achieve with your mentor? Tap to add a goal.
          </Text>
          <View style={[styles.emptyBtn, { backgroundColor: themeColor }]}>
            <Text style={styles.emptyBtnText}>Add Goal</Text>
            <Ionicons name="arrow-forward" size={13} color={Colors.white} />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[styles.goalsCard, { borderColor: themeGlow }]}>
          {/* Progress bar */}
          {goals.length > 1 && (
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: themeColor }]} />
              </View>
              <Text style={styles.progressLabel}>{completedCount}/{goals.length} complete</Text>
            </View>
          )}

          {/* Goal rows */}
          {goals.map((goal, idx) => {
            const done = goal.status === 'completed';
            return (
              <View
                key={goal.id}
                style={[styles.goalRow, idx < goals.length - 1 && styles.goalRowBorder]}
              >
                <TouchableOpacity
                  style={styles.goalCheck}
                  onPress={() => handleToggle(goal)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={goal.title}
                >
                  <Ionicons
                    name={done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={done ? Colors.accent3 : Colors.gray300}
                  />
                </TouchableOpacity>

                <View style={styles.goalContent}>
                  <Text style={[styles.goalTitle, done && styles.goalTitleDone]} numberOfLines={2}>
                    {goal.title}
                  </Text>
                  {goal.target_date && (
                    <Text style={styles.goalDate}>
                      <Ionicons name="calendar-outline" size={10} color={Colors.gray400} />
                      {' '}{new Date(goal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => handleDelete(goal)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete goal"
                >
                  <Ionicons name="trash-outline" size={15} color={Colors.gray300} />
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Add more button (if under limit) */}
          {goals.length < MAX_GOALS && (
            <TouchableOpacity
              style={[styles.addMoreRow, { borderTopColor: Colors.gray100 }]}
              onPress={() => setShowModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Add another goal"
            >
              <Ionicons name="add-circle-outline" size={16} color={themeColor} />
              <Text style={[styles.addMoreText, { color: themeColor }]}>Add another goal</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Add Goal Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowModal(false)} activeOpacity={1} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New Goal</Text>
            <Text style={styles.modalDesc}>What do you want to achieve with your mentor?</Text>
            <TextInput
              style={styles.modalInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. Get an internship in finance"
              placeholderTextColor={Colors.gray400}
              maxLength={200}
              multiline
              autoFocus
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={handleAdd}
              accessibilityLabel="Goal title"
            />
            <Text style={styles.charCount}>{newTitle.length}/200</Text>
            <TouchableOpacity
              style={[styles.modalSave, { backgroundColor: themeColor }, (!newTitle.trim() || newTitle.trim().length < 3 || saving) && styles.modalSaveDisabled]}
              onPress={handleAdd}
              disabled={!newTitle.trim() || newTitle.trim().length < 3 || saving}
              accessibilityRole="button"
              accessibilityLabel="Save goal"
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.modalSaveText}>Save Goal</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    gap: 14,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionLabelRow: { gap: 5 },
  sectionLabel: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  sectionLabelText: { ...Typography.label, color: Colors.gray500 },
  sectionTitle: { ...Typography.displaySm, color: Colors.dark },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  addBtnText: { ...Typography.bodySm, fontFamily: Fonts.sansSemiBold },

  /* Empty state */
  emptyCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 52, height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...Typography.headingSm, color: Colors.dark },
  emptyDesc: {
    ...Typography.bodyMd,
    color: Colors.gray500,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.full,
    marginTop: 4,
  },
  emptyBtnText: { ...Typography.bodySm, fontFamily: Fonts.sansBold, color: Colors.white },

  /* Goals card */
  goalsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: Colors.gray100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    borderRadius: 3,
  },
  progressLabel: {
    ...Typography.caption,
    color: Colors.gray500,
    flexShrink: 0,
  },

  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  goalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  goalCheck: {
    padding: 2,
  },
  goalContent: { flex: 1, gap: 2 },
  goalTitle: {
    ...Typography.bodyMd,
    color: Colors.dark,
    fontFamily: Fonts.sansMedium,
    lineHeight: 20,
  },
  goalTitleDone: {
    textDecorationLine: 'line-through',
    color: Colors.gray400,
  },
  goalDate: {
    ...Typography.caption,
    color: Colors.gray400,
  },

  addMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  addMoreText: { ...Typography.bodySm, fontFamily: Fonts.sansMedium },

  /* Modal */
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: 24,
    paddingTop: 12,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 38, height: 4,
    backgroundColor: Colors.gray200,
    borderRadius: 2,
    marginBottom: 16,
  },
  modalTitle: { ...Typography.displaySm, color: Colors.dark, marginBottom: 4 },
  modalDesc: { ...Typography.bodyMd, color: Colors.gray500, marginBottom: 16 },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.dark,
    fontFamily: Fonts.sans,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  charCount: {
    ...Typography.caption,
    color: Colors.gray400,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 16,
  },
  modalSave: {
    height: 50,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveDisabled: { backgroundColor: Colors.gray300 },
  modalSaveText: { ...Typography.bodyMd, fontFamily: Fonts.sansBold, color: Colors.white },
});
