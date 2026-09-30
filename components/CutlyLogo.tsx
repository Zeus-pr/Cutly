import { Image } from 'expo-image';
import { View } from 'react-native';

const source = require('@/assets/cutly-logo.png');

/** Wordmark and tagline sit in a horizontal band of a square teal field. */
export function CutlyLogo({ width, rounded = 16 }: { width: number; rounded?: number }) {
  const cropTop = 448;
  const cropHeight = 320;
  const height = width * (cropHeight / 1200);
  const offset = width * (cropTop / 1200);
  return (
    <View style={{ width, height, borderRadius: rounded, overflow: 'hidden' }}>
      <Image
        source={source}
        accessibilityLabel="CutLy"
        contentFit="fill"
        style={{ width, height: width, marginTop: -offset }}
      />
    </View>
  );
}
