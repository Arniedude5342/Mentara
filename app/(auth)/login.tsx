import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, Animated, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Logo from '@/components/Logo';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Colors, Fonts, Typography, Radius, Shadow, Spacing } from '@/constants/theme';
import { signIn, signInWithGoogle, signInWithApple, resetPassword } from '@/lib/supabase';
import { isValidEmail, mapAuthError, sanitizeEmail } from '@/lib/authUtils';
import { useAuth } from '@/context/AuthContext';
import GoogleLogo from '@/components/GoogleLogo';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { session, loading: authLoading, profile } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Client-side lockout (server-side rate limiting already in supabase.ts)
  const [attemptCount, setAttemptCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutSecsLeft, setLockoutSecsLeft] = useState(0);

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

  // Lockout countdown
  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const secsLeft = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (secsLeft <= 0) {
        setLockoutUntil(null);
        setLockoutSecsLeft(0);
        setAttemptCount(0);
      } else {
        setLockoutSecsLeft(secsLeft);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Navigate when session resolves
  useEffect(() => {
    if (!authLoading && session) {
      // profile null = no row found after retries; send to onboarding to create it
      if (!profile || !profile.onboarding_complete) {
        router.replace('/(auth)/onboarding');
      } else {
        router.replace('/(app)/(tabs)/home');
      }
    }
  }, [session, authLoading, profile]);

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!isValidEmail(email)) e.email = 'Enter a valid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    if (!validate()) return;
    setLoading(true);
    try {
      const { data, error } = await signIn(sanitizeEmail(email), password);
      if (error) {
        const newCount = attemptCount + 1;
        setAttemptCount(newCount);
        if (newCount >= 5) {
          setLockoutUntil(Date.now() + 15 * 60 * 1000);
          setLockoutSecsLeft(15 * 60);
          Alert.alert('Too Many Attempts', "You've been temporarily locked out for 15 minutes.");
        } else {
          Alert.alert('Sign In Failed', mapAuthError(error.message));
        }
        setLoading(false);
      } else if (data?.session) {
        // Keep spinner — useEffect navigates once AuthContext syncs
      } else {
        Alert.alert('Sign In Issue', 'No session returned. If you just signed up, check your email first.');
        setLoading(false);
      }
    } catch (e: any) {
      Alert.alert('Unexpected Error', mapAuthError(e.message ?? 'Something went wrong'));
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    if (googleLoading || loading) return;
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) Alert.alert('Google Sign In Failed', mapAuthError(error.message));
  };

  const handleAppleLogin = async () => {
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    if (appleLoading || loading) return;
    setAppleLoading(true);
    const { error } = await signInWithApple();
    setAppleLoading(false);
    if (error) Alert.alert('Apple Sign In Failed', mapAuthError(error.message));
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Type your email address above, then tap "Forgot password?".');
      return;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Invalid email', 'Please enter a valid email address first.');
      return;
    }
    const { error } = await resetPassword(sanitizeEmail(email));
    if (error) Alert.alert('Error', mapAuthError(error.message));
    else Alert.alert('Check your email', "We've sent a password reset link.");
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
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
          <Text style={styles.heroScript}>welcome back,</Text>
          <Text style={styles.heroTitle}>Sign in to{'\n'}Mentara</Text>
          <View style={styles.trustRow}>
            <View style={styles.trustDot} />
            <Text style={styles.trustText}>18,000+ students · Secured by Supabase</Text>
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
          {/* Website account hint */}
          <View style={styles.websiteHint}>
            <Text style={styles.websiteHintText}>
              * Signed up on mentara.me? Your account works here.
            </Text>
          </View>

          {/* Google */}
          <TouchableOpacity
            style={[styles.googleBtn, (googleLoading || loading || !!lockoutUntil) && styles.btnDisabled]}
            onPress={handleGoogleLogin}
            activeOpacity={0.88}
            disabled={googleLoading || loading || !!lockoutUntil}
            accessibilityLabel="Sign in with Google"
            accessibilityRole="button"
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color={Colors.gray700} />
            ) : (
              <>
                <GoogleLogo size={20} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
                <View style={styles.btnTrail}>
                  <Ionicons name="arrow-forward" size={13} color={Colors.gray500} />
                </View>
              </>
            )}
          </TouchableOpacity>

          {/* Apple (iOS only, capability must be enabled — App Store Guideline 4.8) */}
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={Radius.md}
              style={[styles.appleBtn, (appleLoading || loading || !!lockoutUntil) && styles.btnDisabled]}
              onPress={handleAppleLogin}
            />
          )}

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.divLine} />
            <Text style={styles.divText}>or email</Text>
            <View style={styles.divLine} />
          </View>

          {/* Email & password — always visible */}
          <View style={styles.form}>
            <Input
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChangeText={(t) => { setEmail(t); if (errors.email) setErrors((e) => ({ ...e, email: undefined })); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              leftIcon="mail-outline"
              error={errors.email}
            />
            <Input
              label="Password"
              placeholder="Your password"
              value={password}
              onChangeText={(t) => { setPassword(t); if (errors.password) setErrors((e) => ({ ...e, password: undefined })); }}
              isPassword
              leftIcon="lock-closed-outline"
              error={errors.password}
            />

            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgot}
              accessibilityLabel="Forgot password"
              accessibilityRole="button"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {lockoutUntil ? (
              <View style={styles.lockoutBanner}>
                <Ionicons name="time-outline" size={16} color={Colors.error} />
                <Text style={styles.lockoutText}>
                  Too many attempts. Try again in {lockoutSecsLeft}s
                </Text>
              </View>
            ) : (
              <Button title="Sign In" onPress={handleLogin} loading={loading} />
            )}
          </View>

          {/* Footer links */}
          <View style={styles.signUpRow}>
            <Text style={styles.signUpText}>New to Mentara? </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(auth)/register')}
              accessibilityLabel="Create a new account"
              accessibilityRole="button"
            >
              <Text style={styles.signUpLink}>Create an Account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.termsRow}>
            <Text style={styles.terms}>By signing in you agree to our </Text>
            <TouchableOpacity onPress={() => router.push('/terms')} accessibilityRole="button" accessibilityLabel="Terms of Service">
              <Text style={styles.termsLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.terms}> and </Text>
            <TouchableOpacity onPress={() => router.push('/privacy')} accessibilityRole="button" accessibilityLabel="Privacy Policy">
              <Text style={styles.termsLink}>Privacy Policy</Text>
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
  trustRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
  },
  trustDot: {
    width: 8, height: 8,
    backgroundColor: Colors.accent3,
  },
  trustText: { ...Typography.bodySm, color: 'rgba(255,255,255,0.65)' },

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

  // Google button
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, backgroundColor: Colors.white, borderRadius: Radius.md,
    paddingVertical: 15, borderWidth: 1.5, borderColor: Colors.border,
    ...Shadow.sm,
  },
  btnDisabled: { opacity: 0.5 },
  googleBtnText: { ...Typography.headingSm, color: Colors.dark, flex: 1, textAlign: 'center' },
  btnTrail: {
    width: 28, height: 28,
    backgroundColor: Colors.gray100,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.gray200,
  },

  // Apple button
  appleBtn: { height: 52, width: '100%', marginTop: 12 },

  // Divider
  divider: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginVertical: 22,
  },
  divLine: { flex: 1, height: 1, backgroundColor: Colors.gray200 },
  divText: { ...Typography.caption, color: Colors.gray400, fontFamily: Fonts.sansSemiBold, letterSpacing: 0.4 },

  form: { gap: 16 },
  forgot: { alignSelf: 'flex-end', marginTop: -4 },
  forgotText: { ...Typography.bodyMd, color: Colors.primary, fontFamily: Fonts.sansSemiBold },

  // Lockout
  lockoutBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.errorLight, borderRadius: Radius.md,
    padding: 14, justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(184, 50, 50, 0.15)',
  },
  lockoutText: { ...Typography.bodyMd, color: Colors.error, fontFamily: Fonts.sansSemiBold },

  // Footer
  signUpRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 28,
  },
  signUpText: { ...Typography.bodyMd, color: Colors.gray500 },
  signUpLink: { ...Typography.bodyMd, color: Colors.primary, fontFamily: Fonts.sansBold },

  termsRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 14,
  },
  terms: { ...Typography.bodySm, color: Colors.gray400, lineHeight: 18 },
  termsLink: { ...Typography.bodySm, color: Colors.primary, fontFamily: Fonts.sansSemiBold, lineHeight: 18 },
});
