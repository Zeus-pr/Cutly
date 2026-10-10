import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  /** Soft selection haptic on press (default true). */
  haptic?: boolean;
  /** Pressed scale; default 0.96. */
  pressedScale?: number;
  hitSlop?: number;
  /** When this flips to true, play a short select pop. */
  selected?: boolean;
};

const springIn = { damping: 18, stiffness: 420, mass: 0.6 };
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Interactive control with press scale feedback.
 * Use for chips, pills, and list rows - not for text-only links.
 */
export function PressScale({
  children,
  onPress,
  style,
  disabled,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityState,
  haptic = true,
  pressedScale = 0.96,
  hitSlop,
  selected
}: Props) {
  const scale = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);
  const prevSelected = useRef(!!selected);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (selected && !prevSelected.current && !reduceMotion) {
      scale.value = withTiming(1.06, { duration: 110, easing: easeOut }, () => {
        scale.value = withSpring(1, springIn);
      });
    }
    prevSelected.current = !!selected;
  }, [selected, reduceMotion, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  function down() {
    if (disabled || reduceMotion) return;
    scale.value = withTiming(pressedScale, { duration: 90, easing: easeOut });
  }

  function up() {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(1, springIn);
  }

  function handlePress() {
    if (disabled) return;
    if (haptic) void Haptics.selectionAsync();
    onPress?.();
  }

  // Hoist flex/width onto Pressable so row layouts (Floor primary/secondary) stretch.
  const flat = StyleSheet.flatten(style) || {};
  const {
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    width,
    minWidth,
    maxWidth,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    ...innerStyle
  } = flat as ViewStyle;

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={down}
      onPressOut={up}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      hitSlop={hitSlop}
      style={{
        flex,
        flexGrow,
        flexShrink,
        flexBasis,
        alignSelf,
        width,
        minWidth,
        maxWidth,
        margin,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        marginHorizontal,
        marginVertical
      }}
    >
      <Animated.View style={[innerStyle, animStyle]}>{children}</Animated.View>
    </Pressable>
  );
}
