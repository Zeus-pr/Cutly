import { Platform } from 'react-native';
import * as Device from 'expo-device';

/**
 * Resolve API base for the current runtime.
 *
 * HARD isolation: emulators/simulators NEVER use EXPO_PUBLIC_API_BASE_URL.
 * - Android emulator → host loopback via 10.0.2.2
 * - iOS Simulator → 127.0.0.1
 * - Physical / Expo Go (incl. cellular) → EXPO_PUBLIC_API_BASE_URL (hosted api.cutly.buzz or LAN)
 */
export function getApiBaseUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();
  if (Platform.OS === 'android' && !Device.isDevice) {
    return 'http://10.0.2.2:4000/api';
  }
  if (Platform.OS === 'ios' && !Device.isDevice) {
    return 'http://127.0.0.1:4000/api';
  }
  return fromEnv || 'http://10.0.2.2:4000/api';
}
