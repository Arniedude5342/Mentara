import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

interface AvatarProps {
  uri?: string | null;
  name?: string | null;
  size?: number;
  verified?: boolean;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

function getAvatarColor(name: string | null | undefined): string {
  const colors = [
    Colors.primary, '#0EA5E9', '#10B981', '#F59E0B',
    '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6',
  ];
  if (!name) return colors[0];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

export default function Avatar({ uri, name, size = 48, verified = false }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = getAvatarColor(name);
  const fontSize = size * 0.38;
  const badgeSize = size * 0.3;

  const badgePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!verified) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.3, duration: 700, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.delay(1200),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      badgePulse.setValue(1);
    };
  }, [verified]);

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor },
          ]}
        >
          <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
        </View>
      )}
      {verified && (
        <Animated.View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              bottom: 0,
              right: 0,
              transform: [{ scale: badgePulse }],
            },
          ]}
        >
          <Ionicons name="checkmark" size={badgeSize * 0.6} color={Colors.white} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { resizeMode: 'cover' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: Colors.white,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
});
