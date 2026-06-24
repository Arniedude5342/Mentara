import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Logo from '@/components/Logo';
import { Colors, Radius, Shadow, Typography } from '@/constants/theme';

const TEAM_VALUES = [
  {
    icon: 'heart-outline' as const,
    title: 'Accessibility',
    desc: 'Quality mentorship should be available to every student, regardless of their background or financial situation.',
    color: '#EF4444',
  },
  {
    icon: 'bulb-outline' as const,
    title: 'Guidance',
    desc: 'With the right mentor at the right moment, any student can move further, faster.',
    color: Colors.accent,
  },
  {
    icon: 'people-outline' as const,
    title: 'Community',
    desc: "I'm building a global village where knowledge flows freely between generations.",
    color: Colors.primary,
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Trust',
    desc: 'Every interaction on Mentara is built on verified mentors and mutual respect.',
    color: Colors.success,
  },
];

export default function AboutScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={['#083540', '#0D4F5C']}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>

          <Logo size="md" light />

          <Text style={styles.headerTitle}>About Mentara</Text>
          <Text style={styles.headerSub}>
            Connecting students with professors and professionals who have been there.
          </Text>
        </LinearGradient>

        {/* Our Story */}
        <View style={styles.section}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>MY STORY</Text>
          </View>
          <Text style={styles.sectionTitle}>Why I built Mentara</Text>
          <Text style={styles.body}>
            Mentara was born out of a simple observation: the students who succeed aren't always the most talented. They're often the ones who had access to the right guidance at the right moment.
          </Text>
          <Text style={styles.body}>
            I watched peers navigate their careers without direction, limited by geography, networks, or finances, while brilliant professors and industry professionals had hard-won knowledge to share but no easy way to reach students who needed it most.
          </Text>
          <Text style={styles.body}>
            So I built Mentara. A platform where any student, anywhere, can be matched directly with a world-class mentor in their field. No gatekeepers. No expensive fees. Just real guidance, one call at a time.
          </Text>
        </View>

        {/* Mission */}
        <LinearGradient
          colors={[Colors.primaryLight, '#DBEAFE']}
          style={styles.missionCard}
        >
          <Ionicons name="telescope-outline" size={32} color={Colors.primary} />
          <Text style={styles.missionTitle}>My Mission</Text>
          <Text style={styles.missionText}>
            To open up access to mentorship by connecting every curious student with the expertise they need to light their path. Completely free.
          </Text>
        </LinearGradient>

        {/* Values */}
        <View style={styles.section}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>WHAT I BELIEVE</Text>
          </View>
          <Text style={styles.sectionTitle}>My core values</Text>
          {TEAM_VALUES.map((v) => (
            <View key={v.title} style={styles.valueCard}>
              <View style={[styles.valueIcon, { backgroundColor: `${v.color}18` }]}>
                <Ionicons name={v.icon} size={24} color={v.color} />
              </View>
              <View style={styles.valueText}>
                <Text style={styles.valueTitle}>{v.title}</Text>
                <Text style={styles.valueDesc}>{v.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* How it helps */}
        <View style={[styles.section, { backgroundColor: Colors.gray100 }]}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>THE IMPACT</Text>
          </View>
          <Text style={styles.sectionTitle}>Who Mentara is for</Text>

          <View style={styles.audienceCard}>
            <View style={[styles.audienceIcon, { backgroundColor: Colors.primaryLight }]}>
              <Ionicons name="school-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={styles.audienceTitle}>Students</Text>
            <Text style={styles.audienceDesc}>
              Whether you're in high school exploring career paths, navigating your undergrad, or deep in grad school research, Mentara connects you with expert guidance. Ask questions, get feedback on your work, and build relationships that last a career.
            </Text>
          </View>

          <View style={styles.audienceCard}>
            <View style={[styles.audienceIcon, { backgroundColor: Colors.accentLight }]}>
              <Ionicons name="briefcase-outline" size={28} color={Colors.accent} />
            </View>
            <Text style={styles.audienceTitle}>Mentors</Text>
            <Text style={styles.audienceDesc}>
              As a professor or professional, you have knowledge that can change a student's trajectory. Mentara gives you a simple way to give back, on your schedule, in your area of expertise, with students who are eager to learn.
            </Text>
          </View>
        </View>

        {/* CTA */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaTitle}>Join the Mentara community</Text>
          <Text style={styles.ctaDesc}>
            Whether you're looking to learn or to teach, there's a place for you on Mentara.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/(auth)/register')}
            activeOpacity={0.85}
            accessibilityLabel="Get started free"
            accessibilityRole="button"
          >
            <Text style={styles.ctaBtnText}>Get Started Free</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityLabel="Back to Home"
            accessibilityRole="button"
          >
            <Text style={styles.backLink}>← Back to Home</Text>
          </TouchableOpacity>
          <View style={styles.contactRow}>
            <Text style={styles.contactText}>Questions? </Text>
            <TouchableOpacity
              onPress={() => Linking.openURL('mailto:support@mentara.me').catch(() => {})}
              accessibilityLabel="Email Mentara support"
              accessibilityRole="button"
            >
              <Text style={styles.contactEmail}>support@mentara.me</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
    alignItems: 'flex-start',
  },
  backBtn: {
    padding: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
  },
  headerTitle: {
    fontSize: 32, fontWeight: '800', color: Colors.white, marginTop: 8,
  },
  headerSub: {
    fontSize: 16, color: 'rgba(255,255,255,0.82)', lineHeight: 24,
  },
  section: { padding: 24, gap: 16 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary,
  },
  eyebrow: {
    fontSize: 11, fontWeight: '700', color: Colors.primary,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  sectionTitle: { ...Typography.displaySm, color: Colors.dark },
  body: {
    fontSize: 15, color: Colors.gray700, lineHeight: 24,
  },
  missionCard: {
    margin: 24, borderRadius: Radius.xl,
    padding: 28, gap: 12, alignItems: 'center',
  },
  missionTitle: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  missionText: {
    fontSize: 15, color: Colors.gray700, lineHeight: 24, textAlign: 'center',
  },
  valueCard: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 16, ...Shadow.sm,
  },
  valueIcon: {
    width: 48, height: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  valueText: { flex: 1, gap: 4 },
  valueTitle: { fontSize: 16, fontWeight: '700', color: Colors.dark },
  valueDesc: { fontSize: 14, color: Colors.gray500, lineHeight: 20 },

  audienceCard: {
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    padding: 20, gap: 10, ...Shadow.sm,
  },
  audienceIcon: {
    width: 52, height: 52, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  audienceTitle: { fontSize: 18, fontWeight: '700', color: Colors.dark },
  audienceDesc: { fontSize: 14, color: Colors.gray700, lineHeight: 22 },

  ctaSection: {
    padding: 24, gap: 14, alignItems: 'center',
  },
  ctaTitle: { fontSize: 24, fontWeight: '800', color: Colors.dark, textAlign: 'center' },
  ctaDesc: { fontSize: 15, color: Colors.gray500, textAlign: 'center', lineHeight: 22 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 28, paddingVertical: 14, ...Shadow.lg,
  },
  ctaBtnText: { fontWeight: '700', color: Colors.white, fontSize: 15 },
  backLink: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  contactRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  contactText: { fontSize: 13, color: Colors.gray500 },
  contactEmail: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
});
