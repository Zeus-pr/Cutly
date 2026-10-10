import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { PatternWavesSurface } from '@/components/PatternWavesSurface';
import {
  SplashWordmark,
  splashLogoHeight,
  splashLogoWidth
} from '@/components/SplashWordmark';
import { lightColors, spacing } from '@/constants/theme';

const patternStill = require('@/assets/splash-pattern-waves.png');

type Props = {
  footer?: ReactNode;
  /** Still + logo painted — safe to drop native bridge (no gap). */
  onBridgeReady?: () => void;
  paddingBottom?: number;
};

/**
 * Same composition as Android launch bridge.
 * Still + logo stay opaque until live WebView is ready (avoids coral flash).
 */
export function BootPatternBeat({ footer, onBridgeReady, paddingBottom = 28 }: Props) {
  const { width, height } = useWindowDimensions();
  const logoWidth = splashLogoWidth(width);
  const logoHeight = splashLogoHeight(logoWidth);
  const logoLeft = (width - logoWidth) / 2;
  const logoTop = (height - logoHeight) / 2;

  const [stillLoaded, setStillLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [wavesReady, setWavesReady] = useState(false);
  const reported = useRef(false);

  useEffect(() => {
    if (!stillLoaded || !logoLoaded || reported.current) return;
    reported.current = true;
    // One frame after both images decode so the screen has painted under the native bridge.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onBridgeReady?.());
    });
  }, [stillLoaded, logoLoaded, onBridgeReady]);

  // Cached assets may not fire onLoad — treat as ready quickly.
  useEffect(() => {
    const t = setTimeout(() => {
      setStillLoaded(true);
      setLogoLoaded(true);
    }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.root}>
      <Image
        source={patternStill}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        onLoad={() => setStillLoaded(true)}
      />
      {/* Keep WebView invisible until it paints — never flash blank coral over the still. */}
      <View
        style={[StyleSheet.absoluteFill, { opacity: wavesReady ? 1 : 0 }]}
        pointerEvents="none"
      >
        <PatternWavesSurface
          style={StyleSheet.absoluteFill}
          onReady={() => setWavesReady(true)}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: logoLeft,
          top: logoTop,
          width: logoWidth,
          height: logoHeight
        }}
      >
        <SplashWordmark width={logoWidth} onLoad={() => setLogoLoaded(true)} />
      </View>
      {footer ? (
        <View
          style={[styles.footerDock, { bottom: paddingBottom, paddingHorizontal: spacing.lg }]}
          pointerEvents="box-none"
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: lightColors.accent
  },
  footerDock: {
    position: 'absolute',
    left: 0,
    right: 0
  }
});
