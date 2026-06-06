import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const BANNER_H = 38;

export default function NetworkBanner() {
  const isOnline = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(-(BANNER_H + insets.top))).current;
  const initRef = useRef(false);

  useEffect(() => {
    // skip the very first "online" state so we don't flash on mount
    if (!initRef.current && isOnline) {
      initRef.current = true;
      return;
    }
    initRef.current = true;

    Animated.spring(slideY, {
      toValue: isOnline ? -(BANNER_H + insets.top) : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start();
  }, [isOnline]);

  return (
    <Animated.View
      style={[styles.banner, { paddingTop: insets.top, transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      <View style={styles.row}>
        <Ionicons name="cloud-offline-outline" size={14} color={Colors.white} />
        <Text style={styles.text}>No internet connection</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#1C1C1E',
    paddingBottom: 10,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
    letterSpacing: 0.1,
  },
});
