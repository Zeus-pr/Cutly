import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Platform, StatusBar as NativeStatusBar } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { refreshProfile } from '@/services/auth';
import { registerForPushNotifications } from '@/services/notifications';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemeStore } from '@/store/useThemeStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { OpeningSplash } from '@/components/OpeningSplash';
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true } } });
const nativeOpening = Platform.OS === 'android';

function SessionGate() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const accessToken = useSessionStore((state) => state.accessToken);
  const introDone = useSessionStore((state) => state.introDone);
  const audience = useSessionStore((state) => state.audience);
  const partnerToken = useSessionStore((state) => state.partnerToken);
  const setupDone = useSessionStore((state) => state.setupDone);
  const router = useRouter();
  const segments = useSegments();
  useEffect(() => {
    void useSessionStore.getState().hydrate().then(async () => {
      await refreshProfile();
      if (useSessionStore.getState().accessToken) await registerForPushNotifications();
    });
    void usePlaceStore.getState().hydrate();
    void useThemeStore.getState().hydrate();
  }, []);
  useEffect(() => {
    if (hydrated && accessToken) void registerForPushNotifications();
  }, [hydrated, accessToken]);
  useEffect(() => {
    if (!hydrated) return;
    const root = segments[0];
    const child = segments[1];
    const signedIn = Boolean(accessToken || partnerToken);

    // Role gate always until a real sign-in. Audience is session-only before that.
    if (!signedIn && !audience) {
      if (root !== 'role') router.replace('/role');
      return;
    }

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
      if (root === 'welcome' || root === 'auth' || root === 'role' || root === 'partner') router.replace('/(tabs)');
      return;
    }

    // Customer path before sign-in (same session only)
    if (!introDone) {
      if (root !== 'welcome') router.replace('/welcome');
      return;
    }
    if (root !== 'auth') router.replace('/auth');
  }, [hydrated, accessToken, introDone, audience, partnerToken, setupDone, segments, router]);
  return null;
}

export default function Layout() {
  const colors = useColors();
  const dark = useThemeStore((state) => state.dark);
  const [splash, setSplash] = useState(!nativeOpening);
  const [settled, setSettled] = useState(!nativeOpening);
  useEffect(() => {
    if (!nativeOpening) return;
    const timer = setTimeout(() => setSettled(true), 3200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <QueryClientProvider client={client}>
      <StatusBar style={!settled || dark ? 'light' : 'dark'} />
      <NativeStatusBar backgroundColor={settled ? colors.canvas : '#0EC9A5'} />
      <SessionGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      {splash ? <OpeningSplash onDone={() => setSplash(false)} /> : null}
    </QueryClientProvider>
  );
}
