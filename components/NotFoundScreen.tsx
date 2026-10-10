import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontFamily } from '@/constants/fonts';
import { lightColors, radii, spacing } from '@/constants/theme';

const COPY = 'We cannot find the page you are looking for.';
const CAT = require('../assets/animations/404-cat.json');

type Props = {
  /** Optional retry for ErrorBoundary */
  onRetry?: () => void;
};

/** Shared unmatched-route / crash shell (SEC-06 client). */
export function NotFoundScreen({ onRetry }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <LottieView
          source={CAT}
          autoPlay
          loop
          style={styles.lottie}
          accessibilityLabel="Page not found animation"
        />
        <Text style={styles.title}>{COPY}</Text>
        <View style={styles.actions}>
          {onRetry ? (
            <Pressable style={styles.btnSecondary} onPress={onRetry} accessibilityRole="button">
              <Text style={styles.btnSecondaryLabel}>Try again</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.btn}
            onPress={() => router.replace('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel="Go home"
          >
            <Text style={styles.btnLabel}>Go home</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.canvas },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg
  },
  lottie: {
    width: 280,
    height: 250
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 18,
    lineHeight: 26,
    color: lightColors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
    maxWidth: 300
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: {
    backgroundColor: lightColors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radii.pill,
    minWidth: 120,
    alignItems: 'center'
  },
  btnLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: lightColors.white
  },
  btnSecondary: {
    backgroundColor: lightColors.sand,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radii.pill,
    minWidth: 120,
    alignItems: 'center'
  },
  btnSecondaryLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: lightColors.ink
  }
});
