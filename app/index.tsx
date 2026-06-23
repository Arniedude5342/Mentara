import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, withDelay, Easing, useReducedMotion,
} from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';
import Logo from '@/components/Logo';
import { Colors, Radius, Shadow, Fonts } from '@/constants/theme';

const { width } = Dimensions.get('window');

const MENTORS_PREVIEW = [
  { name: 'Dr. Amara Osei', field: 'Neuroscience', initials: 'AO', accentColor: Colors.accent3 },
  { name: 'Prof. Vikram Nair', field: 'Computer Science', initials: 'VN', accentColor: Colors.primary },
  { name: 'Dr. Lucia Ferreira', field: 'International Law', initials: 'LF', accentColor: Colors.accent4 },
];

const FIELDS = [
  'Computer Science', 'Medicine', 'Law', 'Finance', 'Engineering', 'Design',
  'Biology', 'Psychology', 'Architecture', 'Marketing',
  'Artificial Intelligence', 'Business', 'Data Science', 'Cybersecurity',
  'Philosophy', 'History', 'Music', 'Nursing', 'Pharmacy', 'Journalism',
];

const FEATURES = [
  {
    icon: 'people-outline' as const,
    title: 'Real mentors',
    desc: 'Working professors and industry professionals, not coaches for hire.',
    accentColor: Colors.primary,
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Structured sessions',
    desc: 'Monthly calls, action items, and check-ins — built in. No guesswork.',
    accentColor: Colors.accent2,
  },
  {
    icon: 'compass-outline' as const,
    title: '31 fields',
    desc: "Medicine, finance, AI, law, and more. Whatever you're going into, there's a mentor for that.",
    accentColor: Colors.accent,
  },
];

const WHAT_YOU_GET = [
  { icon: 'time-outline' as const, title: 'About one hour a month', desc: "One call per month, around 45–60 minutes. That's the whole commitment.", color: Colors.primary },
  { icon: 'flash-outline' as const, title: 'We handle the rest', desc: "Scheduling, topic suggestions, follow-ups. Mentara takes care of it. You just show up.", color: Colors.accent },
  { icon: 'chatbubble-ellipses-outline' as const, title: 'No daily messages', desc: "Between calls, coordination happens through the app. You won't be fielding ongoing questions.", color: Colors.accent3 },
  { icon: 'shield-checkmark-outline' as const, title: 'Easy exit if needed', desc: "Not a good fit after the first call? Just let us know. We'll reassign you with no awkwardness.", color: Colors.accent4 },
];

const CALL_STRUCTURE = [
  { step: '01', label: 'We schedule it', detail: 'Mentara sends you both a scheduling prompt. You confirm a time and share your link. Done.', accent: Colors.accent },
  { step: '02', label: 'Topics are pre-generated', detail: "Before the call, you'll see suggested talking points based on your background. No prep required.", accent: Colors.primary },
  { step: '03', label: 'You show up and talk', detail: 'Share what you know. The student comes prepared. One real conversation is worth more than a hundred articles.', accent: Colors.accent3 },
];

const WHY_MENTORS_DO_IT = [
  { icon: 'heart-outline' as const, title: "Real impact on someone's path", desc: "One conversation at the right time changes a career trajectory. You can be that person, on purpose.", color: Colors.accent2 },
  { icon: 'people-outline' as const, title: 'Give back to your field', desc: "The knowledge you've built over years is exactly what the next generation needs. Passing it on is the point.", color: Colors.primary },
  { icon: 'ribbon-outline' as const, title: 'Give back without burning out', desc: "One hour a month is a commitment you can actually keep. Meaningful giving without the overhead.", color: Colors.accent },
];

function FloatingCard({ mentor, delay, index }: { mentor: typeof MENTORS_PREVIEW[0]; delay: number; index: number }) {
  const translateY = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-10, { duration: 2200 + index * 400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2200 + index * 400, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, [reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Reanimated.View style={[styles.floatCard, { marginTop: index * 14 }, animStyle]} accessible={false}>
      <View style={[styles.floatCardAccent, { backgroundColor: mentor.accentColor }]} />
      <View style={[styles.floatCardAvatar, { backgroundColor: `${mentor.accentColor}22` }]}>
        <Text style={[styles.floatCardInitials, { color: mentor.accentColor }]}>{mentor.initials}</Text>
      </View>
      <View style={styles.floatCardInfo}>
        <Text style={styles.floatCardName}>{mentor.name}</Text>
        <Text style={[styles.floatCardField, { color: mentor.accentColor }]}>{mentor.field}</Text>
      </View>
      <View style={styles.floatCardBadge}>
        <Ionicons name="checkmark" size={10} color={Colors.accent3} />
      </View>
    </Reanimated.View>
  );
}

function TickerRow({ fields }: { fields: string[] }) {
  const translateX = useSharedValue(0);
  const totalWidth = fields.reduce((acc, f) => acc + f.length * 9 + 48, 0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    translateX.value = 0;
    if (reduceMotion) return;
    translateX.value = withRepeat(
      withTiming(-totalWidth / 2, { duration: 20000, easing: Easing.linear }),
      -1,
      false
    );
  }, [reduceMotion]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const doubled = [...fields, ...fields];

  return (
    <View style={styles.tickerRow}>
      <Reanimated.View style={[{ flexDirection: 'row' }, animStyle]}>
        {doubled.map((f, i) => (
          <View key={`${f}-${i}`} style={styles.tickerItem}>
            <Text style={styles.tickerText}>{f.toUpperCase()}</Text>
            <View style={styles.tickerDivider} />
          </View>
        ))}
      </Reanimated.View>
    </View>
  );
}

export default function LandingScreen() {
  const insets = useSafeAreaInsets();
  const { session, loading, profile } = useAuth();
  const [heroMode, setHeroMode] = useState<'student' | 'mentor'>('student');

  const heroOpacity = useSharedValue(0);
  const heroStyle = useAnimatedStyle(() => ({ opacity: heroOpacity.value }));

  useEffect(() => {
    heroOpacity.value = withTiming(1, { duration: 500 });
  }, []);

  useEffect(() => {
    if (!loading && session) {
      if (profile?.onboarding_complete) {
        router.replace('/(app)/(tabs)/home');
      } else {
        router.replace('/(auth)/onboarding');
      }
    }
  }, [session, loading, profile]);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View style={[
          styles.hero,
          { paddingTop: insets.top + 16, backgroundColor: heroMode === 'student' ? Colors.primaryDark : Colors.mentorHeaderBg },
        ]}>
          {/* Grid dots */}
          <View style={styles.gridDotsContainer} accessible={false}>
            {Array.from({ length: 20 }).map((_, i) => (
              <View key={i} style={styles.gridDot} />
            ))}
          </View>

          {/* Nav */}
          <View style={styles.nav}>
            <Logo size="md" light />
            <TouchableOpacity
              onPress={() => Linking.openURL('https://mentara.me/#about').catch(() => {})}
              style={styles.aboutBtn}
              accessibilityLabel="About Mentara"
              accessibilityRole="button"
            >
              <Text style={styles.aboutBtnText}>About</Text>
            </TouchableOpacity>
          </View>

          {/* Hero body */}
          <Reanimated.View style={[styles.heroBody, heroStyle]}>
            <View style={styles.heroLeft}>
              {/* Role toggle */}
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.heroToggleLabel}>I'm joining as a</Text>
                <View style={styles.heroToggle}>
                  <TouchableOpacity
                    style={[styles.heroToggleBtn, heroMode === 'student' && styles.heroToggleBtnActiveStudent]}
                    onPress={() => setHeroMode('student')}
                    activeOpacity={0.8}
                    accessibilityLabel="For Students"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.heroToggleBtnText, heroMode === 'student' && styles.heroToggleBtnTextActiveStudent]}>Student</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.heroToggleBtn, heroMode === 'mentor' && styles.heroToggleBtnActiveMentor]}
                    onPress={() => setHeroMode('mentor')}
                    activeOpacity={0.8}
                    accessibilityLabel="For Mentors"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.heroToggleBtnText, heroMode === 'mentor' && styles.heroToggleBtnTextActiveMentor]}>Mentor</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Title */}
              <Text style={styles.heroTitle}>
                {heroMode === 'student' ? (
                  <>Every great story{'\n'}has a{'\n'}<Text style={[styles.heroScriptAccent, { color: Colors.accent }]}>guide.</Text></>
                ) : (
                  <>You've walked{'\n'}the path. Now{'\n'}<Text style={[styles.heroScriptAccent, { color: Colors.primaryMuted }]}>light the way.</Text></>
                )}
              </Text>

              {/* Subtitle */}
              <Text style={styles.heroSub}>
                {heroMode === 'student'
                  ? "We all need someone who's been there. Find yours."
                  : "Your story is someone's roadmap. One hour a month. That's all it takes."}
              </Text>

              {/* CTA */}
              <View style={styles.heroCTA}>
                <TouchableOpacity
                  style={[styles.ctaPrimary, { backgroundColor: heroMode === 'student' ? Colors.accent : Colors.primary }]}
                  onPress={() => router.push(heroMode === 'student' ? '/(auth)/register?defaultRole=student' : '/(auth)/register?defaultRole=mentor' as any)}
                  activeOpacity={0.78}
                  accessibilityLabel={heroMode === 'student' ? 'Find your mentor' : 'Become a mentor'}
                  accessibilityRole="button"
                >
                  <Text style={[styles.ctaPrimaryText, { color: heroMode === 'student' ? Colors.primaryDark : Colors.white }]}>
                    {heroMode === 'student' ? 'Find Your Mentor' : 'Become a Mentor'}
                  </Text>
                  <Ionicons name="arrow-forward" size={15} color={heroMode === 'student' ? Colors.primaryDark : Colors.white} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.ctaSecondary}
                  onPress={() => router.push('/(auth)/login')}
                  activeOpacity={0.78}
                  accessibilityLabel="Sign in to your account"
                  accessibilityRole="button"
                >
                  <Text style={styles.ctaSecondaryText}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Floating mentor cards */}
            <View style={styles.heroCards}>
              {MENTORS_PREVIEW.map((m, i) => (
                <FloatingCard key={m.name} mentor={m} delay={i * 300} index={i} />
              ))}
            </View>
          </Reanimated.View>
        </View>

        {/* ── Fields ticker ── */}
        <View style={styles.tickerSection} accessible={false} importantForAccessibility="no-hide-descendants">
          <TickerRow fields={FIELDS} />
        </View>

        {/* ── Body ── */}
        <View>
          {heroMode === 'student' ? (
            <>
              {/* Stats */}
              <View style={styles.statsSection}>
                <View style={styles.statsRow}>
                  <View style={styles.statBlock}>
                    <Text style={[styles.statNumber, { color: Colors.primary }]}>1hr</Text>
                    <View style={[styles.statLine, { backgroundColor: Colors.primary }]} />
                    <Text style={styles.statLabel}>Per Month</Text>
                  </View>
                  <View style={styles.statSep} />
                  <View style={styles.statBlock}>
                    <Text style={[styles.statNumber, { color: Colors.accent }]}>31</Text>
                    <View style={[styles.statLine, { backgroundColor: Colors.accent }]} />
                    <Text style={styles.statLabel}>Fields</Text>
                  </View>
                  <View style={styles.statSep} />
                  <View style={styles.statBlock}>
                    <Text style={[styles.statNumber, { color: Colors.accent3 }]}>$0</Text>
                    <View style={[styles.statLine, { backgroundColor: Colors.accent3 }]} />
                    <Text style={styles.statLabel}>Cost. Ever.</Text>
                  </View>
                </View>
              </View>

              {/* Why Mentara */}
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>WHY MENTARA</Text>
                <View style={styles.sectionRule} />
                {FEATURES.map((f, i) => (
                  <View key={f.title} style={styles.editorialRow}>
                    <View style={styles.editorialRowLeft}>
                      <Text style={[styles.editorialNum, { color: f.accentColor }]}>{String(i + 1).padStart(2, '0')}</Text>
                      <View style={[styles.editorialNumLine, { backgroundColor: f.accentColor }]} />
                    </View>
                    <View style={styles.editorialRowContent}>
                      <Text style={styles.editorialTitle}>{f.title}</Text>
                      <Text style={styles.editorialDesc}>{f.desc}</Text>
                    </View>
                    {i < FEATURES.length - 1 && <View style={styles.editorialDivider} />}
                  </View>
                ))}
              </View>

              {/* How it works */}
              <View style={styles.howSection}>
                <Text style={[styles.sectionEyebrow, { color: Colors.accentLight }]}>HOW IT WORKS</Text>
                <View style={[styles.sectionRule, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                <Text style={[styles.sectionTitle, { color: Colors.white }]}>Three steps.</Text>
                {[
                  { n: '01', title: 'Set up your profile', desc: 'Tell us your field and what you want to learn. Two minutes.', accent: Colors.accent },
                  { n: '02', title: 'Get matched', desc: 'We match you with a mentor based on your goals and field. No browsing required.', accent: Colors.accent2 },
                  { n: '03', title: 'Have your first call', desc: 'The app schedules your monthly call. Show up and talk.', accent: Colors.accent3 },
                ].map((step, i) => (
                  <View key={step.n} style={[styles.stepRow, i < 2 && styles.stepRowBorder]}>
                    <Text style={[styles.stepNumber, { color: step.accent }]}>{step.n}</Text>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      <Text style={styles.stepDesc}>{step.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Student CTA */}
              <View style={styles.ctaBannerWrap}>
                <View style={styles.ctaBanner}>
                  <View style={styles.ctaBannerAccentBar} />
                  <Text style={styles.ctaBannerTitle}>One mentor can{'\n'}change everything.</Text>
                  <Text style={styles.ctaBannerSub}>
                    Learn from someone who's already walked your path. Completely free.
                  </Text>
                  <TouchableOpacity
                    style={styles.ctaBannerBtn}
                    onPress={() => router.push('/(auth)/register?defaultRole=student' as any)}
                    activeOpacity={0.78}
                    accessibilityLabel="Create a free account"
                    accessibilityRole="button"
                  >
                    <Text style={styles.ctaBannerBtnText}>Create Free Account</Text>
                    <Ionicons name="arrow-forward" size={15} color={Colors.primaryDark} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Mentor: The Commitment */}
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>THE COMMITMENT</Text>
                <View style={styles.sectionRule} />
                <Text style={styles.sectionTitle}>Giving back, made simple</Text>
                {WHAT_YOU_GET.map((item, i) => (
                  <View key={item.title} style={[styles.editorialRow, i < WHAT_YOU_GET.length - 1 && styles.editorialRowGap]}>
                    <View style={styles.editorialRowLeft}>
                      <Text style={[styles.editorialNum, { color: item.color }]}>{String(i + 1).padStart(2, '0')}</Text>
                      <View style={[styles.editorialNumLine, { backgroundColor: item.color }]} />
                    </View>
                    <View style={styles.editorialRowContent}>
                      <Text style={styles.editorialTitle}>{item.title}</Text>
                      <Text style={styles.editorialDesc}>{item.desc}</Text>
                    </View>
                    {i < WHAT_YOU_GET.length - 1 && <View style={styles.editorialDivider} />}
                  </View>
                ))}
              </View>

              {/* Mentor: How a call works */}
              <View style={[styles.howSection, { backgroundColor: Colors.dark }]}>
                <Text style={[styles.sectionEyebrow, { color: Colors.accentLight }]}>HOW A CALL WORKS</Text>
                <View style={[styles.sectionRule, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                <Text style={[styles.sectionTitle, { color: Colors.white }]}>What one session looks like</Text>
                {CALL_STRUCTURE.map((step, i) => (
                  <View key={step.step} style={[styles.stepRow, i < CALL_STRUCTURE.length - 1 && styles.stepRowBorder]}>
                    <Text style={[styles.stepNumber, { color: step.accent }]}>{step.step}</Text>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepTitle}>{step.label}</Text>
                      <Text style={styles.stepDesc}>{step.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Mentor: Why it matters */}
              <View style={[styles.section, { backgroundColor: Colors.accentLight, paddingBottom: 36 }]}>
                <Text style={[styles.sectionEyebrow, { color: Colors.accent }]}>THE IMPACT</Text>
                <View style={[styles.sectionRule, { backgroundColor: Colors.accent }]} />
                <Text style={styles.sectionTitle}>Why it matters</Text>
                <View style={styles.manifestoQuote}>
                  <View style={[styles.manifestoQuoteBar, { backgroundColor: WHY_MENTORS_DO_IT[0].color }]} />
                  <Text style={styles.manifestoQuoteText}>"{WHY_MENTORS_DO_IT[0].desc}"</Text>
                </View>
                <View style={styles.manifestoSupport}>
                  {WHY_MENTORS_DO_IT.slice(1).map((item) => (
                    <View key={item.title} style={[styles.manifestoSupportItem, { borderLeftColor: item.color }]}>
                      <Text style={[styles.manifestoSupportTitle, { color: item.color }]}>{item.title}</Text>
                      <Text style={styles.manifestoSupportDesc}>{item.desc}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Mentor CTA */}
              <View style={styles.ctaBannerWrap}>
                <View style={[styles.ctaBanner, { backgroundColor: Colors.mentorHeaderBg, borderColor: 'rgba(201,139,48,0.20)' }]}>
                  <View style={[styles.ctaBannerAccentBar, { backgroundColor: Colors.accent }]} />
                  <Text style={styles.ctaBannerTitle}>Ready to give back?</Text>
                  <Text style={styles.ctaBannerSub}>
                    One hour a month. Real impact. Your profile takes two minutes to set up.
                  </Text>
                  <TouchableOpacity
                    style={[styles.ctaBannerBtn, { backgroundColor: Colors.accent }]}
                    onPress={() => router.push('/(auth)/register?defaultRole=mentor' as any)}
                    activeOpacity={0.78}
                    accessibilityLabel="Join as a mentor"
                    accessibilityRole="button"
                  >
                    <Text style={styles.ctaBannerBtnText}>Join as a Mentor</Text>
                    <Ionicons name="arrow-forward" size={15} color={Colors.primaryDark} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Logo size="sm" />
          <Text style={styles.footerText}>© 2026 Mentara. All rights reserved.</Text>
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={() => Linking.openURL('https://mentara.me/#about').catch(() => {})} accessibilityLabel="About Mentara" accessibilityRole="button">
              <Text style={styles.footerLink}>About</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/terms')} accessibilityLabel="Terms of Service" accessibilityRole="button">
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/privacy')} accessibilityLabel="Privacy Policy" accessibilityRole="button">
              <Text style={styles.footerLink}>Privacy</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.footerContact}>
            <Text style={styles.footerContactText}>Questions? </Text>
            <TouchableOpacity onPress={() => Linking.openURL('mailto:mentarasupport@gmail.com').catch(() => {})} accessibilityLabel="Email Mentara support" accessibilityRole="button">
              <Text style={styles.footerContactEmail}>mentarasupport@gmail.com</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  // ── Hero ──────────────────────────────────────────────────────────
  hero: {
    backgroundColor: Colors.primaryDark,
    paddingBottom: 36,
    overflow: 'hidden',
  },

  // Grid dots
  gridDotsContainer: {
    position: 'absolute', top: 20, right: 16,
    width: 80, flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    opacity: 0.18,
  },
  gridDot: {
    width: 3, height: 3,
    backgroundColor: Colors.white,
    borderRadius: 0,
  },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, marginBottom: 36,
  },
  aboutBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)',
  },
  aboutBtnText: { color: Colors.white, fontFamily: Fonts.sansSemiBold, fontSize: 13 },

  // Hero body
  heroBody: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    alignItems: 'flex-start',
  },
  heroLeft: { flex: 1 },

  heroTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: 34, color: Colors.white, lineHeight: 42,
    marginBottom: 14, letterSpacing: -0.5,
  },
  heroScriptAccent: {
    fontFamily: Fonts.script,
    fontSize: 38, color: Colors.accent, lineHeight: 48,
  },
  heroSub: {
    fontFamily: Fonts.sans,
    fontSize: 14, color: 'rgba(255,255,255,0.62)', lineHeight: 22, marginBottom: 28,
  },
  heroCTA: { flexDirection: 'column', gap: 10 },
  ctaPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.accent,
    paddingLeft: 20, paddingRight: 16, paddingVertical: 14,
    ...Shadow.glow,
  },
  ctaPrimaryText: { fontFamily: Fonts.sansBold, color: Colors.primaryDark, fontSize: 14, letterSpacing: 0.5 },
  ctaSecondary: {
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 20, paddingVertical: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  ctaSecondaryText: { fontFamily: Fonts.sansSemiBold, color: 'rgba(255,255,255,0.85)', fontSize: 14 },

  // Floating mentor cards
  heroCards: { flex: 0.85, alignItems: 'flex-end', paddingTop: 8 },
  floatCard: {
    backgroundColor: Colors.white,
    width: 148, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    ...Shadow.md,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  floatCardAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
  },
  floatCardAvatar: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
  },
  floatCardInitials: { fontFamily: Fonts.sansBold, fontSize: 12 },
  floatCardInfo: { flex: 1 },
  floatCardName: { fontFamily: Fonts.sansBold, fontSize: 10, color: Colors.dark },
  floatCardField: { fontFamily: Fonts.sansMedium, fontSize: 9, marginTop: 1 },
  floatCardBadge: {
    width: 18, height: 18, borderRadius: 0,
    backgroundColor: `${Colors.accent3}18`,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Fields ticker ─────────────────────────────────────────────────
  tickerSection: {
    backgroundColor: Colors.dark,
    paddingVertical: 14,
    overflow: 'hidden',
  },
  tickerRow: { overflow: 'hidden', flexDirection: 'row' },
  tickerItem: { flexDirection: 'row', alignItems: 'center' },
  tickerText: {
    fontFamily: Fonts.sansBold, fontSize: 11, letterSpacing: 2,
    color: 'rgba(255,255,255,0.55)', paddingHorizontal: 16,
  },
  tickerDivider: {
    width: 4, height: 4, backgroundColor: Colors.accent,
    opacity: 0.6,
  },

  // ── Stats ─────────────────────────────────────────────────────────
  statsSection: {
    paddingHorizontal: 24, paddingVertical: 32,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  statBlock: { flex: 1, alignItems: 'center', gap: 6 },
  statNumber: { fontFamily: Fonts.serifBold, fontSize: 36, lineHeight: 40, letterSpacing: -1 },
  statLine: { width: 32, height: 2 },
  statLabel: { fontFamily: Fonts.sansMedium, fontSize: 11, color: Colors.gray500, letterSpacing: 0.5, textAlign: 'center' },
  statSep: { width: 1, height: 60, backgroundColor: Colors.border, alignSelf: 'center', marginHorizontal: 4 },

  // ── Editorial section ─────────────────────────────────────────────
  section: { paddingHorizontal: 24, paddingTop: 40 },
  sectionEyebrow: {
    fontFamily: Fonts.sansBold, fontSize: 11, letterSpacing: 1.8,
    textTransform: 'uppercase', color: Colors.primary,
  },
  sectionRule: { width: 48, height: 2, backgroundColor: Colors.primary, marginTop: 8, marginBottom: 28 },
  sectionTitle: {
    fontFamily: Fonts.serifBold, fontSize: 28, color: Colors.dark,
    lineHeight: 36, letterSpacing: -0.3, marginBottom: 24,
  },

  editorialRow: { position: 'relative' },
  editorialRowGap: { marginBottom: 0 },
  editorialRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  editorialNum: { fontFamily: Fonts.serifBold, fontSize: 13, letterSpacing: 1 },
  editorialNumLine: { flex: 1, height: 1, opacity: 0.3 },
  editorialRowContent: { paddingBottom: 20, gap: 6 },
  editorialTitle: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.dark },
  editorialDesc: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.gray500, lineHeight: 20 },
  editorialDivider: { height: 1, backgroundColor: Colors.border, marginBottom: 20 },

  // ── Manifesto / pull-quote ────────────────────────────────────────
  manifestoQuote: { flexDirection: 'row', gap: 16, marginBottom: 28 },
  manifestoQuoteBar: { width: 4, alignSelf: 'stretch' },
  manifestoQuoteText: {
    fontFamily: Fonts.serifBold, fontSize: 20, color: Colors.dark,
    lineHeight: 30, letterSpacing: -0.2, flex: 1,
  },
  manifestoSupport: { gap: 18 },
  manifestoSupportItem: { borderLeftWidth: 2, paddingLeft: 14, gap: 4 },
  manifestoSupportTitle: { fontFamily: Fonts.sansBold, fontSize: 13, letterSpacing: 0.3 },
  manifestoSupportDesc: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.gray500, lineHeight: 20 },

  // ── How it works ──────────────────────────────────────────────────
  howSection: {
    marginTop: 40, marginHorizontal: 0,
    backgroundColor: Colors.dark, paddingHorizontal: 24, paddingVertical: 32,
    gap: 0,
  },
  stepRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start', paddingVertical: 20 },
  stepRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  stepNumber: {
    fontFamily: Fonts.serifBold, fontSize: 28, lineHeight: 32,
    letterSpacing: -0.5, flexShrink: 0, width: 44,
  },
  stepContent: { flex: 1, paddingTop: 2 },
  stepTitle: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.white, marginBottom: 4 },
  stepDesc: { fontFamily: Fonts.sans, fontSize: 13, color: 'rgba(255,255,255,0.50)', lineHeight: 20 },

  // ── CTA Banner ────────────────────────────────────────────────────
  ctaBannerWrap: { marginHorizontal: 0, marginTop: 40 },
  ctaBanner: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 28, paddingVertical: 32,
    gap: 12, overflow: 'hidden',
    borderTopWidth: 3, borderTopColor: Colors.accent,
  },
  ctaBannerAccentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
    backgroundColor: Colors.accent,
  },
  ctaBannerTitle: {
    fontFamily: Fonts.serifBold, fontSize: 28, color: Colors.white,
    lineHeight: 36, letterSpacing: -0.3,
  },
  ctaBannerSub: {
    fontFamily: Fonts.sans, fontSize: 14, color: 'rgba(255,255,255,0.60)', lineHeight: 22,
  },
  ctaBannerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.accent,
    paddingHorizontal: 20, paddingVertical: 15, marginTop: 8,
  },
  ctaBannerBtnText: { fontFamily: Fonts.sansBold, color: Colors.primaryDark, fontSize: 14, letterSpacing: 0.5 },

  // ── Mode toggle ───────────────────────────────────────────────────
  heroToggleLabel: {
    fontFamily: Fonts.sansBold, fontSize: 11,
    color: 'rgba(255,255,255,0.70)', marginBottom: 10, letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroToggle: {
    flexDirection: 'row', alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.20)',
    padding: 3, gap: 2,
  },
  heroToggleBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 9,
    minHeight: 44,
  },
  heroToggleBtnActiveStudent: { backgroundColor: Colors.accent },
  heroToggleBtnActiveMentor: { backgroundColor: Colors.primary },
  heroToggleBtnText: { fontFamily: Fonts.sansBold, fontSize: 13, color: 'rgba(255,255,255,0.70)' },
  heroToggleBtnTextActiveStudent: { color: Colors.primaryDark },
  heroToggleBtnTextActiveMentor: { color: Colors.white },

  // ── Footer ────────────────────────────────────────────────────────
  footer: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20, gap: 10, alignItems: 'center' },
  footerText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.gray400 },
  footerLinks: { flexDirection: 'row', gap: 20 },
  footerLink: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.primary },
  footerContact: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  footerContactText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.gray500 },
  footerContactEmail: { fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.primary },
});
