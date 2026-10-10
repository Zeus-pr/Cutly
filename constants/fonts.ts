import * as Font from 'expo-font';
import { useFonts } from 'expo-font';

/** Clash Grotesk — app-wide brand face (from ClashGrotesk_Complete). */
export const clashFonts = {
  ClashGrotesk: require('@/assets/fonts/ClashGrotesk-Regular.ttf'),
  ClashGroteskMedium: require('@/assets/fonts/ClashGrotesk-Medium.ttf'),
  ClashGroteskSemibold: require('@/assets/fonts/ClashGrotesk-Semibold.ttf'),
  ClashGroteskBold: require('@/assets/fonts/ClashGrotesk-Bold.ttf')
} as const;

/** Start load at import time so customer + partner never paint system UI first. */
const preload = Font.loadAsync(clashFonts);
void preload.catch(() => undefined);

export function useClashFonts() {
  const result = useFonts(clashFonts);
  // expo-font returns [loaded, error] — never let callers see a non-array.
  if (!Array.isArray(result)) return [false, null] as const;
  return result;
}

/** True when faces are registered (or load failed — fail open). */
export function clashFontsReady(loaded: boolean, error: Error | null | undefined) {
  return loaded || Boolean(error);
}

export const fontFamily = {
  regular: 'ClashGrotesk',
  medium: 'ClashGroteskMedium',
  semibold: 'ClashGroteskSemibold',
  bold: 'ClashGroteskBold'
} as const;
