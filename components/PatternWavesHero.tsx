import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { PatternWavesSurface } from '@/components/PatternWavesSurface';
import { SplashWordmark } from '@/components/SplashWordmark';
import { lightColors, radii } from '@/constants/theme';

type Props = { height?: number };

/** Home promo — exact reactbits PatternWaves silk (same as launch). */
export function PatternWavesHero({ height = 168 }: Props) {
  const { width } = useWindowDimensions();
  // Smaller than full-screen splash lockup, same asset.
  const logoWidth = Math.min(width * 0.42, 200);

  return (
    <View style={[styles.wrap, { height }]} accessibilityLabel="CutLy — Grooming made easy">
      <PatternWavesSurface interactive bgColor={lightColors.accent} style={StyleSheet.absoluteFill} />
      <View style={styles.overlay} pointerEvents="none">
        <SplashWordmark width={logoWidth} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: lightColors.accent,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)'
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
