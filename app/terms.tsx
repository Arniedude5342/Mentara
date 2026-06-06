import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Logo from '@/components/Logo';
import { Colors, Radius, Shadow, Typography } from '@/constants/theme';

const SECTIONS = [
  {
    number: '01',
    title: 'Acceptance of Terms',
    body: 'By downloading, installing, or using the Mentara application, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the service. Your continued use of Mentara after any updates to these Terms constitutes your acceptance of the revised terms.',
  },
  {
    number: '02',
    title: 'Use of Service',
    body: 'Mentara provides a platform for students to connect with mentors and educational professionals. The service is intended for lawful, educational purposes only. You must be at least 13 years of age to use Mentara. Users under 18 must have parental or guardian consent before creating an account or using any features of the platform.',
  },
  {
    number: '03',
    title: 'User Accounts',
    body: 'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to provide accurate, current, and complete information when creating your account and to update it as necessary. Mentara reserves the right to suspend or terminate accounts that violate these Terms, provide false information, or that we determine, in our sole discretion, are being used inappropriately.',
  },
  {
    number: '04',
    title: 'User Conduct',
    body: 'You agree to use Mentara respectfully and responsibly. You must not use the platform to: harass, bully, threaten, or intimidate other users; share false, misleading, or deceptive information; impersonate another person or organization; upload or transmit harmful, obscene, defamatory, or illegal content; attempt to gain unauthorized access to any part of the platform or its systems; or use Mentara for any commercial solicitation not expressly permitted by us.',
  },
  {
    number: '05',
    title: 'Intellectual Property',
    body: 'All content, features, and functionality of Mentara, including but not limited to text, graphics, logos, icons, and software, are the property of Mentara and are protected by applicable intellectual property laws. User-generated content (such as profile bios, messages, and reviews) remains the property of the respective user, but by posting content you grant Mentara a non-exclusive, royalty-free license to display it within the platform for the purpose of operating the service.',
  },
  {
    number: '06',
    title: 'Disclaimer of Warranties',
    body: 'Mentara is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied. We do not guarantee that the service will be uninterrupted, error-free, or free of harmful components. Importantly, Mentara does not independently verify the academic credentials, professional qualifications, or identity claims of any mentor on the platform. You engage with mentors at your own discretion and risk.',
  },
  {
    number: '07',
    title: 'Privacy',
    body: 'Your use of Mentara is also governed by our Privacy Policy, which is incorporated into these Terms by reference. We collect, store, and use your personal information as described in the Privacy Policy. By creating an account and using Mentara, you consent to the collection and use of your information as outlined therein. We take reasonable measures to protect your data but cannot guarantee absolute security.',
  },
  {
    number: '08',
    title: 'Changes to Terms',
    body: 'Mentara reserves the right to modify these Terms of Service at any time. When we make material changes, we will notify users via the application or by email to the address associated with your account. Your continued use of Mentara after changes are posted constitutes your acceptance of the revised Terms. If you do not agree with the updated Terms, you must stop using the service.',
  },
  {
    number: '09',
    title: 'Contact Us',
    body: 'If you have any questions, concerns, or feedback about these Terms of Service or your experience with Mentara, please reach out to us. We are committed to resolving any issues promptly and fairly.\n\nEmail: mentarasupport@gmail.com',
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Header */}
        <LinearGradient
          colors={['#083540', '#0D4F5C', '#1A7A8A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          {/* Decorative circles */}
          <View style={styles.circle1} />
          <View style={styles.circle2} />

          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={20} color={Colors.white} />
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <Logo size="sm" light />
          </View>

          <View style={styles.headerBadge}>
            <Ionicons name="document-text-outline" size={13} color={Colors.accent} />
            <Text style={styles.headerBadgeText}>Legal</Text>
          </View>

          <Text style={styles.headerTitle}>Terms of Service</Text>
          <Text style={styles.headerSub}>Last updated: May 2026</Text>
        </LinearGradient>

        {/* Intro card */}
        <View style={styles.introCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.introText}>
            Please read these terms carefully before using Mentara. They explain your rights and responsibilities as a user of our platform.
          </Text>
        </View>

        {/* Sections */}
        <View style={styles.sectionsContainer}>
          {SECTIONS.map((s) => (
            <View key={s.number} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>{s.number}</Text>
                </View>
                <Text style={styles.sectionTitle}>{s.title}</Text>
              </View>
              <Text style={styles.body}>{s.body}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>© 2026 Mentara · All rights reserved</Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={14} color={Colors.primary} />
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingBottom: 36,
    overflow: 'hidden',
    gap: 10,
  },
  circle1: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -60, right: -60,
  },
  circle2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(245,166,35,0.12)', bottom: -20, left: -30,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  logoWrap: { marginBottom: 4 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  headerBadgeText: { color: Colors.white, fontSize: 12, fontWeight: '600' },
  headerTitle: {
    fontSize: 32, fontWeight: '800', color: Colors.white, lineHeight: 40,
  },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },

  // Intro
  introCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: Colors.primaryLight,
    margin: 20, borderRadius: Radius.lg, padding: 14,
    borderWidth: 1, borderColor: `${Colors.primary}20`,
    ...Shadow.sm,
  },
  introText: {
    flex: 1, fontSize: 13, color: Colors.primary, lineHeight: 20, fontWeight: '500',
  },

  // Sections
  sectionsContainer: { paddingHorizontal: 20, gap: 16 },
  section: {
    backgroundColor: Colors.white, borderRadius: Radius.lg, padding: 18, gap: 12,
    borderWidth: 1, borderColor: 'rgba(13,79,92,0.08)',
    shadowColor: '#0D4F5C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  numberBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  numberText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: Colors.dark, flex: 1,
  },
  body: {
    fontSize: 14, color: Colors.gray700, lineHeight: 22,
  },

  // Footer
  footer: { paddingHorizontal: 24, paddingTop: 24, gap: 12, alignItems: 'center' },
  footerDivider: { height: 1, backgroundColor: Colors.gray200, alignSelf: 'stretch' },
  footerText: { fontSize: 12, color: Colors.gray400 },
  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: Radius.full, backgroundColor: Colors.primaryLight,
  },
  backLinkText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
});
