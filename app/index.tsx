import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Root entry. Unsigned Get Started is `_layout` PatternWavesSplash.
 * Signed-in: native bridge → here → tabs (no second PatternWaves).
 */
export default function Index() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const accessToken = useSessionStore((state) => state.accessToken);
  const partnerToken = useSessionStore((state) => state.partnerToken);
  const setupDone = useSessionStore((state) => state.setupDone);
  const launchDone = useSessionStore((state) => state.launchDone);

  // Coral placeholder only — never BootPatternBeat (that was the signed-in “2nd animation”).
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#F06B55' }} />;
  }
  if (partnerToken) {
    return <Redirect href={setupDone ? '/partner/(tabs)' : '/partner/setup'} />;
  }
  if (accessToken) return <Redirect href="/(tabs)" />;
  if (!launchDone) {
    return <View style={{ flex: 1, backgroundColor: '#F06B55' }} />;
  }
  return <Redirect href="/auth" />;
}
