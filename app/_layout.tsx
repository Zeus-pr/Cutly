import 'react-native-gesture-handler';
import * as SecureStore from 'expo-secure-store';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { refreshProfile } from '@/services/auth';
import { registerForPushNotifications, attachPushResponseListeners } from '@/services/notifications';
import { useBookingCartStore } from '@/store/useBookingCartStore';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemeStore } from '@/store/useThemeStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { AppDialogHost } from '@/components/AppDialog';
import { NotFoundScreen } from '@/components/NotFoundScreen';
import { PatternWavesSplash } from '@/components/PatternWavesSplash';
import { clashFontsReady, useClashFonts } from '@/constants/fonts';
import { lightColors } from '@/constants/theme';
import { dismissLaunchBridge } from '@/utils/dismissLaunchBridge';

/** SEC-06: crashes / unknown routes share the soft 404 shell (no stack to the user). */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <NotFoundScreen onRetry={retry} />;
}

const ACCENT = lightColors.accent;
/** Never hang forever if font fetch fails on flaky Metro. */
const FONT_FAILSAFE_MS = 2500;
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

void SplashScreen.preventAutoHideAsync().catch(() => {});
// Kick session hydrate before first paint (don't wait for SessionGate mount).
void useSessionStore.getState().hydrate();
void useBookingCartStore.getState().hydrate();

function SessionGate({ bootDone }: { bootDone: boolean }) {
  const hydrated = useSessionStore((state) => state.hydrated);
  const accessToken = useSessionStore((state) => state.accessToken);
  const name = useSessionStore((state) => state.name);
  const introDone = useSessionStore((state) => state.introDone);
  const launchDone = useSessionStore((state) => state.launchDone);
  const audience = useSessionStore((state) => state.audience);
  const partnerToken = useSessionStore((state) => state.partnerToken);
  const setupDone = useSessionStore((state) => state.setupDone);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Hydrate already started at module load — only attach follow-ups.
    const run = () => {
      void refreshProfile();
      if (useSessionStore.getState().accessToken) void registerForPushNotifications();
      if (useSessionStore.getState().partnerToken) void registerForPushNotifications();
    };
    if (useSessionStore.getState().hydrated) run();
    else void useSessionStore.getState().hydrate().then(run);
    void usePlaceStore.getState().hydrate();
    void useThemeStore.getState().hydrate();
    void useBookingCartStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (hydrated && (accessToken || partnerToken)) void registerForPushNotifications();
  }, [hydrated, accessToken, partnerToken]);

  useEffect(() => {
    if (!hydrated) return;
    return attachPushResponseListeners(() => undefined);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !bootDone) return;
    const root = segments[0];
    const child = segments[1];

    if (partnerToken) {
      if (!setupDone) {
        if (!(root === 'partner' && child === 'setup')) router.replace('/partner/setup');
        return;
      }
      const inside = root === 'partner' && child !== 'auth' && child !== 'setup';
      if (!inside) router.replace('/partner/(tabs)');
      return;
    }

    if (audience === 'partner' && !partnerToken) {
      if (!(root === 'partner' && child === 'auth')) router.replace('/partner/auth');
      return;
    }

    if (accessToken) {
      const profileReady = Boolean(name?.trim());
      if (!profileReady) {
        if (root !== 'complete-profile') router.replace('/complete-profile');
        return;
      }
      // Only bounce off auth/launch gates — never yank shop/booking/etc. back to home.
      if (
        root === 'welcome' ||
        root === 'auth' ||
        root === 'role' ||
        root === 'partner' ||
        root === 'complete-profile' ||
        root === 'launch'
      ) {
        router.replace('/(tabs)');
      }
      return;
    }

    // Unsigned: splash → customer auth. Partner login is reached from auth footer only.
    if (!launchDone) return;
    if (!introDone) useSessionStore.getState().passIntro();
    const onPartnerAuth = root === 'partner' && child === 'auth';
    if (!onPartnerAuth && root !== 'auth') router.replace('/auth');
  }, [
    hydrated,
    bootDone,
    accessToken,
    name,
    introDone,
    launchDone,
    audience,
    partnerToken,
    setupDone,
    segments,
    router
  ]);

  return null;
}

export default function Layout() {
  const [fontsLoaded, fontError] = useClashFonts();
  const [fontFailsafe, setFontFailsafe] = useState(false);
  const typeReady = clashFontsReady(fontsLoaded, fontError) || fontFailsafe;
  const colors = useColors();
  const dark = useThemeStore((state) => state.dark);
  const hydrated = useSessionStore((state) => state.hydrated);
  const accessToken = useSessionStore((state) => state.accessToken);
  const partnerToken = useSessionStore((state) => state.partnerToken);
  const launchDone = useSessionStore((state) => state.launchDone);
  const name = useSessionStore((state) => state.name);
  const setupDone = useSessionStore((state) => state.setupDone);
  const router = useRouter();
  const segments = useSegments();
  const [tokenSignedIn, setTokenSignedIn] = useState(false);
  const [bootSplash, setBootSplash] = useState(true);
  const nativeDismissed = useRef(false);

  const signedIn = Boolean(accessToken || partnerToken || tokenSignedIn);

  useEffect(() => {
    const t = setTimeout(() => setFontFailsafe(true), FONT_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // If hydrate already finished, mirror signed-in immediately.
    const s = useSessionStore.getState();
    if (s.accessToken || s.partnerToken) {
      setTokenSignedIn(true);
      setBootSplash(false);
      return;
    }
    let cancelled = false;
    void Promise.all([
      SecureStore.getItemAsync('cutly.accessToken'),
      SecureStore.getItemAsync('cutly.partnerToken')
    ]).then(([access, partner]) => {
      if (!cancelled && (access || partner)) {
        setTokenSignedIn(true);
        setBootSplash(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (signedIn) setBootSplash(false);
  }, [signedIn]);

  useEffect(() => {
    if (hydrated && !signedIn && launchDone) setBootSplash(false);
  }, [hydrated, signedIn, launchDone]);

  const onHomeRoute = (() => {
    if (!hydrated || !signedIn) return false;
    const root = segments[0];
    const child = segments[1];
    if (partnerToken) {
      if (!setupDone) return root === 'partner' && child === 'setup';
      return root === 'partner' && child !== 'auth' && child !== 'setup';
    }
    if (accessToken) {
      if (!name?.trim()) return root === 'complete-profile';
      return root === '(tabs)';
    }
    return false;
  })();

  // Drop native only when home is up AND Clash is ready (no system-font flash).
  useEffect(() => {
    if (!onHomeRoute || !typeReady || nativeDismissed.current) return;
    nativeDismissed.current = true;
    dismissLaunchBridge();
  }, [onHomeRoute, typeReady]);

  const bootDone = !bootSplash && typeReady;
  const showBoot = bootSplash && !signedIn && !(hydrated && launchDone);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: ACCENT }]}>
      <QueryClientProvider client={client}>
        <StatusBar style={dark || showBoot || (signedIn && !onHomeRoute) ? 'light' : 'dark'} />
        <NativeStatusBar
          backgroundColor={showBoot || (signedIn && !onHomeRoute) ? ACCENT : colors.canvas}
        />
        <SessionGate bootDone={bootDone} />
        {typeReady ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: showBoot || (signedIn && !onHomeRoute) ? ACCENT : colors.canvas
              },
              animation: 'slide_from_right'
            }}
          />
        ) : (
          <View style={[styles.root, { backgroundColor: ACCENT }]} />
        )}
        <AppDialogHost />
        {showBoot && typeReady ? (
          <PatternWavesSplash
            ready={hydrated}
            onGetStarted={() => {
              const session = useSessionStore.getState();
              session.passLaunch();
              session.passIntro();
              session.setAudience('customer');
              setBootSplash(false);
              router.replace('/auth');
            }}
          />
        ) : null}
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }
});
