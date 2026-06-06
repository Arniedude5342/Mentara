import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

type ErrorType = 'network' | 'notFound' | 'auth' | 'generic';

interface ErrorScreenProps {
  type?: ErrorType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}

const ERROR_CONFIG: Record<ErrorType, { icon: keyof typeof Ionicons.glyphMap; title: string; message: string; color: string; bg: string }> = {
  network: {
    icon: 'cloud-offline-outline',
    title: 'No connection',
    message: "Check your internet connection and try again.",
    color: Colors.accent,
    bg: Colors.accentLight,
  },
  notFound: {
    icon: 'search-outline',
    title: 'Nothing here',
    message: "We couldn't find what you were looking for.",
    color: Colors.primary,
    bg: Colors.primaryLight,
  },
  auth: {
    icon: 'lock-closed-outline',
    title: 'Session expired',
    message: "Your session timed out. Sign in again to continue.",
    color: Colors.accent4,
    bg: Colors.accent4Light,
  },
  generic: {
    icon: 'alert-circle-outline',
    title: 'Something went wrong',
    message: "An unexpected error occurred. Try again in a moment.",
    color: Colors.accent2,
    bg: Colors.accent2Light,
  },
};

export default function ErrorScreen({
  type = 'generic',
  title,
  message,
  onRetry,
  retryLabel = 'Try Again',
  compact = false,
}: ErrorScreenProps) {
  const cfg = ERROR_CONFIG[type];
  const displayTitle = title ?? cfg.title;
  const displayMessage = message ?? cfg.message;

  // Shake animation for error icon
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    // Fade + slide in
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 4 }),
    ]).start(() => {
      // Subtle shake after entrance
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const handleRetry = () => {
    // Pulse the icon on retry tap
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.spring(shakeAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    onRetry?.();
  };

  if (compact) {
    return (
      <Animated.View
        style={[
          styles.compactWrap,
          { backgroundColor: cfg.bg, borderColor: `${cfg.color}22` },
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <Ionicons name={cfg.icon} size={18} color={cfg.color} />
        </Animated.View>
        <Text style={[styles.compactText, { color: cfg.color }]}>{displayTitle}</Text>
        {onRetry && (
          <TouchableOpacity
            onPress={handleRetry}
            style={[styles.compactRetry, { backgroundColor: cfg.color }]}
            accessibilityLabel="Retry"
            accessibilityRole="button"
          >
            <Ionicons name="refresh-outline" size={13} color={Colors.white} />
            <Text style={styles.compactRetryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
    >
      {/* Icon ring */}
      <Animated.View
        style={[
          styles.iconRing,
          { backgroundColor: cfg.bg, borderColor: `${cfg.color}30` },
          { transform: [{ translateX: shakeAnim }] },
        ]}
      >
        <Ionicons name={cfg.icon} size={36} color={cfg.color} />
      </Animated.View>

      <Text style={styles.title}>{displayTitle}</Text>
      <Text style={styles.body}>{displayMessage}</Text>

      {onRetry && (
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: cfg.color }]}
          onPress={handleRetry}
          activeOpacity={0.85}
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
        >
          <Ionicons name="refresh-outline" size={16} color={Colors.white} />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: Spacing.xs,
    ...Shadow.sm,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: Colors.dark,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    color: Colors.gray500,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: Radius.md,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: Spacing.xs,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },

  // Compact inline variant
  compactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  compactText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  compactRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.sm,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  compactRetryText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
  },
});
