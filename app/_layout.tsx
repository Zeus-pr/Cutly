import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSessionStore } from '@/store/useSessionStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { OpeningSplash } from '@/components/OpeningSplash';
import { colors } from '@/constants/theme';
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true } } });
const nativeOpening = Platform.OS === 'android';

function SessionGate() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const accessToken = useSessionStore((state) => state.accessToken);
  const introDone = useSessionStore((state) => state.introDone);
  const router = useRouter();
  const segments = useSegments();
  useEffect(() => { void useSessionStore.getState().hydrate(); }, []);
  useEffect(() => {
    if (!hydrated) return;
    const route = segments[0];
    if (accessToken) {
      if (route === 'welcome' || route === 'auth') router.replace('/(tabs)');
      return;
    }
    if (!introDone) {
      if (route !== 'welcome') router.replace('/welcome');
      return;
    }
    if (route !== 'auth') router.replace('/auth');
  }, [hydrated, accessToken, introDone, segments, router]);
  return null;
}

export default function Layout() {
  const [splash, setSplash] = useState(!nativeOpening);
  const [settled, setSettled] = useState(!nativeOpening);
  useEffect(() => {
    if (!nativeOpening) return;
    const timer = setTimeout(() => setSettled(true), 3200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <QueryClientProvider client={client}>
      <StatusBar style={settled ? 'dark' : 'light'} backgroundColor={settled ? '#FFFFFF' : '#0EC9A5'} />
      <SessionGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      {splash ? <OpeningSplash onDone={() => setSplash(false)} /> : null}
    </QueryClientProvider>
  );
}
