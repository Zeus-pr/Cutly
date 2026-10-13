import { NativeModules, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

/** Drop the Android white launch cover (no-op on iOS). */
export function dismissLaunchBridge() {
  void SplashScreen.hideAsync().catch(() => {});
  if (Platform.OS !== 'android') return;
  try {
    NativeModules.CutlyLaunchBridge?.dismiss?.();
  } catch {
    /* no-op */
  }
}
