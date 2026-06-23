import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import Avatar from '@/components/ui/Avatar';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import { getMentorById, triggerAutoAssignMentor } from '@/lib/supabase';
import { getMyAssignment, getMentorStudents } from '@/lib/meetings';

const MENTOR_THEME = {
  headerBg: Colors.mentorHeaderBg,
  primary: Colors.accent2,
  light: Colors.accent2Light,
  glow: Colors.accent2Glow,
};

// ─────────────────────────────────────────────────────────────────
// Student Match Screen — shows AI-assigned mentor
// ─────────────────────────────────────────────────────────────────
function StudentMatchScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();

  const [assignment, setAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasTriggeredMatch = useRef(false);
  const [matchAttemptFailed, setMatchAttemptFailed] = useState(false);
  const [retryingMatch, setRetryingMatch] = useState(false);

  const triggerMatch = async () => {
    if (!user) return;
    setMatchAttemptFailed(false);
    try {
      const { data, error } = await triggerAutoAssignMentor(user.id);
      if (error) {
        setMatchAttemptFailed(true);
        return;
      }
      if (data?.assigned) {
        await load();
      }
      // If function ran successfully but returned no match, that is the "no mentor available
      // in your field" case — leave the pending UI in place, do NOT show retry button.
    } catch {
      setMatchAttemptFailed(true);
    }
  };

  const load = async () => {
    if (!user) return;
    try {
      const result = await getMyAssignment(user.id, 'student');
      setAssignment(result);
      if (!result && !hasTriggeredMatch.current) {
        hasTriggeredMatch.current = true;
        triggerMatch();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualRetry = async () => {
    if (retryingMatch) return;
    setRetryingMatch(true);
    await triggerMatch();
    setRetryingMatch(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const mentorProfile = assignment?.other_user;
  const mentorDetails = mentorProfile?.mentor_profiles;
  const conversationId = assignment?.conversation_id;

  return (
    <View style={[sStyles.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={sStyles.header}>
        <View style={sStyles.headerOrb} />
        <Text style={sStyles.eyebrow}>YOUR MATCH</Text>
        <Text style={sStyles.title}>My Mentor</Text>
        <Text style={sStyles.headerFree}>Free · AI-matched · no fees, ever</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={sStyles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={sStyles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={sStyles.loadingText}>Loading your mentor...</Text>
          </View>
        ) : !assignment || !conversationId ? (
          /* ── Pending state ──────────────────────────────────── */
          <>
            <View style={sStyles.pendingCard}>
              <View style={sStyles.pendingIconWrap}>
                <Ionicons name={matchAttemptFailed ? 'alert-circle-outline' : 'sparkles-outline'} size={36} color={Colors.primary} />
              </View>
              <Text style={sStyles.pendingTitle}>
                {matchAttemptFailed ? 'Match attempt failed' : 'Finding your mentor match...'}
              </Text>
              <Text style={sStyles.pendingSubtitle}>
                {matchAttemptFailed
                  ? "We could not reach our matching service. Tap retry to try again, or check back in a moment."
                  : "Our AI is carefully reviewing your profile and goals to find the mentor who fits you best. We'll have a match ready for you soon. Check back anytime. This is completely free."}
              </Text>
              {matchAttemptFailed ? (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: Colors.primary, borderRadius: 999, marginTop: 4 }}
                  onPress={handleManualRetry}
                  disabled={retryingMatch}
                  accessibilityRole="button"
                  accessibilityLabel="Retry matching"
                >
                  {retryingMatch ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={14} color={Colors.white} />
                      <Text style={{ color: Colors.white, fontWeight: '700', fontSize: 13 }}>Try again</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={sStyles.pendingDots}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={sStyles.pendingDot} />
                  ))}
                </View>
              )}
            </View>

            {/* Tip: only shown when profile genuinely incomplete */}
            {!profile?.onboarding_complete && (
            <TouchableOpacity
              style={sStyles.pendingTip}
              onPress={() => router.push('/(app)/(tabs)/profile')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Complete your profile to speed up matching"
            >
              <View style={sStyles.pendingTipIcon}>
                <Ionicons name="person-outline" size={14} color={Colors.accent} />
              </View>
              <Text style={sStyles.pendingTipText}>
                Complete your profile to help us find the right mentor faster
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
            </TouchableOpacity>
            )}
          </>
        ) : (
          /* ── Mentor card ────────────────────────────────────── */
          <>
            <View style={sStyles.aiBadgeRow}>
              <View style={sStyles.aiBadge}>
                <Ionicons name="sparkles" size={12} color={Colors.accent} />
                <Text style={sStyles.aiBadgeText}>AI-matched for you</Text>
              </View>
            </View>

            <View style={sStyles.mentorCard}>
              <View style={sStyles.mentorCardTop}>
                <Avatar
                  uri={mentorProfile?.avatar_url}
                  name={mentorProfile?.full_name}
                  size={72}
                />
                <View style={sStyles.mentorCardInfo}>
                  <Text style={sStyles.mentorName} numberOfLines={1}>
                    {mentorProfile?.full_name ?? 'Your Mentor'}
                  </Text>
                  {!!mentorDetails?.title && (
                    <Text style={sStyles.mentorTitle} numberOfLines={1}>
                      {mentorDetails.title}
                    </Text>
                  )}
                  {!!mentorDetails?.institution && (
                    <View style={sStyles.mentorInstRow}>
                      <Ionicons name="business-outline" size={12} color={Colors.gray500} />
                      <Text style={sStyles.mentorInstitution} numberOfLines={1}>
                        {mentorDetails.institution}
                      </Text>
                    </View>
                  )}
                  {!!assignment.assigned_field && (
                    <View style={sStyles.fieldPill}>
                      <Text style={sStyles.fieldPillText}>{assignment.assigned_field}</Text>
                    </View>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={sStyles.chatBtn}
                onPress={() => router.replace('/(app)/(tabs)/messages' as any)}
                activeOpacity={0.85}
                accessibilityLabel={`Open call thread with ${mentorProfile?.full_name}`}
                accessibilityRole="button"
              >
                <Ionicons name="chatbubble-outline" size={18} color={Colors.white} />
                <Text style={sStyles.chatBtnText}>Open Call Thread</Text>
              </TouchableOpacity>
            </View>

            {/* ── How this works info card ─────────────────────── */}
            <View style={sStyles.infoCard}>
              <Text style={sStyles.infoTitle}>How it works</Text>
              <View style={sStyles.infoSteps}>
                {[
                  { icon: 'chatbubble-outline', text: 'Send a message to introduce yourself' },
                  { icon: 'calendar-outline', text: 'Schedule your first monthly call' },
                  { icon: 'videocam-outline', text: 'Have a 1-hour call via Zoom, Meet, or FaceTime' },
                  { icon: 'refresh-outline', text: 'Repeat every month, completely free' },
                ].map((step, i) => (
                  <View key={i} style={sStyles.infoStep}>
                    <View style={sStyles.infoStepIcon}>
                      <Ionicons name={step.icon as any} size={14} color={Colors.primary} />
                    </View>
                    <Text style={sStyles.infoStepText}>{step.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────
// Mentor Hub — shown when a mentor taps the Discover tab
// ─────────────────────────────────────────────────────────────────
function MentorHubScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [assignments, setAssignments] = useState<any[]>([]);
  const [mentorProfile, setMentorProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user) return;
    try {
      const [assignmentsResult, mentorResult] = await Promise.all([
        getMentorStudents(user.id),
        getMentorById(user.id),
      ]);
      setAssignments(assignmentsResult);
      setMentorProfile(mentorResult.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const studentCount = assignments.length;

  return (
    <View style={[mStyles.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={mStyles.header}>
        <View style={mStyles.headerTop}>
          <View>
            <Text style={mStyles.eyebrowText}>MENTOR HUB</Text>
            <Text style={mStyles.title}>Your Students</Text>
          </View>
          {studentCount > 0 && (
            <View style={mStyles.countPill}>
              <Text style={mStyles.countPillText}>{studentCount} active</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent2} />}
      >

        {loading ? (
          <View style={mStyles.loadingCenter}>
            <ActivityIndicator size="large" color={Colors.accent2} />
            <Text style={mStyles.loadingText}>Loading your hub...</Text>
          </View>
        ) : (
          <>
            {/* ── Active Students ─────────────────────────────────── */}
            <View style={mStyles.section}>
              <View style={mStyles.sectionHeader}>
                <View style={mStyles.eyebrowBadge}>
                  <Text style={mStyles.eyebrowBadgeText}>ASSIGNED TO YOU</Text>
                </View>
                <Text style={mStyles.sectionTitle}>Active Students</Text>
              </View>

              {assignments.length === 0 ? (
                <>
                  <View style={mStyles.pendingCard}>
                    <View style={mStyles.pendingIconWrap}>
                      <Ionicons name="sparkles-outline" size={36} color={Colors.accent2} />
                    </View>
                    <Text style={mStyles.pendingTitle}>Finding your student match...</Text>
                    <Text style={mStyles.pendingSubtitle}>
                      Our AI is in the process of matching you with a student whose goals and field align with your expertise. We'll pair you as soon as the right fit comes through.
                    </Text>
                    <View style={mStyles.pendingDots}>
                      {[0, 1, 2].map((i) => (
                        <View key={i} style={mStyles.pendingDot} />
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity
                    style={mStyles.pendingTip}
                    onPress={() => router.push('/(app)/(tabs)/profile')}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Complete your mentor profile to speed up matching"
                  >
                    <View style={mStyles.pendingTipIcon}>
                      <Ionicons name="person-outline" size={14} color={Colors.accent} />
                    </View>
                    <Text style={mStyles.pendingTipText}>
                      A complete profile helps us find students who are the right match for you
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
                  </TouchableOpacity>
                </>
              ) : (
                <View style={mStyles.cardList}>
                  {assignments.map((asgn) => {
                    const student = asgn.other_user;
                    const studentProfile = asgn.student_profile;
                    const fields: string[] = studentProfile?.fields_of_interest ?? [];
                    const gradeLabel = studentProfile?.grade_level
                      ? gradeDisplay(studentProfile.grade_level)
                      : null;
                    const goalsPreview = studentProfile?.learning_goals
                      ? studentProfile.learning_goals.slice(0, 80) + (studentProfile.learning_goals.length > 80 ? '...' : '')
                      : null;

                    return (
                      <TouchableOpacity
                        key={asgn.id}
                        style={mStyles.studentCard}
                        onPress={() => router.replace('/(app)/(tabs)/messages' as any)}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Open call thread with ${student?.full_name}`}
                      >
                        <Avatar uri={student?.avatar_url} name={student?.full_name} size={52} />
                        <View style={mStyles.studentInfo}>
                          <Text style={mStyles.studentName} numberOfLines={1}>
                            {student?.full_name ?? 'Student'}
                          </Text>
                          <View style={mStyles.studentMetaRow}>
                            {!!gradeLabel && (
                              <View style={mStyles.metaChip}>
                                <Ionicons name="school-outline" size={11} color={Colors.accent2} />
                                <Text style={mStyles.metaChipText}>{gradeLabel}</Text>
                              </View>
                            )}
                            {!!asgn.assigned_field && (
                              <View style={[mStyles.metaChip, { backgroundColor: `${Colors.accent2}18` }]}>
                                <Text style={[mStyles.metaChipText, { color: Colors.accent2 }]}>{asgn.assigned_field}</Text>
                              </View>
                            )}
                          </View>
                          {!!goalsPreview && (
                            <Text style={mStyles.goalPreview} numberOfLines={2}>{goalsPreview}</Text>
                          )}
                        </View>
                        <View style={mStyles.callBtn}>
                          <Ionicons name="chatbubble-outline" size={15} color={Colors.accent2} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function gradeDisplay(gradeLevel: string): string {
  const map: Record<string, string> = {
    high_school: 'High School',
    undergrad: 'Undergraduate',
    undergraduate: 'Undergraduate',
    graduate: 'Graduate Student',
    phd: 'PhD Student',
    early_career: 'Early Career Professional',
    other: 'Other',
  };
  return map[gradeLevel] ?? gradeLevel;
}

// ─────────────────────────────────────────────────────────────────
// Root export — dispatches based on role
// ─────────────────────────────────────────────────────────────────
export default function DiscoverScreen() {
  const { profile } = useAuth();
  if (!profile) return null;
  return profile.role === 'student' ? <StudentMatchScreen /> : <MentorHubScreen />;
}

// ─────────────────────────────────────────────────────────────────
// Student match styles
// ─────────────────────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xl,
    backgroundColor: Colors.primaryDark,
    overflow: 'hidden',
  },
  headerOrb: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(201,139,48,0.08)', top: -60, right: -40,
  },
  eyebrow: {
    ...Typography.caption, color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.sansBold, letterSpacing: 1.5, marginBottom: 4,
  },
  title: { ...Typography.displaySm, color: Colors.white },
  headerFree: {
    ...Typography.caption, color: 'rgba(255,255,255,0.45)',
    fontFamily: Fonts.sansMedium, marginTop: 4,
  },

  scrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg },

  center: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 60 },
  loadingText: { ...Typography.bodyMd, color: Colors.gray500, fontFamily: Fonts.sansMedium },

  // Pending state
  pendingCard: {
    alignItems: 'center', gap: 14, paddingVertical: 48, paddingHorizontal: 24,
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.md,
  },
  pendingIconWrap: {
    width: 72, height: 72,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.primaryGlow,
  },
  pendingTitle: { ...Typography.headingMd, color: Colors.dark, textAlign: 'center' },
  pendingSubtitle: {
    ...Typography.bodyMd, color: Colors.gray500,
    textAlign: 'center', lineHeight: 22,
  },
  pendingDots: { flexDirection: 'row', gap: 8 },
  pendingDot: {
    width: 8, height: 8, backgroundColor: Colors.primary,
  },

  // Pending tip
  pendingTip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.accentLight, marginTop: 14,
    borderRadius: Radius.lg, padding: 14,
    borderWidth: 1, borderColor: Colors.accentGlow,
    ...Shadow.sm,
  },
  pendingTipIcon: {
    width: 30, height: 30,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  pendingTipText: {
    flex: 1, ...Typography.bodyMd, color: Colors.dark, fontFamily: Fonts.sansMedium,
  },

  // AI badge
  aiBadgeRow: { alignItems: 'center', marginBottom: 12 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full,
    backgroundColor: Colors.accentGlow, borderWidth: 1, borderColor: Colors.accent,
  },
  aiBadgeText: { ...Typography.caption, color: Colors.accent, fontFamily: Fonts.sansSemiBold },

  // Mentor card
  mentorCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 20, borderWidth: 1, borderColor: Colors.border,
    gap: 14, ...Shadow.md,
  },
  mentorCardTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  mentorCardInfo: { flex: 1, gap: 5 },
  mentorName: { ...Typography.headingMd, color: Colors.dark },
  mentorTitle: { ...Typography.bodyMd, color: Colors.gray700, fontFamily: Fonts.sansMedium },
  mentorInstRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mentorInstitution: { ...Typography.bodySm, color: Colors.gray500 },
  fieldPill: {
    alignSelf: 'flex-start', marginTop: 2,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primaryGlow,
  },
  fieldPillText: { ...Typography.caption, color: Colors.primary, fontFamily: Fonts.sansSemiBold },

  chatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 13,
  },
  chatBtnText: { ...Typography.bodyMd, color: Colors.white, fontFamily: Fonts.sansBold },

  // Info card
  infoCard: {
    marginTop: 16, backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 20, borderWidth: 1, borderColor: Colors.border, gap: 12, ...Shadow.sm,
  },
  infoTitle: { ...Typography.headingSm, color: Colors.dark },
  infoSteps: { gap: 10 },
  infoStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoStepIcon: {
    width: 28, height: 28,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  infoStepText: { ...Typography.bodyMd, color: Colors.gray700, flex: 1, lineHeight: 20 },
});

// ─────────────────────────────────────────────────────────────────
// Mentor hub styles
// ─────────────────────────────────────────────────────────────────
const mStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // ── Header ───────────────────────────────────────────────────────
  header: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.lg,
    backgroundColor: MENTOR_THEME.headerBg,
  },
  headerTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  eyebrowText: {
    ...Typography.caption, color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.sansBold, letterSpacing: 1.5, marginBottom: 4,
  },
  title: { ...Typography.displaySm, color: Colors.white },
  countPill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)', marginBottom: 2,
  },
  countPillText: { ...Typography.bodySm, color: Colors.white, fontFamily: Fonts.sansSemiBold },

  // ── Loading ───────────────────────────────────────────────────────
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  loadingText: { ...Typography.bodyMd, color: Colors.gray500, fontFamily: Fonts.sansMedium },

  // ── Sections ─────────────────────────────────────────────────────
  section: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, gap: 14 },
  sectionHeader: { gap: 5 },
  eyebrowBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.full, backgroundColor: Colors.accent2Light,
    borderWidth: 1, borderColor: Colors.accent2Glow,
  },
  eyebrowBadgeText: {
    ...Typography.caption, color: Colors.accent2,
    letterSpacing: 1.2, fontFamily: Fonts.sansBold,
  },
  sectionTitle: { ...Typography.displaySm, color: Colors.dark },

  // ── Empty state ───────────────────────────────────────────────────
  emptyCard: {
    alignItems: 'center', gap: 10, paddingVertical: 32,
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyTitle: { ...Typography.headingSm, color: Colors.dark },
  emptySubtitle: { ...Typography.bodyMd, color: Colors.gray500, textAlign: 'center', paddingHorizontal: 24 },

  // ── Pending (no students yet) ─────────────────────────────────────
  pendingCard: {
    alignItems: 'center', gap: 14, paddingVertical: 48, paddingHorizontal: 24,
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.md,
  },
  pendingIconWrap: {
    width: 72, height: 72,
    backgroundColor: Colors.accent2Light, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.accent2Glow,
  },
  pendingTitle: { ...Typography.headingMd, color: Colors.dark, textAlign: 'center' },
  pendingSubtitle: {
    ...Typography.bodyMd, color: Colors.gray500,
    textAlign: 'center', lineHeight: 22,
  },
  pendingDots: { flexDirection: 'row', gap: 8 },
  pendingDot: { width: 8, height: 8, backgroundColor: Colors.accent2 },
  pendingTip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.accentLight, marginTop: 14,
    borderRadius: Radius.lg, padding: 14,
    borderWidth: 1, borderColor: Colors.accentGlow,
    ...Shadow.sm,
  },
  pendingTipIcon: {
    width: 30, height: 30,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  pendingTipText: {
    flex: 1, ...Typography.bodyMd, color: Colors.dark, fontFamily: Fonts.sansMedium,
  },

  // ── Card list ─────────────────────────────────────────────────────
  cardList: { gap: 10 },

  // ── Student card ──────────────────────────────────────────────────
  studentCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  studentInfo: { flex: 1, gap: 4 },
  studentName: { ...Typography.headingSm, color: Colors.dark },
  studentMeta: { ...Typography.bodySm, color: Colors.gray500, fontFamily: Fonts.sansMedium },
  studentMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.gray100, borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  metaChipText: { ...Typography.caption, color: Colors.gray500, fontFamily: Fonts.sansSemiBold },
  fieldTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  fieldTag: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full,
    backgroundColor: Colors.accent2Light, borderWidth: 1, borderColor: Colors.accent2Glow,
  },
  fieldTagText: { ...Typography.caption, color: Colors.accent2, fontFamily: Fonts.sansSemiBold },
  goalPreview: { ...Typography.bodySm, color: Colors.gray500, lineHeight: 18, marginTop: 2 },
  callBtn: {
    width: 44, height: 44, marginTop: 6,
    backgroundColor: Colors.accent2Light, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.accent2Glow, flexShrink: 0,
  },

  reviewCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 16, gap: 10, borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  reviewTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reviewerName: { ...Typography.bodySm, fontFamily: Fonts.sansBold, color: Colors.dark },
  starsRow: { flexDirection: 'row', gap: 2 },
  reviewDate: { ...Typography.caption, color: Colors.gray400 },
  reviewComment: { ...Typography.bodyMd, color: Colors.gray700, lineHeight: 20 },
});
