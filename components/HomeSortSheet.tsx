import { useEffect, useLayoutEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PressScale } from '@/components/PressScale';
import { HOME_SORT_OPTIONS, type HomeSort, type HomeSortFamily } from '@/utils/homeSort';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

type Props = {
  visible: boolean;
  value: HomeSort;
  /** When set, only options in that family (e.g. Price → Low/High). */
  family?: HomeSortFamily | null;
  onSelect: (sort: HomeSort) => void;
  onClose: () => void;
};

const titles: Record<HomeSortFamily, string> = {
  nearest: 'Sort by distance',
  earliest: 'Sort by availability',
  price: 'Sort by price',
  rating: 'Sort by rating'
};

const sheetEase = Easing.bezier(0.32, 0.72, 0, 1);
const SHEET_TRAVEL = 480;
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 900;

export function HomeSortSheet({ visible, value, family = null, onSelect, onClose }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(sheetStyles);
  const options = family ? HOME_SORT_OPTIONS.filter((o) => o.family === family) : HOME_SORT_OPTIONS;
  const title = family ? titles[family] : 'Sort by';
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      progress.value = 0;
      dragY.value = 0;
      return;
    }
    dragY.value = 0;
    progress.value = 0;
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 280, easing: sheetEase });
  }, [visible, progress, dragY, reduceMotion]);

  function finishClose() {
    dragY.value = 0;
    progress.value = 0;
    onClose();
  }

  /** Soft close from open state (tap backdrop / pick option). */
  function dismiss() {
    if (reduceMotion) {
      finishClose();
      return;
    }
    dragY.value = withTiming(0, { duration: 160, easing: sheetEase });
    progress.value = withTiming(0, { duration: 220, easing: sheetEase }, (finished) => {
      if (finished) scheduleOnRN(finishClose);
    });
  }

  /** Continue the swipe down from the current drag offset. */
  function dismissFromDrag() {
    if (reduceMotion) {
      finishClose();
      return;
    }
    dragY.value = withTiming(SHEET_TRAVEL, { duration: 200, easing: sheetEase }, (finished) => {
      if (finished) scheduleOnRN(finishClose);
    });
    progress.value = withTiming(0, { duration: 200, easing: sheetEase });
  }

  function pick(id: HomeSort) {
    void Haptics.selectionAsync();
    onSelect(id);
    dismiss();
  }

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      // Only drag downward
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const shouldClose = e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (shouldClose) {
        scheduleOnRN(dismissFromDrag);
        return;
      }
      dragY.value = withSpring(0, { damping: 20, stiffness: 280, mass: 0.7 });
    });

  const backdropStyle = useAnimatedStyle(() => {
    const dragFade = 1 - Math.min(dragY.value / SHEET_TRAVEL, 1);
    return { opacity: progress.value * dragFade };
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SHEET_TRAVEL + dragY.value }]
  }));

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.fill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss sort" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.grab}>
              <View style={styles.handle} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>One sort at a time - pick how shops are ordered</Text>
            {options.map((opt) => {
              const selected = value === opt.id;
              return (
                <PressScale
                  key={opt.id}
                  style={[styles.row, selected && styles.rowOn]}
                  onPress={() => pick(opt.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  pressedScale={0.98}
                  haptic={false}
                >
                  <View style={styles.rowCopy}>
                    <Text style={[styles.rowLabel, selected && styles.rowLabelOn]}>{opt.label}</Text>
                    <Text style={styles.rowHint}>{opt.hint}</Text>
                  </View>
                  <View style={[styles.radio, selected && styles.radioOn]}>
                    {selected ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                  </View>
                </PressScale>
              );
            })}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function sheetStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    fill: { flex: 1 },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)'
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xl + 8,
      borderTopWidth: 1,
      borderColor: colors.line
    },
    grab: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
      marginBottom: 2
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line
    },
    title: { ...typography.heading, color: colors.ink },
    sub: { ...typography.caption, color: colors.muted, marginTop: 4, marginBottom: spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.canvas,
      marginBottom: 8
    },
    rowOn: {
      borderColor: colors.accent,
      backgroundColor: colors.canvas
    },
    rowCopy: { flex: 1 },
    rowLabel: { ...typography.body, color: colors.ink, fontWeight: '700' },
    rowLabelOn: { color: colors.accent },
    rowHint: { ...typography.caption, color: colors.muted, marginTop: 2 },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    radioOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent
    }
  });
}
