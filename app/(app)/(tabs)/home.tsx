import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/context/AuthContext';
import Avatar from '@/components/ui/Avatar';
import GoalMapCard from '@/components/GoalMapCard';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing, FIELD_COLORS } from '@/constants/theme';
import { getStudentProfile, getRecentVoiceMemos, getMentorProfile, getReferredByInfo } from '@/lib/supabase';
import { getMentorStudents, getMentorMeetings } from '@/lib/meetings';
import { VoiceMemo, Meeting } from '@/lib/types';

// ── Field info data ───────────────────────────────────────────────
const FEATURED_HOME_FIELDS = [
  'Computer Science', 'Medicine', 'Business',
  'Data Science', 'Law', 'Design',
];

const FIELD_INFO: Record<string, { icon: string; tagline: string; description: string; careers: string[] }> = {
  'Computer Science': {
    icon: 'code-slash-outline',
    tagline: 'Build the digital future',
    description: 'Build software, systems, and digital products that power every industry, from mobile apps to AI platforms. CS graduates are among the most in-demand professionals globally.',
    careers: ['Software Engineer', 'Product Manager', 'ML Engineer', 'DevOps Engineer'],
  },
  'Medicine': {
    icon: 'medkit-outline',
    tagline: 'Heal and transform lives',
    description: 'Study the science of health and disease to diagnose, treat, and prevent illness, from primary care to cutting-edge biomedical research. One of the most impactful careers you can pursue.',
    careers: ['Physician', 'Surgeon', 'Biomedical Researcher', 'Public Health Officer'],
  },
  'Business': {
    icon: 'trending-up-outline',
    tagline: 'Lead and grow organizations',
    description: 'Develop the skills to launch, lead, and scale organizations, from startups to Fortune 500 companies. Business combines strategy, finance, operations, and leadership.',
    careers: ['Entrepreneur', 'Business Analyst', 'Operations Manager', 'Management Consultant'],
  },
  'Data Science': {
    icon: 'analytics-outline',
    tagline: 'Turn data into decisions',
    description: 'Extract insights from large datasets to drive strategic decisions in science, business, and policy. Data scientists are among the most sought-after roles across every sector.',
    careers: ['Data Scientist', 'Data Analyst', 'ML Engineer', 'Business Intelligence Analyst'],
  },
  'Law': {
    icon: 'briefcase-outline',
    tagline: 'Advocate and protect rights',
    description: 'Learn to interpret legal systems, advocate for clients, and shape public policy through the practice of law. Lawyers work across corporate, public, and criminal justice sectors.',
    careers: ['Attorney', 'Public Defender', 'Judge', 'Corporate Counsel'],
  },
  'Design': {
    icon: 'color-palette-outline',
    tagline: 'Create meaningful experiences',
    description: 'Craft visual and interactive experiences that communicate, inspire, and define how people interact with products and the world. Design sits at the intersection of art and engineering.',
    careers: ['UX Designer', 'Product Designer', 'Art Director', 'Graphic Designer'],
  },
  'Engineering': {
    icon: 'construct-outline',
    tagline: 'Build the physical world',
    description: 'Apply mathematics and science to design, build, and improve systems, from bridges to microchips. Engineering spans mechanical, civil, electrical, chemical, and aerospace disciplines.',
    careers: ['Mechanical Engineer', 'Civil Engineer', 'Electrical Engineer', 'Systems Engineer'],
  },
  'Finance': {
    icon: 'bar-chart-outline',
    tagline: 'Master capital and markets',
    description: 'Learn investment strategies, financial modeling, and market analysis to manage and grow wealth at any scale, from personal finance to global capital markets.',
    careers: ['Investment Banker', 'Financial Analyst', 'Portfolio Manager', 'CFO'],
  },
  'Artificial Intelligence': {
    icon: 'hardware-chip-outline',
    tagline: 'Define the future of intelligence',
    description: 'Design intelligent systems that learn, reason, and automate complex tasks, reshaping every industry from healthcare to finance to transportation.',
    careers: ['AI Researcher', 'ML Engineer', 'NLP Engineer', 'Robotics Engineer'],
  },
  'Psychology': {
    icon: 'people-outline',
    tagline: 'Understand the human mind',
    description: 'Study the science of mind, behavior, and emotion, and apply that knowledge to help individuals, teams, and organizations perform and thrive.',
    careers: ['Clinical Psychologist', 'UX Researcher', 'Therapist', 'Organizational Psychologist'],
  },
  'Biology': {
    icon: 'leaf-outline',
    tagline: 'Explore the complexity of life',
    description: 'Investigate life at every scale, from molecular genetics to global ecosystems. Biology underpins medicine, agriculture, environmental science, and biotechnology.',
    careers: ['Biologist', 'Biomedical Researcher', 'Ecologist', 'Genetic Counselor'],
  },
  'Environmental Science': {
    icon: 'earth-outline',
    tagline: 'Protect the planet',
    description: "Study and protect Earth's natural systems through research, fieldwork, and evidence-based policy. Environmental scientists are critical to addressing climate change.",
    careers: ['Environmental Scientist', 'Climate Researcher', 'Policy Analyst', 'Conservation Biologist'],
  },
};

const MENTOR_THEME = {
  headerBg: Colors.mentorHeaderBg,
  primary: Colors.accent2,
  light: Colors.accent2Light,
  glow: Colors.accent2Glow,
  shadow: Colors.dark,
};

function SectionLabel({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.sectionLabel, { borderLeftColor: color }]}>
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
  );
}

function FieldCard({ field, onPress }: { field: string; onPress: () => void }) {
  const color = FIELD_COLORS[field] ?? Colors.primary;
  const info = FIELD_INFO[field];
  return (
    <TouchableOpacity
      style={[styles.fieldCard, { borderLeftColor: color }]}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Learn about ${field}`}
    >
      <View style={[styles.fieldCardIcon, { backgroundColor: color + '18' }]}>
        <Ionicons name={(info?.icon ?? 'school-outline') as any} size={17} color={color} />
      </View>
      <Text style={styles.fieldCardName} numberOfLines={1}>{field}</Text>
      <Text style={styles.fieldCardTagline} numberOfLines={2}>{info?.tagline ?? 'Explore this field'}</Text>
      <Ionicons name="arrow-forward" size={11} color={color} style={{ marginTop: 4 }} />
    </TouchableOpacity>
  );
}

function getMeetingCountdown(scheduledAt: string): string {
  const meeting = new Date(scheduledAt);
  const now = new Date();
  const diffMs = meeting.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return `In ${diffDays} days`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { profile, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [mentorStudents, setMentorStudents] = useState<any[]>([]);
  const [recentMemos, setRecentMemos] = useState<VoiceMemo[]>([]);
  const [mentorVerificationStatus, setMentorVerificationStatus] = useState<'pending' | 'verified' | 'rejected' | null>(null);
  const [nextMeeting, setNextMeeting] = useState<Meeting | null>(null);
  const [mentorProfileData, setMentorProfileData] = useState<any>(null);

  const [referredByName, setReferredByName] = useState<string | null>(null);
  const [referralBannerDismissed, setReferralBannerDismissed] = useState(true);

  const isStudent = profile?.role === 'student';
  const greeting = getGreeting();
  const theme = isStudent
    ? { headerBg: Colors.primaryDark, primary: Colors.primary, light: Colors.primaryLight, glow: Colors.primaryGlow, shadow: '#0D4F5C' }
    : { headerBg: MENTOR_THEME.headerBg, primary: MENTOR_THEME.primary, light: MENTOR_THEME.light, glow: MENTOR_THEME.glow, shadow: MENTOR_THEME.shadow };

  useEffect(() => {
    if (!user || !isStudent) return;
    const DISMISSED_KEY = `mentara_referral_banner_dismissed_${user.id}`;
    SecureStore.getItemAsync(DISMISSED_KEY).then((val) => {
      if (val === 'true') return;
      getReferredByInfo(user.id).then((info) => {
        if (info?.name) {
          setReferredByName(info.name);
          setReferralBannerDismissed(false);
        }
      });
    });
  }, [user, isStudent]);

  const dismissReferralBanner = async () => {
    if (!user) return;
    setReferralBannerDismissed(true);
    try {
      await SecureStore.setItemAsync(`mentara_referral_banner_dismissed_${user.id}`, 'true');
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    if (user && isStudent) {
      getStudentProfile(user.id).then(({ data }) => {
        if (!cancelled && data) setStudentProfile(data);
      });
      getRecentVoiceMemos(user.id, 3).then((memos) => {
        if (!cancelled) setRecentMemos(memos);
      });
    } else if (user && !isStudent) {
      getMentorStudents(user.id).then((data) => {
        if (!cancelled) setMentorStudents(data ?? []);
      });
      getMentorMeetings(user.id).then((meetings) => {
        if (!cancelled) {
          const now = new Date();
          const upcoming = meetings
            .filter(m => new Date(m.scheduled_at) > now)
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
          setNextMeeting(upcoming[0] ?? null);
        }
      });
      getMentorProfile(user.id).then(({ data }) => {
        if (!cancelled && data) {
          setMentorVerificationStatus(data.verification_status ?? 'pending');
          setMentorProfileData(data);
        }
      });
    }
    return () => { cancelled = true; };
  }, [user, isStudent]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (user && isStudent) {
      const [{ data }, memos] = await Promise.all([
        getStudentProfile(user.id),
        getRecentVoiceMemos(user.id, 3),
      ]);
      if (data) setStudentProfile(data);
      setRecentMemos(memos);
    } else if (user && !isStudent) {
      const [students, meetings, { data: mp }] = await Promise.all([
        getMentorStudents(user.id),
        getMentorMeetings(user.id),
        getMentorProfile(user.id),
      ]);
      setMentorStudents(students ?? []);
      const now = new Date();
      const upcoming = meetings
        .filter(m => new Date(m.scheduled_at) > now)
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
      setNextMeeting(upcoming[0] ?? null);
      if (mp) {
        setMentorVerificationStatus(mp.verification_status ?? 'pending');
        setMentorProfileData(mp);
      }
    }
    setRefreshing(false);
  };

  const fieldColor = selectedField ? (FIELD_COLORS[selectedField] ?? Colors.primary) : Colors.primary;
  const fieldInfo = selectedField ? FIELD_INFO[selectedField] : null;

  const profileFields = useMemo(() => !isStudent ? [
    { label: 'Bio', done: !!profile?.bio },
    { label: 'Title', done: !!mentorProfileData?.title },
    { label: 'Institution', done: !!mentorProfileData?.institution },
    { label: 'Expertise', done: (mentorProfileData?.fields_of_expertise?.length ?? 0) > 0 },
    { label: 'LinkedIn', done: !!mentorProfileData?.linkedin_url },
    { label: 'Mentoring style', done: !!mentorProfileData?.mentoring_style },
    { label: 'Availability', done: (mentorProfileData?.availability?.length ?? 0) > 0 },
  ] : [], [isStudent, profile?.bio, mentorProfileData]);

  const profilePct = useMemo(() => profileFields.length > 0
    ? Math.round(profileFields.filter(f => f.done).length / profileFields.length * 100)
    : 0, [profileFields]);

  // Student's primary field for Card D
  const studentFirstField = !isStudent && mentorStudents.length > 0
    ? (mentorStudents[0].student_profile?.fields_of_interest?.[0] ?? null)
    : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── Hero Header ───────────────────────────────────────── */}
        <View style={[styles.header, { backgroundColor: theme.headerBg }]}>
            <View style={styles.headerTop}>
              <View style={styles.greetingGroup}>
                <Text style={styles.greeting}>{greeting}</Text>
                <Text style={styles.userName}>
                  {profile?.full_name?.split(' ')[0] ?? 'Explorer'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(app)/(tabs)/profile')}
                accessibilityLabel="Go to my profile"
                accessibilityRole="button"
                style={styles.avatarBtn}
              >
                <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={44} />
              </TouchableOpacity>
            </View>
            <Text style={styles.headerSubtitle}>Your personal dashboard</Text>
        </View>

        {/* ── Quick Actions (student only) ──────────────────────── */}
        {isStudent && (
          <View style={styles.quickActionsRow}>
            {([
              { icon: 'person-circle-outline', label: 'My Mentor', route: '/(app)/(tabs)/discover' },
              { icon: 'chatbubble-outline', label: 'Messages', route: '/(app)/(tabs)/messages' },
              { icon: 'calendar-outline', label: 'Schedule', route: '/(app)/(tabs)/schedule' },
            ] as const).map(({ icon, label, route }) => (
              <TouchableOpacity
                key={label}
                style={styles.quickActionBtn}
                onPress={() => router.push(route as any)}
                accessibilityRole="button"
                accessibilityLabel={label}
                activeOpacity={0.8}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: theme.light }]}>
                  <Ionicons name={icon} size={18} color={theme.primary} />
                </View>
                <Text style={[styles.quickActionLabel, { color: theme.primary }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View>

          {/* ── Referred-by banner ───────────────────────────────── */}
          {isStudent && !referralBannerDismissed && referredByName && (
            <View style={styles.referralBanner}>
              <Ionicons name="person-add-outline" size={18} color={Colors.accent3} style={{ flexShrink: 0 }} />
              <Text style={styles.referralBannerText} numberOfLines={2}>
                You were referred by <Text style={styles.referralBannerName}>{referredByName}</Text>!
              </Text>
              <TouchableOpacity
                onPress={dismissReferralBanner}
                accessibilityLabel="Dismiss"
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={18} color={Colors.gray400} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Onboarding tip ───────────────────────────────────── */}
          {isStudent && !profile?.onboarding_complete && (
            <TouchableOpacity
              style={styles.tipCard}
              onPress={() => router.push('/(auth)/onboarding')}
              accessibilityLabel="Complete your profile to get better mentor matches"
              accessibilityRole="button"
            >
              <View style={styles.tipIconWrap}>
                <Ionicons name="sparkles" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.tipText}>Complete your profile to get better mentor matches</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}

          {/* ── Student: Goal Map ────────────────────────────────── */}
          {isStudent && user && (
            <GoalMapCard studentId={user.id} themeColor={theme.primary} />
          )}

          {/* ── Student: Journey (voice memo reflections) ────────── */}
          {isStudent && recentMemos.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleGroup}>
                  <SectionLabel text="YOUR JOURNEY" color={theme.primary} />
                  <Text style={styles.sectionTitle}>Reflections</Text>
                </View>
              </View>
              <View style={styles.memoList}>
                {recentMemos.map((memo) => (
                  <View key={memo.id} style={[styles.memoCard, { borderLeftColor: theme.primary }]}>
                    <Text style={styles.memoDate}>
                      {new Date(memo.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                    {memo.ai_insight && (
                      <Text style={styles.memoInsight} numberOfLines={3}>{memo.ai_insight}</Text>
                    )}
                    {memo.ai_action_item && (
                      <View style={styles.memoActionChip}>
                        <Ionicons name="arrow-forward-circle" size={12} color={theme.primary} />
                        <Text style={[styles.memoActionText, { color: theme.primary }]} numberOfLines={1}>
                          {memo.ai_action_item}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Student: Explore Fields ──────────────────────────── */}
          {isStudent && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleGroup}>
                  <SectionLabel text="EXPLORE" color={theme.primary} />
                  <Text style={styles.sectionTitle}>Popular Fields</Text>
                </View>
              </View>
              <View style={styles.fieldsGrid}>
                {FEATURED_HOME_FIELDS.map((field) => (
                  <FieldCard key={field} field={field} onPress={() => setSelectedField(field)} />
                ))}
              </View>
            </View>
          )}

          {/* ── Mentor: Verification Banners ─────────────────────── */}
          {!isStudent && mentorVerificationStatus === 'pending' && (
            <View style={styles.verifyBanner}>
              <View style={styles.verifyBannerIcon}>
                <Ionicons name="shield-outline" size={18} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.verifyBannerTitle}>Profile under review</Text>
                <Text style={styles.verifyBannerDesc}>Our team is verifying your credentials. You'll be matched with a student as soon as you're approved — usually within 24 hours.</Text>
              </View>
            </View>
          )}
          {!isStudent && mentorVerificationStatus === 'rejected' && (
            <View style={[styles.verifyBanner, styles.verifyBannerRejected]}>
              <View style={[styles.verifyBannerIcon, { backgroundColor: Colors.errorLight }]}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifyBannerTitle, { color: Colors.error }]}>Verification unsuccessful</Text>
                <Text style={styles.verifyBannerDesc}>We couldn't verify your profile. Please update your LinkedIn URL in your profile and contact support@mentara.me.</Text>
              </View>
            </View>
          )}

          {/* ── Mentor: Card A — Next Call Countdown ─────────────── */}
          {!isStudent && nextMeeting && (
            <View style={styles.nextCallCard}>
              <View style={[styles.nextCallIconWrap, { backgroundColor: theme.light }]}>
                <Ionicons name="videocam-outline" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nextCallLabel}>NEXT CALL</Text>
                <Text style={styles.nextCallTime}>
                  {new Date(nextMeeting.scheduled_at).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
                <Text style={[styles.nextCallCountdown, { color: theme.primary }]}>
                  {getMeetingCountdown(nextMeeting.scheduled_at)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.nextCallBtn, { backgroundColor: theme.primary }]}
                onPress={() => router.push('/(app)/(tabs)/messages')}
                accessibilityLabel="Go to chat"
                accessibilityRole="button"
              >
                <Ionicons name="chatbubble-outline" size={14} color={Colors.white} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Mentor: Your Student ─────────────────────────────── */}
          {!isStudent && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleGroup}>
                  <SectionLabel text="YOUR STUDENT" color={theme.primary} />
                  <Text style={styles.sectionTitle}>
                    {mentorStudents.length > 0 ? 'Matched' : 'No match yet'}
                  </Text>
                </View>
              </View>

              {mentorStudents.length > 0 ? (
                <View style={styles.studentCards}>
                  {mentorStudents.slice(0, 3).map((assignment: any) => {
                    const student = assignment.other_user ?? {};
                    const fields: string[] = assignment.student_profile?.fields_of_interest ?? [];
                    return (
                      <TouchableOpacity
                        key={assignment.id}
                        style={[styles.studentCard, { borderLeftColor: theme.primary }]}
                        onPress={() => router.push('/(app)/(tabs)/discover')}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${student.full_name}`}
                      >
                        <Avatar uri={student.avatar_url} name={student.full_name} size={40} />
                        <View style={styles.studentCardInfo}>
                          <Text style={styles.studentCardName} numberOfLines={1}>{student.full_name ?? 'Student'}</Text>
                          {fields.length > 0 && (
                            <Text style={[styles.studentCardField, { color: theme.primary }]} numberOfLines={1}>
                              {fields[0]}
                            </Text>
                          )}
                          {student.location ? (
                            <Text style={styles.studentCardMeta} numberOfLines={1}>{student.location}</Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={theme.primary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.mentorEmptyState, { backgroundColor: theme.light, borderColor: theme.glow }]}>
                  <View style={styles.mentorEmptyIcon}>
                    <Ionicons name="hourglass-outline" size={24} color={theme.primary} />
                  </View>
                  <Text style={styles.mentorEmptyTitle}>No students yet</Text>
                  <Text style={styles.mentorEmptyDesc}>You'll be matched when there's a student in your field.</Text>
                  <TouchableOpacity
                    style={[styles.mentorEmptyBtn, { backgroundColor: theme.primary }]}
                    onPress={() => router.push('/(app)/(tabs)/profile')}
                    accessibilityLabel="Complete your mentor profile"
                    accessibilityRole="button"
                  >
                    <Text style={styles.mentorEmptyBtnText}>Complete Profile</Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.white} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── Mentor: Card D — Student's Field ─────────────────── */}
          {!isStudent && studentFirstField && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleGroup}>
                  <SectionLabel text="THEIR FOCUS" color={theme.primary} />
                  <Text style={styles.sectionTitle}>{studentFirstField}</Text>
                </View>
              </View>
              <View style={[styles.fieldFocusCard, { borderLeftColor: FIELD_COLORS[studentFirstField] ?? theme.primary }]}>
                <View style={[styles.fieldFocusIcon, { backgroundColor: (FIELD_COLORS[studentFirstField] ?? theme.primary) + '18' }]}>
                  <Ionicons
                    name={(FIELD_INFO[studentFirstField]?.icon ?? 'school-outline') as any}
                    size={22}
                    color={FIELD_COLORS[studentFirstField] ?? theme.primary}
                  />
                </View>
                <Text style={styles.fieldFocusTagline}>
                  {FIELD_INFO[studentFirstField]?.tagline ?? 'Explore this field'}
                </Text>
                <Text style={styles.fieldFocusDesc} numberOfLines={3}>
                  {FIELD_INFO[studentFirstField]?.description ?? ''}
                </Text>
                <View style={styles.fieldFocusCareers}>
                  {(FIELD_INFO[studentFirstField]?.careers ?? []).slice(0, 2).map(career => (
                    <View key={career} style={[styles.fieldFocusCareerChip, { backgroundColor: (FIELD_COLORS[studentFirstField] ?? theme.primary) + '15' }]}>
                      <Text style={[styles.fieldFocusCareerText, { color: FIELD_COLORS[studentFirstField] ?? theme.primary }]}>{career}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ── Mentor: Card C — Profile Completeness ────────────── */}
          {!isStudent && mentorProfileData && profilePct < 100 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleGroup}>
                  <SectionLabel text="YOUR PROFILE" color={theme.primary} />
                  <Text style={styles.sectionTitle}>Completeness</Text>
                </View>
              </View>
              <View style={styles.profileCard}>
                <View style={styles.profileCardTop}>
                  <View style={[styles.profilePctBadge, { backgroundColor: theme.light }]}>
                    <Text style={[styles.profilePctText, { color: theme.primary }]}>{profilePct}%</Text>
                  </View>
                  <Text style={styles.profileCardDesc}>A complete profile improves your match quality</Text>
                </View>
                <View style={styles.profileProgressBg}>
                  <View style={[styles.profileProgressFill, { width: `${profilePct}%` as any, backgroundColor: theme.primary }]} />
                </View>
                {profileFields.filter(f => !f.done).length > 0 && (
                  <View style={styles.profileFieldList}>
                    {profileFields.filter(f => !f.done).slice(0, 4).map(f => (
                      <View key={f.label} style={styles.profileFieldMissing}>
                        <Ionicons name="ellipse-outline" size={10} color={Colors.gray400} />
                        <Text style={styles.profileFieldMissingText}>{f.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.profileCardBtn, { backgroundColor: theme.primary }]}
                  onPress={() => router.push('/(app)/(tabs)/profile')}
                  accessibilityLabel="Complete your profile"
                  accessibilityRole="button"
                >
                  <Text style={styles.profileCardBtnText}>Complete Profile</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.white} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 24 }} />
        </View>
      </ScrollView>

      {/* ── Field Detail Modal ────────────────────────────────────── */}
      <Modal
        visible={selectedField !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedField(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setSelectedField(null)}
            activeOpacity={1}
            accessibilityLabel="Close"
            accessibilityRole="button"
          />
          <View style={styles.modalSheet} accessibilityViewIsModal={true}>
            <View style={styles.modalDragHandle} />
            <View style={[styles.modalHeader, { backgroundColor: fieldColor + '12', borderBottomColor: fieldColor + '22' }]}>
              <View style={[styles.modalIconWrap, { backgroundColor: fieldColor + '20' }]}>
                <Ionicons name={(fieldInfo?.icon ?? 'school-outline') as any} size={24} color={fieldColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalFieldName}>{selectedField}</Text>
                <Text style={[styles.modalTagline, { color: fieldColor }]}>{fieldInfo?.tagline}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedField(null)}
                accessibilityLabel="Close"
                accessibilityRole="button"
              >
                <Ionicons name="close-circle" size={26} color={Colors.gray300} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDescription}>{fieldInfo?.description}</Text>

              <View style={styles.modalCareersSection}>
                <Text style={styles.modalCareersTitle}>Popular careers</Text>
                <View style={styles.modalCareersList}>
                  {fieldInfo?.careers.map((career) => (
                    <View key={career} style={styles.modalCareerItem}>
                      <View style={[styles.modalCareerDot, { backgroundColor: fieldColor }]} />
                      <Text style={styles.modalCareerText}>{career}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}


function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xl, gap: 14,
    backgroundColor: Colors.primaryDark,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingGroup: { gap: 2 },
  greeting: { fontFamily: Fonts.script, fontSize: 20, color: 'rgba(255,255,255,0.75)', lineHeight: 28 },
  userName: { ...Typography.displaySm, color: Colors.white },
  avatarBtn: {
    borderRadius: Radius.full, padding: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    minWidth: 44, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  headerSubtitle: {
    ...Typography.bodyMd,
    color: 'rgba(255,255,255,0.55)',
    fontFamily: Fonts.sansMedium,
  },

  quickActionsRow: {
    flexDirection: 'row', marginHorizontal: Spacing.md,
    marginTop: Spacing.md, marginBottom: Spacing.sm, gap: 10,
  },
  quickActionBtn: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  quickActionIcon: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
  },
  quickActionLabel: {
    ...Typography.caption, fontFamily: Fonts.sansSemiBold, letterSpacing: 0.2,
  },

  referralBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.accent3Light ?? '#EAF5EF',
    borderRadius: Radius.lg, margin: Spacing.md, marginBottom: 0,
    padding: 13, borderWidth: 1, borderColor: Colors.accent3Glow ?? '#C6E4CE',
  },
  referralBannerText: {
    flex: 1, fontSize: 13, color: Colors.dark, fontFamily: Fonts.sansMedium, lineHeight: 18,
  },
  referralBannerName: {
    fontFamily: Fonts.sansBold, color: Colors.accent3,
  },

  tipCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.accentLight, margin: Spacing.md,
    borderRadius: Radius.lg, padding: 14,
    borderWidth: 1, borderColor: Colors.accentGlow,
    ...Shadow.sm,
  },
  tipIconWrap: {
    width: 32, height: 32,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },
  tipText: { flex: 1, ...Typography.bodyMd, color: Colors.dark, fontFamily: Fonts.sansMedium },

  section: { paddingHorizontal: Spacing.md, paddingTop: Spacing.xl, gap: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionTitleGroup: { gap: 5 },
  sectionTitle: { ...Typography.displaySm, color: Colors.dark },

  sectionLabel: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  sectionLabelText: { ...Typography.label, color: Colors.gray500 },

  fieldsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  fieldCard: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    gap: 5,
    ...Shadow.sm,
  },
  fieldCardIcon: {
    width: 34, height: 34, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldCardName: {
    ...Typography.headingSm,
    color: Colors.dark,
    marginTop: 2,
  },
  fieldCardTagline: {
    ...Typography.bodySm,
    color: Colors.gray500,
    lineHeight: 16,
  },

  seeAllLink: { ...Typography.bodySm, fontFamily: Fonts.sansSemiBold },

  studentCards: { gap: 10 },
  studentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
    ...Shadow.sm,
  },
  studentCardInfo: { flex: 1, gap: 2 },
  studentCardName: { ...Typography.headingSm, color: Colors.dark },
  studentCardField: { ...Typography.bodySm, fontFamily: Fonts.sansSemiBold },
  studentCardMeta: { ...Typography.caption, color: Colors.gray400 },

  mentorEmptyState: {
    borderRadius: Radius.xl, borderWidth: 1,
    padding: 22, gap: 12, alignItems: 'center',
  },
  mentorEmptyIcon: {
    width: 52, height: 52,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    ...Shadow.sm,
  },
  mentorEmptyTitle: { ...Typography.headingSm, color: Colors.dark, textAlign: 'center' },
  mentorEmptyDesc: { ...Typography.bodyMd, color: Colors.gray500, textAlign: 'center', lineHeight: 22 },
  mentorEmptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: Radius.full, marginTop: 4,
  },
  mentorEmptyBtnText: { ...Typography.bodySm, fontFamily: Fonts.sansBold, color: Colors.white },

  memoList: { gap: 10 },
  memoCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 14, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
    gap: 6, ...Shadow.sm,
  },
  memoDate: { ...Typography.caption, color: Colors.gray400 },
  memoInsight: { ...Typography.bodyMd, color: Colors.dark, lineHeight: 20 },
  memoActionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primaryLight, borderRadius: Radius.sm,
    paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start',
  },
  memoActionText: { ...Typography.caption, fontFamily: Fonts.sansMedium, flexShrink: 1 },

  verifyBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: Colors.warningLight, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.warning,
    padding: 14, marginHorizontal: 16, marginTop: 16, marginBottom: 0,
    ...Shadow.sm,
  },
  verifyBannerRejected: {
    backgroundColor: Colors.errorLight, borderColor: Colors.error,
  },
  verifyBannerIcon: {
    width: 34, height: 34, borderRadius: Radius.sm,
    backgroundColor: Colors.warningLight, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  verifyBannerTitle: {
    fontFamily: Fonts.sansBold, fontSize: 13, color: Colors.warning, marginBottom: 3,
  },
  verifyBannerDesc: {
    fontFamily: Fonts.sans, fontSize: 12, color: Colors.gray500, lineHeight: 17,
  },

  // Card A — Next Call
  nextCallCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 16, marginHorizontal: 16, marginTop: 16,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  nextCallIconWrap: {
    width: 46, height: 46, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  nextCallLabel: {
    fontFamily: Fonts.sansBold, fontSize: 10, color: Colors.gray400,
    letterSpacing: 0.8, marginBottom: 2,
  },
  nextCallTime: {
    fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.dark, lineHeight: 18,
  },
  nextCallCountdown: {
    fontFamily: Fonts.sansBold, fontSize: 12, marginTop: 2,
  },
  nextCallBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // Card D — Student's Field
  fieldFocusCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 4, gap: 10, ...Shadow.sm,
  },
  fieldFocusIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start',
  },
  fieldFocusTagline: {
    fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.dark,
  },
  fieldFocusDesc: {
    fontFamily: Fonts.sans, fontSize: 13, color: Colors.gray500, lineHeight: 19,
  },
  fieldFocusCareers: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2,
  },
  fieldFocusCareerChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  fieldFocusCareerText: {
    fontFamily: Fonts.sansSemiBold, fontSize: 11,
  },

  // Card C — Profile Completeness
  profileCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
    gap: 12, ...Shadow.sm,
  },
  profileCardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  profilePctBadge: {
    width: 52, height: 52, borderRadius: Radius.full,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  profilePctText: {
    fontFamily: Fonts.sansBold, fontSize: 16,
  },
  profileCardDesc: {
    flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: Colors.gray500, lineHeight: 18,
  },
  profileProgressBg: {
    height: 6, backgroundColor: Colors.gray200, borderRadius: Radius.full, overflow: 'hidden',
  },
  profileProgressFill: {
    height: 6, borderRadius: Radius.full,
  },
  profileFieldList: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  profileFieldMissing: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  profileFieldMissingText: {
    fontFamily: Fonts.sans, fontSize: 12, color: Colors.gray400,
  },
  profileCardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: Radius.md,
  },
  profileCardBtnText: {
    fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.white,
  },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    overflow: 'hidden',
    maxHeight: '72%',
  },
  modalDragHandle: {
    alignSelf: 'center',
    width: 38, height: 4,
    backgroundColor: Colors.gray200,
    marginTop: 10, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 20,
    borderBottomWidth: 1,
  },
  modalIconWrap: {
    width: 48, height: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  modalFieldName: { ...Typography.displaySm, color: Colors.dark },
  modalTagline: {
    ...Typography.bodySm,
    fontFamily: Fonts.sansSemiBold,
    marginTop: 2,
  },
  modalBody: { padding: 20 },
  modalDescription: {
    ...Typography.bodyLg,
    color: Colors.gray700,
    lineHeight: 26,
    marginBottom: 20,
  },
  modalCareersSection: { gap: 10, marginBottom: 24 },
  modalCareersTitle: { ...Typography.headingSm, color: Colors.dark },
  modalCareersList: { gap: 10 },
  modalCareerItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalCareerDot: { width: 6, height: 6 },
  modalCareerText: { ...Typography.bodyMd, color: Colors.gray700 },
});
