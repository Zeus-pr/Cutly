import { useCallback, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

const move = { duration: 280, easing: Easing.bezier(0.22, 1, 0.36, 1) };

/** Soft slide+fade when a tab (or screen) gains focus. */
export function TabSceneEnter({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  const x = useSharedValue(28);

  useFocusEffect(
    useCallback(() => {
      if (reduced) {
        opacity.value = 1;
        x.value = 0;
        return;
      }
      opacity.value = 0;
      x.value = 28;
      opacity.value = withTiming(1, move);
      x.value = withTiming(0, move);
    }, [opacity, reduced, x])
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }]
  }));

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 }
});
