import { useEffect, useLayoutEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sheetEase = Easing.bezier(0.32, 0.72, 0, 1);
const SHEET_TRAVEL = 640;

type Props = {
  shopId: string;
  shopName: string;
  visible: boolean;
  onClose: () => void;
};

/**
 * Timings bottom sheet. Uses progress translate (not Layout entering) so Android
 * cold-open does not let the shop sticky footer paint over the Modal.
 */
export function ShopHoursSheet({ shopId, shopName, visible, onClose }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(sheetStyles);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useSharedValue(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shop-hours', shopId],
    queryFn: () => api.shopHours(shopId),
    enabled: visible && Boolean(shopId)
  });

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

  const byWeekday = new Map((data?.days || []).map((d) => [d.weekday, d]));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Dismiss timings">
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Timings</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {shopName}
          </Text>
          {isLoading ? (
            <Text style={styles.muted}>Loading hours…</Text>
          ) : isError ? (
            <Text style={styles.muted}>Could not load hours.</Text>
          ) : (
            <View style={styles.list}>
              {DAY_LABELS.map((label, weekday) => {
                const row = byWeekday.get(weekday);
                const open = Boolean(row);
                return (
                  <View key={label} style={styles.row}>
                    <Text style={styles.day}>{label}</Text>
                    <Text style={[styles.hours, !open && styles.closed]}>
                      {open ? `${formatClock(row!.opensAt)} – ${formatClock(row!.closesAt)}` : 'Closed'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <PressScale style={styles.done} onPress={dismiss} haptic>
            <Text style={styles.doneText}>Done</Text>
          </PressScale>
        </Animated.View>
      </View>
    </Modal>
  );
}

function formatClock(hhmm: string) {
  const [hStr, mStr] = hhmm.split(':');
  let h = Number(hStr);
  const m = mStr || '00';
  const am = h < 12;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${am ? 'AM' : 'PM'}`;
}

function sheetStyles(colors: Palette) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(20,17,16,0.45)'
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      gap: spacing.sm,
      // Above shop sticky footer elevation on Android cold Modal open.
      elevation: 24,
      zIndex: 100,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 }
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      marginBottom: spacing.sm
    },
    title: { fontFamily: fontFamily.bold, fontSize: 20, color: colors.ink },
    sub: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.muted, marginBottom: spacing.sm },
    list: { gap: 2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    day: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.ink },
    hours: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.ink },
    closed: { color: colors.muted, fontFamily: fontFamily.regular },
    muted: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.muted, paddingVertical: spacing.lg },
    done: {
      marginTop: spacing.md,
      height: 52,
      borderRadius: radii.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    doneText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.white }
  });
}
