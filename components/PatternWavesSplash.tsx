import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BootPatternBeat } from '@/components/BootPatternBeat';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { lightColors, radii } from '@/constants/theme';
import { dismissLaunchBridge } from '@/utils/dismissLaunchBridge';

type Props = {
  ready: boolean;
  onGetStarted: () => void;
};

/**
 * Unsigned only — PatternWaves + Get Started.
 * Signed-in skips this entirely (native bridge → home).
 * Root layout gates Clash before mounting this, so CTA always uses brand type.
 */
export function PatternWavesSplash({ ready, onGetStarted }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const handedOff = useRef(false);

  const handoffFromNative = useCallback(() => {
    if (handedOff.current) return;
    handedOff.current = true;
    dismissLaunchBridge();
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Still+logo under native — BootPatternBeat calls when painted.
  }, [ready]);

  const footer = ready ? (
    <Animated.View entering={FadeInUp.delay(40).duration(180)} style={styles.footer}>
      <PressScale
        style={styles.cta}
        onPress={onGetStarted}
        haptic
        accessibilityLabel="Get Started"
      >
        <Text style={[styles.ctaText, styles.ctaTextFont]} numberOfLines={1} allowFontScaling={false}>
          Get Started
        </Text>
      </PressScale>
    </Animated.View>
  ) : undefined;

  return (
    <View style={[styles.root, { width, height }]} pointerEvents="box-none">
      <StatusBar style="light" />
      <BootPatternBeat
        paddingBottom={insets.bottom + 28}
        footer={footer}
        onBridgeReady={handoffFromNative}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    backgroundColor: lightColors.accent
  },
  footer: { width: '100%', alignSelf: 'stretch' },
  cta: {
    width: '100%',
    alignSelf: 'stretch',
    height: 56,
    borderRadius: radii.md,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    overflow: 'visible'
  },
  ctaText: {
    fontSize: 17,
    lineHeight: 22,
    color: lightColors.accent,
    textAlign: 'center',
    includeFontPadding: false
  },
  ctaTextFont: { fontFamily: fontFamily.bold }
});
