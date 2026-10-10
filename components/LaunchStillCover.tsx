import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  SplashWordmark,
  splashLogoHeight,
  splashLogoWidth
} from '@/components/SplashWordmark';
import { lightColors } from '@/constants/theme';

const patternStill = require('@/assets/splash-pattern-waves.png');

type Props = {
  /** Still + logo painted — safe to drop native bridge. */
  onReady?: () => void;
};

/**
 * Exact match for Android launch bridge (no WebView / no 2nd animation).
 * Signed-in: sits until home has painted, then parent unmounts.
 */
export function LaunchStillCover({ onReady }: Props) {
  const { width, height } = useWindowDimensions();
  const logoWidth = splashLogoWidth(width);
  const logoHeight = splashLogoHeight(logoWidth);
  const [stillLoaded, setStillLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const reported = useRef(false);

  useEffect(() => {
    if (!stillLoaded || !logoLoaded || reported.current) return;
    reported.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onReady?.());
    });
  }, [stillLoaded, logoLoaded, onReady]);

  useEffect(() => {
    const t = setTimeout(() => {
      setStillLoaded(true);
      setLogoLoaded(true);
    }, 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.root, { width, height }]} pointerEvents="none">
      <Image
        source={patternStill}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        onLoad={() => setStillLoaded(true)}
      />
      <View
        style={{
          position: 'absolute',
          left: (width - logoWidth) / 2,
          top: (height - logoHeight) / 2,
          width: logoWidth,
          height: logoHeight
        }}
      >
        <SplashWordmark width={logoWidth} onLoad={() => setLogoLoaded(true)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 60,
    backgroundColor: lightColors.accent
  }
});
