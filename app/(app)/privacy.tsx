import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

const LAST_UPDATED = 'May 25, 2026';

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={Colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lastUpdated}>Last updated: {LAST_UPDATED}</Text>

        <Text style={styles.intro}>
          Mentara ("we", "our", or "us") is committed to protecting your privacy. This Privacy
          Policy explains how we collect, use, and share information when you use the Mentara
          mobile application.
        </Text>

        <Section title="1. Information We Collect">
          <P>We collect the following types of information:</P>
          <Bullet>
            <Text style={styles.bold}>Account Information:</Text> Your name and email address
            when you register. If you sign in with Google or Apple, we receive your name and
            email from those providers.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Profile Information:</Text> Bio, location, website, areas
            of expertise (mentors), grade level and learning goals (students), and profile
            photo you optionally provide.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Messages:</Text> The content of messages you exchange
            with mentors or students through the in-app chat.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Reviews:</Text> Ratings and written reviews you submit
            for mentors.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Voice Reflections:</Text> Short voice memos you may
            optionally record after a mentorship call. We transcribe these using AI to give
            you summary insights; the audio file and transcript are stored privately.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Push Notification Tokens:</Text> If you grant
            notification permission, we store a device-specific push token used solely to
            deliver in-app alerts (new messages, meeting reminders, AI matches).
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Usage Data:</Text> Basic app usage information such as
            screens visited and features used, collected to improve the app experience.
          </Bullet>
        </Section>

        <Section title="2. How We Use Your Information">
          <P>We use your information to:</P>
          <Bullet>Create and maintain your account</Bullet>
          <Bullet>Connect students with mentors and facilitate communication</Bullet>
          <Bullet>Display your public profile to other users</Bullet>
          <Bullet>Match students with mentors using AI (Google Gemini, server-side)</Bullet>
          <Bullet>Improve the app and fix bugs</Bullet>
          <Bullet>Respond to support requests</Bullet>
          <Bullet>Comply with legal obligations</Bullet>
        </Section>

        <Section title="3. Information Sharing">
          <P>
            We do not sell your personal information. We share information only in the following
            circumstances:
          </P>
          <Bullet>
            <Text style={styles.bold}>Other Users:</Text> Your profile information (name,
            bio, expertise, rating) is visible to other Mentara users. Messages are shared
            only with the specific mentor or student you are chatting with.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Service Providers:</Text> We use Supabase for database,
            authentication, storage, and realtime messaging. We use Google Gemini (server-side)
            to power AI-driven mentor matching and post-call reflection summaries. We use Expo
            Push Notification Service to deliver notifications to your device. These providers
            process data only as needed to provide their services and are bound by their own
            privacy commitments.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Legal Requirements:</Text> We may disclose information
            if required by law or to protect the rights and safety of users.
          </Bullet>
        </Section>

        <Section title="4. Data Storage and Security">
          <P>
            Your data is stored on servers provided by Supabase, which uses industry-standard
            security practices. Authentication tokens are stored in encrypted storage on your
            device. We implement row-level security policies to ensure users can only access
            data they are authorized to view.
          </P>
          <P>
            No method of transmission over the internet or electronic storage is 100% secure.
            While we strive to use commercially acceptable means to protect your information,
            we cannot guarantee absolute security.
          </P>
        </Section>

        <Section title="5. Data Retention">
          <P>
            We retain your account data for as long as your account is active. If you delete
            your account, your profile and associated data will be deleted within 30 days,
            except where retention is required by law.
          </P>
          <P>
            Messages are retained to provide conversation history. You may contact us to
            request deletion of specific messages.
          </P>
        </Section>

        <Section title="6. Your Rights">
          <P>You have the right to:</P>
          <Bullet>Access the personal information we hold about you</Bullet>
          <Bullet>Correct inaccurate information via your profile settings</Bullet>
          <Bullet>Request deletion of your account and associated data</Bullet>
          <Bullet>Withdraw consent for optional data processing at any time</Bullet>
          <Bullet>Report another user for inappropriate behavior</Bullet>
        </Section>

        <Section title="7. Children's Privacy">
          <P>
            Mentara is intended for users aged 13 and older. We do not knowingly collect
            personal information from children under 13. If we become aware that a child
            under 13 has provided us with personal information, we will delete it promptly.
            Users between 13–17 must have parental or guardian consent before using Mentara.
            If you are a parent or guardian and believe your child has provided us with
            personal information without your consent, please contact us immediately at
            mentarasupport@gmail.com.
          </P>
        </Section>

        <Section title="8. Third-Party Sign-In">
          <P>
            When you sign in with Google or Apple, we receive your name and email address
            from those services. Your use of Google Sign-In is subject to Google's Privacy
            Policy. Your use of Sign in with Apple is subject to Apple's Privacy Policy.
            We do not receive your password from these providers.
          </P>
        </Section>

        <Section title="9. Changes to This Policy">
          <P>
            We may update this Privacy Policy from time to time. We will notify you of
            significant changes by updating the "Last updated" date at the top of this page
            and, where appropriate, through an in-app notification. Your continued use of
            the app after changes constitutes acceptance of the updated policy.
          </P>
        </Section>

        <Section title="10. Contact Us">
          <P>
            If you have questions about this Privacy Policy or wish to exercise your data
            rights, please contact us at:
          </P>
          <P>Email: mentarasupport@gmail.com</P>
          <P>
            We will respond to all requests within 30 days.
          </P>
        </Section>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gray100,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.dark,
  },

  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 4,
  },

  lastUpdated: {
    fontSize: 12,
    color: Colors.gray400,
    marginBottom: 12,
  },
  intro: {
    fontSize: 15,
    color: Colors.gray700,
    lineHeight: 24,
    marginBottom: 24,
  },

  section: {
    marginBottom: 28,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.dark,
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: Colors.gray700,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: Colors.dark,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 5, height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.primary,
    marginTop: 9,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: Colors.gray700,
    lineHeight: 22,
  },
});
