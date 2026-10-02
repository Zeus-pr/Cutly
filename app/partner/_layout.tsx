import { Stack } from 'expo-router';
import { useColors } from '@/store/useThemeStore';

export default function PartnerLayout() {
  const colors = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Screen name="auth" />
      <Stack.Screen name="setup" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="details" />
    </Stack>
  );
}
