import { useEffect } from 'react';
import { Linking, LogBox } from 'react-native';

LogBox.ignoreLogs([
  'Haptic.impactAsync is not available on ios',
  'The method or property Haptic.impactAsync is not available',
]);
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_700Bold,
  PlayfairDisplay_800ExtraBold,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import ErrorBoundary from '@/components/ErrorBoundary';
import NetworkBanner from '@/components/NetworkBanner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import * as Sentry from '@sentry/react-native';

// Production error & crash reporting. Stays a no-op until EXPO_PUBLIC_SENTRY_DSN is set,
// and only sends from release builds (never from local dev / Expo Go).
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
// Always initialize so Sentry.wrap() has a client; only *send* when a DSN is set
// in a release build (never from local dev / Expo Go).
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN && !__DEV__,
  sendDefaultPii: false,       // don't auto-attach IP/PII — we set only a user id below
  tracesSampleRate: 0.2,       // 20% performance sampling; tune as traffic grows
});

let splashRegistered = false;
SplashScreen.preventAutoHideAsync()
  .then(() => { splashRegistered = true; })
  .catch(() => { splashRegistered = false; });

// Inner component lives inside AuthProvider so it can read loading state
function RootLayoutInner() {
  const { loading, user } = useAuth();
  usePushNotifications(user?.id ?? null);

  // Attach the signed-in user's id to error reports (no email/PII) so crashes
  // can be traced to a session; clears on sign-out.
  useEffect(() => {
    Sentry.setUser(user ? { id: user.id } : null);
  }, [user]);

  useEffect(() => {
    if (!loading && splashRegistered) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loading]);

  // Handle OAuth callback and password-reset deep links (mentara:// scheme)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      if (!url || !url.includes('mentara://')) return;

      const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';
      const params = new URLSearchParams(query || '');
      const code = params.get('code');
      const type = params.get('type');

      // Only handle password-reset deep links here.
      // OAuth codes are handled exclusively inside signInWithGoogle() via
      // openAuthSessionAsync, which captures the redirect without firing Linking.
      // Handling OAuth codes here too causes a double exchangeCodeForSession call
      // which consumes the server-side PKCE flow state, making the second call
      // fail with "invalid flow state, no valid flow state found".
      if (type === 'recovery' && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        // Don't navigate to reset-password if the code exchange failed —
        // the user would land on a screen that can't actually update the password.
        if (error) return;
        router.replace('/(auth)/reset-password');
        return;
      }

      // Referral link: mentara://ref/ABCD1234
      const refMatch = url.match(/mentara:\/\/ref\/([A-Z0-9]+)/i);
      if (refMatch?.[1]) {
        const refCode = refMatch[1].toUpperCase();
        try {
          await SecureStore.setItemAsync('mentara_pending_referral', refCode);
        } catch {}
      }
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    // Handle cold-start: app opened via deep link while not running
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="about" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <NetworkBanner />
    </>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    GreatVibes_400Regular,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            <RootLayoutInner />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Wrap with Sentry so it can capture render errors and touch/navigation context.
export default Sentry.wrap(RootLayout);
