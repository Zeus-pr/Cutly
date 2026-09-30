import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { OpeningSplash } from '@/components/OpeningSplash';
import { colors } from '@/constants/theme';
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: true } } });
const nativeOpening = Platform.OS === 'android';
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
      {splash ? <OpeningSplash onDone={() => setSplash(false)} /> : null}
    </QueryClientProvider>
  );
}
