import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { savePushToken, removePushToken } from '@/lib/supabase';

// Show notifications as banners even when the app is in the foreground
// Wrapped in try-catch because expo-notifications is not fully supported in Expo Go
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  // Non-fatal: notifications silently disabled in Expo Go
}

export function usePushNotifications(userId: string | null) {
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const registeredTokenRef = useRef<{ userId: string; token: string } | null>(null);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;

    registerAndSaveToken(userId, registeredTokenRef);

    // Handle notification tap — navigate to the relevant screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string>;
      if (!data) return;

      if (
        data.type === 'new_message' ||
        data.type === 'bot_message' ||
        data.type === 'post_meeting_checkin' ||
        data.type === 'meeting_reminder'
      ) {
        if (data.conversationId) {
          router.push(`/(app)/chat/${data.conversationId}` as any);
        }
      } else if (data.type === 'mentor_assigned') {
        if (data.conversationId) {
          router.push(`/(app)/chat/${data.conversationId}` as any);
        }
      }
    });

    return () => {
      responseListener.current?.remove();
      // Remove stale token from DB on sign-out or user change
      const reg = registeredTokenRef.current;
      if (reg) {
        removePushToken(reg.userId, reg.token).catch(() => {});
        registeredTokenRef.current = null;
      }
    };
  }, [userId]);
}

async function registerAndSaveToken(
  userId: string,
  tokenRef: React.MutableRefObject<{ userId: string; token: string } | null>
) {
  // Android requires a notification channel before anything works
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Mentara',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // User declined notifications — respect that, don't nag
  if (finalStatus !== 'granted') return;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await savePushToken(userId, tokenData.data, Platform.OS as 'ios' | 'android');
    tokenRef.current = { userId, token: tokenData.data };
  } catch (e) {
    // Non-fatal — simulators and devices without a valid EAS project ID will always fail here.
    // Logged at debug level so it doesn't surface as a LogBox warning in development.
    if (__DEV__) console.log('[usePushNotifications] Could not register push token:', e);
  }
}
