import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'mark';
  light?: boolean;
}

const logoImage = require('@/assets/logo.png');

export default function Logo({ size = 'md', variant = 'full', light = false }: LogoProps) {
  const scales = { sm: 0.65, md: 1, lg: 1.5 };
  const scale = scales[size];

  const markSize = 40 * scale;
  const fontSize = 26 * scale;
  const tagSize = 10 * scale;

  const textColor = light ? Colors.white : Colors.dark;
  const tagColor = light ? 'rgba(255,255,255,0.7)' : Colors.gray500;

  return (
    <View style={styles.container}>
      <View style={{ width: markSize, height: markSize, borderRadius: markSize * 0.28, overflow: 'hidden', backgroundColor: '#0D4F5C' }}>
        <Image
          source={logoImage}
          style={{
            width: markSize * 1.08,
            height: markSize * 1.08,
            marginLeft: -markSize * 0.04,
            marginTop: -markSize * 0.04,
          }}
          resizeMode="cover"
        />
      </View>
      {variant === 'full' && (
        <View style={styles.textGroup}>
          <Text style={[styles.wordmark, { fontSize, color: textColor }]}>
            men<Text style={{ color: textColor }}>tara</Text>
          </Text>
          <Text style={[styles.tagline, { fontSize: tagSize, color: tagColor }]}>
            LIGHT YOUR PATH
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textGroup: {
    gap: 1,
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    letterSpacing: 2,
    fontWeight: '600',
  },
});
