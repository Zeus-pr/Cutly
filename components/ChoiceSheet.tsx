import { useEffect, useLayoutEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PressScale } from '@/components/PressScale';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

export type ChoiceOption = {
  id: string;
  label: string;
  subtitle?: string;
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: ChoiceOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Top-right dismiss (no “cancel” row). Backdrop tap still closes. */
  showCloseButton?: boolean;
};

const sheetEase = Easing.bezier(0.32, 0.72, 0, 1);
const SHEET_TRAVEL = 520;
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 900;

/** Bottom slide-up choice sheet (pay method, etc.) — CUTLY cream/navy/coral. */
export function ChoiceSheet({
  visible,
  title,
  subtitle,
  options,
  onSelect,
  onClose,
  showCloseButton = false
}: Props) {
  const colors = useColors();
  const styles = useThemedStyles(sheetStyles);
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

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss">
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <Text style={[styles.title, showCloseButton && styles.titleWithClose]}>{title}</Text>
              {showCloseButton ? (
                <Pressable
                  onPress={dismiss}
                  hitSlop={12}
                  style={styles.closeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              ) : null}
            </View>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            <View style={styles.list}>
              {options.map((option) => (
                <PressScale
                  key={option.id}
                  disabled={option.disabled}
                  onPress={() => {
                    if (option.disabled) return;
                    onSelect(option.id);
                    dismiss();
                  }}
                  style={[styles.row, option.disabled && styles.rowDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ disabled: Boolean(option.disabled) }}
                >
                  <Text style={[styles.rowLabel, option.disabled && styles.rowLabelDisabled]}>{option.label}</Text>
                  {option.subtitle ? (
                    <Text style={[styles.rowSub, option.disabled && styles.rowLabelDisabled]}>{option.subtitle}</Text>
                  ) : null}
                </PressScale>
              ))}
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const sheetStyles = (colors: Palette) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(23,38,60,0.45)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
      borderWidth: 1,
      borderColor: colors.line
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.sand,
      marginBottom: spacing.md
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm
    },
    title: { ...typography.heading, color: colors.ink, fontSize: 18, flex: 1 },
    titleWithClose: { paddingRight: spacing.xs },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.line
    },
    subtitle: { ...typography.caption, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.sm },
    list: { marginTop: spacing.md, gap: spacing.sm },
    row: {
      backgroundColor: colors.canvas,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.line,
      minHeight: 64,
      justifyContent: 'center'
    },
    rowDisabled: { opacity: 0.55 },
    rowLabel: { ...typography.heading, color: colors.ink, fontSize: 16 },
    rowLabelDisabled: { color: colors.muted },
    rowSub: { ...typography.caption, color: colors.muted, marginTop: 4 }
  });
