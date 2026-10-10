import { Image } from 'expo-image';
import { View } from 'react-native';

const sourceSolid = require('@/assets/cutly-logo.png');
const sourceClear = require('@/assets/cutly-logo-clear.png');

/** Wordmark (+ optional tagline) sit in a horizontal band of a square brand field. */
export function CutlyLogo({
  width,
  rounded = 16,
  /** White glyphs only — no coral fill (for PatternWaves / dark overlays). */
  clear = false,
  /** Crop to CutLy word only (no “GROOMING MADE EASY”). */
  markOnly = false
}: {
  width: number;
  rounded?: number;
  clear?: boolean;
  markOnly?: boolean;
}) {
  // Source art is 1200×1200; bands tuned to the lockup in `cutly-logo.png`.
  const cropTop = markOnly ? 468 : 448;
  const cropHeight = markOnly ? 168 : 320;
  const height = width * (cropHeight / 1200);
  const offset = width * (cropTop / 1200);
  return (
    <View style={{ width, height, borderRadius: rounded, overflow: 'hidden' }}>
      <Image
        source={clear ? sourceClear : sourceSolid}
        accessibilityLabel="CutLy"
        contentFit="fill"
        style={{ width, height: width, marginTop: -offset }}
      />
    </View>
  );
}
