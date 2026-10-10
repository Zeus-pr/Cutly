import { router, useLocalSearchParams } from 'expo-router';
import { MotiView } from 'moti';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily } from '@/constants/fonts';
import { lightColors, spacing } from '@/constants/theme';

const FAILSAFE_MS = 2800;

/**
 * Cream interstitial after booking create / pay confirm.
 * Moti only (no expo-av) so Expo Go / unrebuilt clients don’t crash on ExponentAV.
 */
export default function BookingSuccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigated = useRef(false);

  const goDetails = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    if (!id) {
      router.replace('/(tabs)');
      return;
    }
    router.replace({ pathname: '/booking/[id]', params: { id } });
  }, [id]);

  useEffect(() => {
    const t = setTimeout(goDetails, FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [goDetails]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <MotiView
          from={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 160 }}
          style={styles.badge}
        >
          <MotiView
            from={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'timing', duration: 320, delay: 180 }}
          >
            <Ionicons name="checkmark" size={56} color={lightColors.white} />
          </MotiView>
        </MotiView>
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 360, delay: 220 }}
        >
          <Text style={styles.title}>Appointment requested</Text>
          <Text style={styles.sub}>Awaiting shop confirmation…</Text>
        </MotiView>
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
  badge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#05998C',
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    lineHeight: 30,
    color: lightColors.ink,
    textAlign: 'center',
    letterSpacing: -0.3
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 20,
    color: lightColors.muted,
    textAlign: 'center',
    marginTop: 8
  }
});
