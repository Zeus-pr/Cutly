import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { router } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PatternWavesSurface } from '@/components/PatternWavesSurface';
import { PressScale } from '@/components/PressScale';
import { SplashWordmark, splashLogoWidth } from '@/components/SplashWordmark';
import { fontFamily, useClashFonts } from '@/constants/fonts';
import { lightColors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/useSessionStore';

/** PatternWaves launch — stays until Get Started → customer auth. */
export default function Launch() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [fontsLoaded, fontError] = useClashFonts();
  const fontsReady = fontsLoaded || Boolean(fontError);
  const logoWidth = splashLogoWidth(width);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  function start() {
    const session = useSessionStore.getState();
    session.passLaunch();
    session.passIntro();
    session.setAudience('customer');
    router.replace('/auth');
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <PatternWavesSurface style={StyleSheet.absoluteFill} />
      <View
        style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 28 }]}
        pointerEvents="box-none"
      >
        <View style={styles.brand} pointerEvents="none">
          <SplashWordmark width={logoWidth} />
        </View>

        <Animated.View entering={FadeInUp.delay(160).duration(360)} style={styles.footer}>
          <PressScale style={styles.cta} onPress={start} haptic accessibilityLabel="Get Started">
            <Text
              style={[styles.ctaText, fontsReady ? styles.ctaTextFont : styles.ctaTextSystem]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              Get Started
            </Text>
          </PressScale>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: lightColors.accent },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg
  },
  brand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm
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
  ctaTextSystem: { fontWeight: '700' },
  ctaTextFont: { fontFamily: fontFamily.bold }
});
