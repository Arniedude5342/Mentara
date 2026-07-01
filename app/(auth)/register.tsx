import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Animated, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import Logo from '@/components/Logo';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import { signUp, signInWithGoogle, signInWithApple, updateProfile, signOut } from '@/lib/supabase';
import { isValidEmail, mapAuthError, sanitizeEmail, getPasswordStrength } from '@/lib/authUtils';
import { useAuth } from '@/context/AuthContext';
import GoogleLogo from '@/components/GoogleLogo';

type Role = 'student' | 'mentor';

// ─── Password strength bar ────────────────────────────────────────
function PasswordStrengthBar({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = getPasswordStrength(password);
  return (
    <View style={strengthStyles.wrapper}>
      <View style={strengthStyles.bars}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[strengthStyles.bar, { backgroundColor: i <= score ? color : Colors.gray200 }]}
          />
        ))}
      </View>
      <Text style={[strengthStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const strengthStyles = StyleSheet.create({
  wrapper: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -8 },
  bars: { flex: 1, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  label: { fontSize: 11, fontFamily: Fonts.sansBold, minWidth: 64, textAlign: 'right' },
});

// ─── Main Register Screen ─────────────────────────────────────────
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading, profile } = useAuth();
  const { defaultRole } = useLocalSearchParams<{ defaultRole?: string }>();

  const [role, setRole] = useState<Role>(defaultRole === 'mentor' ? 'mentor' : 'student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const heroBg = role === 'student' ? Colors.primaryDark : Colors.gray900;
  const linkColor = role === 'student' ? Colors.primary : Colors.accent2;
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (!authLoading && session) {
      if (!profile || !profile.onboarding_complete) {
        router.replace('/(auth)/onboarding');
      } else if (profile.role !== role) {
        // Existing account signed in via OAuth but its role doesn't match what
        // the user selected on the register screen. Show a clear choice rather
        // than silently routing them into the wrong dashboard.
        const existingRole = profile.role as string;
        const intendedRole = role as string;
        Alert.alert(
          `You already have a ${existingRole} account`,
          `This login is registered as a ${existingRole}, not a ${intendedRole}. Sign in as a ${existingRole} instead?`,
          [
            {
              text: `Yes, sign in as ${existingRole}`,
              onPress: () => router.replace('/(app)/(tabs)/home'),
            },
            {
              text: 'Use a different account',
              style: 'cancel',
              onPress: () => { signOut(); },
            },
          ]
        );
      } else {
        router.replace('/(app)/(tabs)/home');
      }
    }
  }, [session, authLoading, profile, role]);

  // Entrance animations
  const heroAnim  = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(-24)).current;
  const cardAnim  = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(36)).current;

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  useEffect(() => {
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(heroAnim,  { toValue: 1, duration: 460, useNativeDriver: true }),
        Animated.spring(heroSlide, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 3 }),
      ]),
      Animated.parallel([
        Animated.timing(cardAnim,  { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(cardSlide, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 3 }),
      ]),
    ]).start();
  }, []);

  const handleAppleRegister = async () => {
    setLoading(true);
    try {
      await SecureStore.setItemAsync(
        'mentara_pending_role',
        JSON.stringify({ role, timestamp: Date.now() })
      );
    } catch {}
    const { error } = await signInWithApple();
    setLoading(false);
    if (error) {
      if (/user already registered|already been registered|already exists/i.test(error.message)) {
        alertDuplicate();
      } else {
        Alert.alert('Apple Sign Up Failed', mapAuthError(error.message));
      }
    }
  };

  const handleGoogleRegister = async () => {
    setLoading(true);
    try {
      await SecureStore.setItemAsync(
        'mentara_pending_role',
        JSON.stringify({ role, timestamp: Date.now() })
      );
    } catch {}
    const { error } = await signInWithGoogle();
    setLoading(false);
    if (error) {
      if (/user already registered|already been registered|already exists/i.test(error.message)) {
        alertDuplicate();
      } else {
        Alert.alert('Google Sign Up Failed', mapAuthError(error.message));
      }
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!isValidEmail(email)) e.email = 'Enter a valid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    else if (getPasswordStrength(password).score < 2) e.password = 'Password must include uppercase letters and numbers.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goSignIn = () => router.replace('/(auth)/login');

  const alertDuplicate = () =>
    Alert.alert(
      'Account Already Exists',
      'An account with this email already exists. Sign in instead.',
      [
        { text: 'Sign In', onPress: goSignIn },
        { text: 'Cancel', style: 'cancel' },
      ]
    );

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    const { data, error } = await signUp(sanitizeEmail(email), password, role, {
      full_name: fullName.trim(),
    });
    if (error) {
      setLoading(false);
      if (/user already registered|already been registered|already exists/i.test(error.message)) {
        alertDuplicate();
      } else {
        Alert.alert('Registration Failed', mapAuthError(error.message));
      }
      return;
    }
    if (!data) {
      setLoading(false);
      Alert.alert('Registration Failed', 'Unexpected response from server. Please try again.');
      return;
    }
    if (data.session) {
      // handle_new_user trigger already inserts full_name from raw_user_meta_data — no updateProfile needed
    } else if (data.user?.email_confirmed_at) {
      // Supabase returns a confirmed existing user silently — email already registered
      setLoading(false);
      alertDuplicate();
    } else {
      setLoading(false);
      Alert.alert(
        'Check Your Email',
        `We sent a confirmation link to ${sanitizeEmail(email)}. Tap it to activate your account, then sign in.`,
        [{ text: 'OK', onPress: goSignIn }]
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: heroBg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── Dark teal hero ── */}
      <Animated.View
        style={[
          styles.hero,
          { paddingTop: insets.top + Spacing.md },
          { opacity: heroAnim, transform: [{ translateY: heroSlide }] },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.replace('/')}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
        </TouchableOpacity>

        <Logo size="md" light />

        <View style={styles.heroTextBlock}>
          <Text style={styles.heroScript}>{role === 'student' ? 'find your mentor,' : 'share your wisdom,'}</Text>
          <Text style={styles.heroTitle}>Join{'\n'}Mentara</Text>
          <View style={styles.heroTagRow}>
            <View style={[styles.heroTag, { backgroundColor: Colors.accentGlow }]}>
              <Text style={[styles.heroTagText, { color: Colors.accent }]}>For students</Text>
            </View>
            <View style={[styles.heroTag, { backgroundColor: Colors.accent3Glow }]}>
              <Text style={[styles.heroTagText, { color: Colors.accent3 }]}>For mentors</Text>
            </View>
          </View>
        </View>
      </Animated.View>

      {/* ── Form card ── */}
      <Animated.View
        style={[
          styles.card,
          { opacity: cardAnim, transform: [{ translateY: cardSlide }] },
        ]}
      >
        <View style={styles.cardHandle} />

        <ScrollView
          contentContainerStyle={[styles.cardContent, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Role picker */}
          <View style={styles.roleSection}>
            <Text style={styles.roleLabel}>I am joining as a...</Text>
            <View style={styles.rolePicker}>
              {(['student', 'mentor'] as Role[]).map((r) => {
                const optColor = r === 'student' ? Colors.primary : Colors.accent2;
                const optBg = r === 'student' ? Colors.primaryLight : Colors.accent2Light;
                const optMuted = r === 'student' ? Colors.primaryMuted : Colors.accent2;
                const isActive = role === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleOption, isActive && { borderColor: optColor, backgroundColor: optBg }]}
                    onPress={() => setRole(r)}
                    activeOpacity={0.85}
                    accessibilityLabel={r === 'student' ? 'Join as student' : 'Join as mentor'}
                    accessibilityRole="button"
                  >
                    <View style={[styles.roleIconWrap, isActive && { backgroundColor: optColor }]}>
                      <Ionicons
                        name={r === 'student' ? 'school-outline' : 'briefcase-outline'}
                        size={22}
                        color={isActive ? Colors.white : Colors.gray500}
                      />
                    </View>
                    <Text style={[styles.roleOptionText, isActive && { color: optColor }]}>
                      {r === 'student' ? 'Student' : 'Mentor'}
                    </Text>
                    <Text style={[styles.roleOptionDesc, isActive && { color: optMuted }]}>
                      {r === 'student' ? 'Here to learn' : 'Here to guide'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Website account hint */}
          <View style={styles.websiteHint}>
            <Text style={styles.websiteHintText}>
              * Already signed up on mentara.me? Sign in instead.
            </Text>
          </View>

          {/* Google */}
          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.btnDisabled]}
            onPress={handleGoogleRegister}
            activeOpacity={0.85}
            disabled={loading}
            accessibilityLabel="Sign up with Google"
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.gray700} />
            ) : (
              <>
                <GoogleLogo size={22} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple (iOS only, capability must be enabled — App Store Guideline 4.8) */}
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={Radius.md}
              style={[styles.appleBtn, loading && styles.btnDisabled]}
              onPress={handleAppleRegister}
            />
          )}

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.divLine} />
            <Text style={styles.divText}>or email</Text>
            <View style={styles.divLine} />
          </View>

          {/* Email fields — always visible */}
          <View style={styles.form}>
            <Input
              label="Full Name"
              placeholder="Jane Smith"
              value={fullName}
              onChangeText={(t) => { setFullName(t); if (errors.fullName) setErrors((e) => ({ ...e, fullName: '' })); }}
              autoCapitalize="words"
              autoComplete="name"
              leftIcon="person-outline"
              error={errors.fullName}
            />
            <Input
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChangeText={(t) => { setEmail(t); if (errors.email) setErrors((e) => ({ ...e, email: '' })); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              leftIcon="mail-outline"
              error={errors.email}
            />
            <Input
              label="Password"
              placeholder="At least 8 characters"
              value={password}
              onChangeText={(t) => { setPassword(t); if (errors.password) setErrors((e) => ({ ...e, password: '' })); }}
              isPassword
              leftIcon="lock-closed-outline"
              error={errors.password}
            />
            <PasswordStrengthBar password={password} />

            <Button
              title={`Create ${role === 'student' ? 'Student' : 'Mentor'} Account`}
              onPress={handleRegister}
              loading={loading}
            />
          </View>

          {/* Footer */}
          <View style={styles.signInRow}>
            <Text style={styles.signInText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              accessibilityLabel="Sign in"
              accessibilityRole="button"
            >
              <Text style={[styles.signInLink, { color: linkColor }]}>Sign In</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.termsRow}>
            <Text style={styles.terms}>By creating an account you agree to our </Text>
            <TouchableOpacity onPress={() => router.push('/terms')} accessibilityRole="button" accessibilityLabel="Terms of Service">
              <Text style={[styles.termsLink, { color: linkColor }]}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.terms}> and </Text>
            <TouchableOpacity onPress={() => router.push('/privacy')} accessibilityRole="button" accessibilityLabel="Privacy Policy">
              <Text style={[styles.termsLink, { color: linkColor }]}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primaryDark },

  // Hero
  hero: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  backBtn: {
    width: 44, height: 44,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: Spacing.sm,
  },
  heroTextBlock: { gap: 6, marginTop: Spacing.sm },
  heroScript: {
    fontFamily: Fonts.script,
    fontSize: 22,
    color: Colors.accent,
    lineHeight: 28,
  },
  heroTitle: {
    ...Typography.displayMd,
    color: Colors.white,
  },
  heroTagRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  heroTag: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.full,
  },
  heroTagText: { ...Typography.bodySm, fontFamily: Fonts.sansSemiBold },

  // Card
  card: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    marginTop: -20,
    ...Shadow.lg,
  },
  cardHandle: {
    width: 40, height: 4,
    backgroundColor: Colors.gray300,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  cardContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: 0,
  },

  // Role picker
  roleSection: { marginBottom: 20, gap: 10 },
  roleLabel: { ...Typography.bodyMd, fontFamily: Fonts.sansSemiBold, color: Colors.gray700 },
  rolePicker: { flexDirection: 'row', gap: 12 },
  roleOption: {
    flex: 1, borderRadius: Radius.lg, borderWidth: 2, borderColor: Colors.border,
    padding: 14, gap: 6, alignItems: 'center', backgroundColor: Colors.white,
  },
  roleOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  roleIconWrap: {
    width: 44, height: 44,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
  },
  roleIconWrapActive: { backgroundColor: Colors.primary },
  roleOptionText: { ...Typography.headingSm, color: Colors.gray700 },
  roleOptionTextActive: { color: Colors.primary },
  roleOptionDesc: { ...Typography.bodySm, color: Colors.gray400 },
  roleOptionDescActive: { color: Colors.primaryMuted },

  // Website account hint
  websiteHint: {
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  websiteHintText: {
    ...Typography.bodySm,
    color: Colors.primary,
    fontFamily: Fonts.sansSemiBold,
    lineHeight: 18,
  },

  // Buttons
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, backgroundColor: Colors.white, borderRadius: Radius.md,
    paddingVertical: 15, borderWidth: 1.5, borderColor: Colors.border,
    ...Shadow.sm,
  },
  btnDisabled: { opacity: 0.5 },
  googleBtnText: { ...Typography.headingSm, color: Colors.dark },

  appleBtn: { height: 52, width: '100%', marginTop: 12 },

  // Divider
  divider: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginVertical: 20,
  },
  divLine: { flex: 1, height: 1, backgroundColor: Colors.gray200 },
  divText: { ...Typography.caption, color: Colors.gray400, fontFamily: Fonts.sansSemiBold, letterSpacing: 0.4 },

  form: { gap: 16 },

  // Footer
  signInRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 28,
  },
  signInText: { ...Typography.bodyMd, color: Colors.gray500 },
  signInLink: { ...Typography.bodyMd, color: Colors.primary, fontFamily: Fonts.sansBold },

  termsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 14,
  },
  terms: { ...Typography.bodySm, color: Colors.gray400, lineHeight: 18 },
  termsLink: { ...Typography.bodySm, color: Colors.primary, fontFamily: Fonts.sansSemiBold, lineHeight: 18 },
});
