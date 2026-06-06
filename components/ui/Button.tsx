import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
let Haptics: typeof import('expo-haptics') | null = null;
try { Haptics = require('expo-haptics'); } catch { /* not linked */ }
import { Colors, Shadow } from '@/constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  color?: string;
}

const SPINNER_COLORS: Record<string, string> = {
  primary: Colors.white,
  secondary: Colors.dark,
  outline: Colors.primary,
  ghost: Colors.primary,
  danger: Colors.white,
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  textStyle,
  fullWidth = true,
  color,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const containerStyle = [
    styles.base,
    styles[`size_${size}`],
    styles[`variant_${variant}`],
    color && variant === 'primary' ? { backgroundColor: color, borderColor: color } : undefined,
    fullWidth ? styles.fullWidth : undefined,
    isDisabled ? styles.disabled : undefined,
    style ?? {},
  ] as ViewStyle[];

  const labelStyle: TextStyle[] = [
    styles.label,
    styles[`labelSize_${size}`],
    styles[`labelVariant_${variant}`],
    textStyle ?? {},
  ];

  const handlePress = () => {
    Haptics?.impactAsync?.(Haptics.ImpactFeedbackStyle.Light)?.catch?.(() => {});
    onPress();
  };

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.72}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator color={SPINNER_COLORS[variant]} size="small" />
      ) : (
        <Text style={labelStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.45 },

  size_sm: { height: 44, paddingHorizontal: 20 },
  size_md: { height: 56, paddingHorizontal: 28 },
  size_lg: { height: 62, paddingHorizontal: 32 },

  variant_primary: { backgroundColor: Colors.primary, borderColor: Colors.primary, borderRadius: 28, ...Shadow.teal },
  variant_secondary: { backgroundColor: Colors.accent, borderColor: Colors.accent, borderRadius: 28 },
  variant_outline: { backgroundColor: 'transparent', borderColor: Colors.primary, borderWidth: 2, borderRadius: 28 },
  variant_ghost: { backgroundColor: Colors.primaryLight, borderColor: 'transparent', borderRadius: 28 },
  variant_danger: { backgroundColor: Colors.error, borderColor: Colors.error, borderRadius: 28 },

  label: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  labelSize_sm: { fontSize: 13 },
  labelSize_md: { fontSize: 15 },
  labelSize_lg: { fontSize: 16 },

  labelVariant_primary: { color: Colors.white },
  labelVariant_secondary: { color: Colors.dark },
  labelVariant_outline: { color: Colors.primary },
  labelVariant_ghost: { color: Colors.primary },
  labelVariant_danger: { color: Colors.white },
});
