import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LottieView from 'lottie-react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { lightColors, radii, spacing } from '@/constants/theme';
import { dismissLaunchBridge } from '@/utils/dismissLaunchBridge';

const LAUNCH = require('@/assets/animations/launch-splash.json');
/** 138.6 frames at 60fps, plus a little slack if the player stalls. */
const FINISH_FAILSAFE_MS = 3200;

const LINE = 'HAIR  |  GROOMING  |  TATTOO  |  PIERCING  |  WELLNESS';

type Props = {
  ready: boolean;
  signedIn: boolean;
  onGetStarted: () => void;
  onEnterHome: () => void;
};

/**
 * Launch Lottie.
 * Unsigned: CutLy. + category line + Get Started.
 * Signed-in: animation only, then home. No end screen.
 */
export function PatternWavesSplash({ ready, signedIn, onGetStarted, onEnterHome }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const handedOff = useRef(false);
  const [finished, setFinished] = useState(false);

  const handoffFromNative = useCallback(() => {
    if (handedOff.current) return;
    handedOff.current = true;
    dismissLaunchBridge();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setFinished(true), FINISH_FAILSAFE_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!finished || !signedIn || !ready) return;
    onEnterHome();
  }, [finished, signedIn, ready, onEnterHome]);

  const lockup = finished && !signedIn ? (
    <View style={styles.lockup} pointerEvents="none">
      <Text style={[styles.word, styles.wordFont]} allowFontScaling={false}>
        CutLy.
      </Text>
      <Text style={[styles.line, styles.lineFont]} numberOfLines={1} adjustsFontSizeToFit allowFontScaling={false}>
        {LINE}
      </Text>
    </View>
  ) : null;

  const footer =
    ready && finished && !signedIn ? (
      <Animated.View entering={FadeInUp.delay(40).duration(180)} style={[styles.footer, { bottom: insets.bottom + 28 }]}>
        <PressScale style={styles.cta} onPress={onGetStarted} haptic accessibilityLabel="Get Started">
          <Text style={[styles.ctaText, styles.ctaTextFont]} numberOfLines={1} allowFontScaling={false}>
            Get Started
          </Text>
        </PressScale>
      </Animated.View>
    ) : null;

  return (
    <View style={[styles.root, { width, height }]} pointerEvents="box-none">
      <StatusBar style="light" />
      <LottieView
        source={LAUNCH}
        autoPlay
        loop={false}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        onAnimationLoaded={handoffFromNative}
        onAnimationFinish={() => setFinished(true)}
      />
      {lockup}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    backgroundColor: '#F06B55'
  },
  lockup: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg
  },
  word: {
    color: '#FFFFFF',
    fontSize: 64,
    lineHeight: 72,
    textAlign: 'center'
  },
  wordFont: { fontFamily: fontFamily.bold },
  line: {
    marginTop: 14,
    width: '100%',
    color: '#FFFFFF',
    fontSize: 11,
    letterSpacing: 1.2,
    textAlign: 'center'
  },
  lineFont: { fontFamily: fontFamily.medium },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg
  },
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
