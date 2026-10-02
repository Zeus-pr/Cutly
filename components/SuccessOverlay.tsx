import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { typography } from '@/constants/theme';
import { useColors } from '@/store/useThemeStore';

type Props = {
  visible: boolean;
  ready?: boolean;
  label?: string;
  onDone?: () => void;
};

export function SuccessOverlay({ visible, ready = true, label = 'All set', onDone }: Props) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const circle = useSharedValue(0);
  const check = useSharedValue(0);
  const ripple = useSharedValue(0);
  const copy = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      circle.value = 0;
      check.value = 0;
      ripple.value = 0;
      copy.value = 0;
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (reduceMotion) {
      circle.value = 1;
      check.value = 1;
      ripple.value = 1;
      copy.value = 1;
      return;
    }
    circle.value = withSequence(
      withSpring(1.12, { damping: 9, stiffness: 160, mass: 0.7 }),
      withSpring(1, { damping: 14, stiffness: 180 })
    );
    ripple.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    check.value = withDelay(220, withSpring(1, { damping: 11, stiffness: 220, mass: 0.55 }));
    copy.value = withDelay(320, withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) }));
  }, [visible, reduceMotion, circle, check, ripple, copy]);

  useEffect(() => {
    if (!visible || !ready || !onDone) return;
    const timer = setTimeout(onDone, reduceMotion ? 500 : 1900);
    return () => clearTimeout(timer);
  }, [visible, ready, onDone, reduceMotion]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: circle.value }],
    opacity: interpolate(circle.value, [0, 0.2, 1], [0, 1, 1])
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(ripple.value, [0, 1], [0.55, 1.55]) }],
    opacity: interpolate(ripple.value, [0, 0.35, 1], [0.45, 0.22, 0])
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: check.value }, { rotate: `${interpolate(check.value, [0, 1], [-18, 0])}deg` }],
    opacity: check.value
  }));

  const copyStyle = useAnimatedStyle(() => ({
    opacity: copy.value,
    transform: [{ translateY: interpolate(copy.value, [0, 1], [10, 0]) }]
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(140)}
        exiting={FadeOut.duration(160)}
        style={[styles.layer, { backgroundColor: colors.canvas }]}
      >
        <View style={styles.stage}>
          <Animated.View style={[styles.ripple, rippleStyle, { borderColor: colors.accent }]} />
          <Animated.View style={[styles.circle, circleStyle, { backgroundColor: colors.accent }]}>
            <Animated.View style={checkStyle}>
              <Ionicons name="checkmark" size={72} color={colors.white} />
            </Animated.View>
          </Animated.View>
        </View>
        <Animated.Text style={[styles.label, copyStyle, { color: colors.ink }]}>{label}</Animated.Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22
  },
  stage: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ripple: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 3
  },
  circle: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    ...typography.heading,
    fontSize: 20,
    letterSpacing: -0.3,
    fontWeight: '700'
  }
});
