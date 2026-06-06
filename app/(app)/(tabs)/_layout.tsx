import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View, Text, StyleSheet, Animated, Pressable,
} from 'react-native';
import { useRef, useEffect } from 'react';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useConversations } from '@/hooks/useMessages';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// ── Animated center button ────────────────────────────────────────
function CenterButton({
  isFocused,
  onPress,
  gradientColors,
  badge,
}: {
  isFocused: boolean;
  onPress: () => void;
  gradientColors: [string, string];
  badge?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(isFocused ? 1 : 0.7)).current;

  useEffect(() => {
    Animated.spring(glow, {
      toValue: isFocused ? 1 : 0.7,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [isFocused]);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={`Messages, tab 3 of 5${badge ? `, ${badge} unread` : ''}`}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={gradientColors}
          style={[styles.centerBtn, isFocused && styles.centerBtnActive]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="chatbubbles" size={23} color={Colors.white} />
        </LinearGradient>
        {badge != null && badge > 0 && (
          <View style={styles.centerBadge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// ── Animated regular tab item ─────────────────────────────────────
function TabItem({
  icon,
  label,
  isFocused,
  activeColor,
  activeBg,
  onPress,
  accessLabel,
}: {
  icon: string;
  label: string;
  isFocused: boolean;
  activeColor: string;
  activeBg: string;
  onPress: () => void;
  accessLabel: string;
}) {
  const iconScale = useRef(new Animated.Value(isFocused ? 1 : 0.9)).current;
  const pillOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: isFocused ? 1 : 0.9,
        useNativeDriver: true,
        speed: 28,
        bounciness: 10,
      }),
      Animated.spring(pillOpacity, {
        toValue: isFocused ? 1 : 0,
        useNativeDriver: true,
        speed: 24,
        bounciness: 0,
      }),
    ]).start();
  }, [isFocused]);

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabItem}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={accessLabel}
    >
      <View style={styles.iconArea}>
        <Animated.View
          style={[
            styles.iconPill,
            { backgroundColor: activeBg, opacity: pillOpacity },
          ]}
        />
        <Animated.View style={{ transform: [{ scale: iconScale }], zIndex: 1 }}>
          <Ionicons
            name={(isFocused ? icon : `${icon}-outline`) as any}
            size={22}
            color={isFocused ? activeColor : Colors.gray400}
          />
        </Animated.View>
      </View>
      <Text
        style={[
          styles.tabLabel,
          isFocused && { color: activeColor, fontWeight: '700' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Custom tab bar ────────────────────────────────────────────────
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { user, profile } = useAuth();
  const isMentor = profile?.role === 'mentor';
  const insets = useSafeAreaInsets();
  const { conversations } = useConversations(user?.id ?? '');

  const unreadCount = conversations.reduce((sum, c) => {
    const u = isMentor ? (c.mentor_unread ?? 0) : (c.student_unread ?? 0);
    return sum + u;
  }, 0);

  const activeColor = isMentor ? Colors.accent2 : Colors.primary;
  const activeBg = isMentor ? Colors.accent2Light : Colors.primaryLight;
  const gradientColors: [string, string] = isMentor
    ? [Colors.accent2, Colors.accent]
    : [Colors.primary, Colors.accent3];

  const TABS = [
    { name: 'home', icon: 'home', label: 'Home' },
    {
      name: 'discover',
      icon: isMentor ? 'people' : 'person-circle',
      label: isMentor ? 'Hub' : 'Mentor',
    },
    { name: 'messages', icon: 'chatbubbles', label: null },
    { name: 'schedule', icon: 'calendar', label: 'Schedule' },
    { name: 'profile', icon: 'person', label: 'Profile' },
  ];

  const emit = (key: string) =>
    navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });

  return (
    <View style={[styles.outerShell, { paddingBottom: insets.bottom }]}>
      <View style={styles.barRow}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const isCenter = index === 2;
          const tab = TABS[index];

          const onPress = () => {
            const event = emit(route.key);
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (isCenter) {
            return (
              <View key={route.key} style={styles.centerWrapper}>
                <CenterButton
                  isFocused={isFocused}
                  onPress={onPress}
                  gradientColors={gradientColors}
                  badge={unreadCount > 0 ? unreadCount : undefined}
                />
              </View>
            );
          }

          return (
            <TabItem
              key={route.key}
              icon={tab.icon}
              label={tab.label ?? ''}
              isFocused={isFocused}
              activeColor={activeColor}
              activeBg={activeBg}
              onPress={onPress}
              accessLabel={`${tab.label}, tab ${index + 1} of 5`}
            />
          );
        })}
      </View>
    </View>
  );
}

// ── Root export ───────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="discover" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="schedule" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerShell: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.09,
    shadowRadius: 20,
    elevation: 12,
  },

  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 66,
    paddingHorizontal: 4,
  },

  // ── Regular tab items ─────────────────────────────────────────
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  iconArea: {
    width: 46,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconPill: {
    position: 'absolute',
    width: 46,
    height: 34,
    borderRadius: 10,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.gray400,
    letterSpacing: 0.15,
  },

  // ── Center (Messages) button ──────────────────────────────────
  centerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtn: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.38,
    shadowRadius: 12,
    elevation: 8,
  },
  centerBtnActive: {
    shadowOpacity: 0.55,
    shadowRadius: 16,
  },

  // ── Badge ─────────────────────────────────────────────────────
  centerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.white,
    lineHeight: 12,
  },
});
