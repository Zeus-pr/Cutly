import { useEffect, useLayoutEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

const STEPS = [
  { title: 'Step 1', body: 'Book your appointment in CutLy.' },
  { title: 'Step 2', body: 'Visit the shop and take your service.' },
  { title: 'Step 3', body: 'Pay the bill in CutLy after the service, from your visit.' }
];

const sheetEase = Easing.bezier(0.32, 0.72, 0, 1);
const SHEET_TRAVEL = 560;

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** How to pay. Explains the visit flow. Charging still happens on the visit. */
export function PayBillSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(sheetStyles);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 280, easing: sheetEase });
  }, [visible, progress, reduceMotion]);

  function finishClose() {
    progress.value = 0;
    onClose();
  }

  function dismiss() {
    if (reduceMotion) {
      finishClose();
      return;
    }
    progress.value = withTiming(0, { duration: 220, easing: sheetEase }, (finished) => {
      if (finished) scheduleOnRN(finishClose);
    });
  }

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SHEET_TRAVEL }]
  }));

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close">
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <Pressable style={styles.close} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>How to pay with CutLy</Text>
          <View style={styles.list}>
            {STEPS.map((step) => (
              <View key={step.title} style={styles.card}>
                <Text style={styles.step}>{step.title}</Text>
                <Text style={styles.body}>{step.body}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function sheetStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)' },
    sheet: {
      backgroundColor: colors.canvas,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md
    },
    close: {
      alignSelf: 'center',
      width: 44,
      height: 44,
      borderRadius: 22,
      marginTop: -36,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 22,
      lineHeight: 28,
      textAlign: 'center',
      color: colors.ink
    },
    list: { gap: 12 },
    card: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      gap: 6
    },
    step: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.accent },
    body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 22, color: colors.ink }
  });
}
