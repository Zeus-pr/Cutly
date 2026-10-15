import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { fontFamily } from '@/constants/fonts';
import { lightColors, radii } from '@/constants/theme';
import { useToastStore } from '@/store/useToastStore';

/** Bottom-anchored ink pill (T4 spec 06 / 08). Mounted once in app/_layout.tsx. */
export function InkToast() {
  const { message, icon, seq, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(message);
    anim.setValue(0);
    const run = Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(anim, { toValue: 0, duration: 320, useNativeDriver: true })
    ]);
    run.start(({ finished }) => finished && hide());
    return () => run.stop();
  }, [seq]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!message) return null;
  const slide = reduceMotion ? 0 : anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pill, { bottom: insets.bottom + 32, opacity: anim, transform: [{ translateY: slide }] }]}
      accessibilityLiveRegion="polite"
    >
      {icon ? <Ionicons name={icon as never} size={16} color="#FFF" /> : null}
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: lightColors.ink,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 1000,
    elevation: 6
  },
  text: { fontFamily: fontFamily.semibold, fontSize: 14, color: '#FFF' }
});
