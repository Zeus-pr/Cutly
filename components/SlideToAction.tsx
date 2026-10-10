import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { radii, typography, type Palette } from '@/constants/theme';
import { useThemedStyles } from '@/store/useThemeStore';
import {
  SLIDE_COMPLETE_THRESHOLD,
  SLIDE_KNOB_SIZE,
  shouldCompleteSlide,
  slideFillFromTranslation,
  slideMaxTravel
} from '@/utils/slideAction';

type Props = {
  label: string;
  tone: 'accept' | 'reject';
  disabled?: boolean;
  onComplete: () => void;
  /** Parent should disable list scroll / nav swipe while true. */
  onDragChange?: (dragging: boolean) => void;
};

const TRACK_H = 52;

/**
 * Slide-to-confirm using RN PanResponder (not GestureDetector).
 * Captures the pan so FlatList / stack back-swipe cannot steal it.
 */
export function SlideToAction({ label, tone, disabled, onComplete, onDragChange }: Props) {
  const styles = useThemedStyles(slideStyles);
  const [trackWidth, setTrackWidth] = useState(280);
  const fill = useRef(new Animated.Value(0)).current;
  const fillRef = useRef(0);
  const completed = useRef(false);
  const dragging = useRef(false);
  const onDragChangeRef = useRef(onDragChange);
  onDragChangeRef.current = onDragChange;

  useEffect(() => {
    completed.current = false;
    fillRef.current = 0;
    fill.setValue(0);
  }, [label, fill]);

  function setDragging(next: boolean) {
    if (dragging.current === next) return;
    dragging.current = next;
    onDragChangeRef.current?.(next);
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Capture so parent FlatList / iOS back gesture cannot take the touch.
        onStartShouldSetPanResponder: () => !disabled,
        onStartShouldSetPanResponderCapture: () => !disabled,
        onMoveShouldSetPanResponder: (_, g) => !disabled && Math.abs(g.dx) > 2,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !disabled && Math.abs(g.dx) > 2 && Math.abs(g.dx) >= Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          if (disabled || completed.current) return;
          setDragging(true);
        },
        onPanResponderMove: (_, g) => {
          if (disabled || completed.current) return;
          const next = slideFillFromTranslation(g.dx, trackWidth, SLIDE_KNOB_SIZE);
          fillRef.current = next;
          fill.setValue(next);
        },
        onPanResponderRelease: () => {
          setDragging(false);
          if (disabled || completed.current) return;
          if (shouldCompleteSlide(fillRef.current, SLIDE_COMPLETE_THRESHOLD)) {
            completed.current = true;
            Animated.spring(fill, { toValue: 1, useNativeDriver: false, bounciness: 0 }).start(() => {
              void Haptics.notificationAsync(
                tone === 'accept'
                  ? Haptics.NotificationFeedbackType.Success
                  : Haptics.NotificationFeedbackType.Warning
              );
              onComplete();
            });
          } else {
            Animated.spring(fill, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
            fillRef.current = 0;
          }
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          if (completed.current) return;
          Animated.spring(fill, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
          fillRef.current = 0;
        }
      }),
    [disabled, fill, onComplete, tone, trackWidth]
  );

  const max = slideMaxTravel(trackWidth, SLIDE_KNOB_SIZE);
  const knobX = fill.interpolate({ inputRange: [0, 1], outputRange: [0, max] });
  const progressWidth = fill.interpolate({
    inputRange: [0, 1],
    outputRange: ['18%', '100%']
  });

  return (
    <View
      {...pan.panHandlers}
      style={[styles.track, tone === 'accept' ? styles.trackAccept : styles.trackReject, disabled && styles.disabled]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.progress,
          tone === 'accept' ? styles.progressAccept : styles.progressReject,
          { width: progressWidth }
        ]}
      />
      <Text style={styles.label} pointerEvents="none" numberOfLines={1}>
        {disabled ? '…' : label}
      </Text>
      <Animated.View
        pointerEvents="none"
        style={[styles.knob, tone === 'accept' ? styles.knobAccept : styles.knobReject, { transform: [{ translateX: knobX }] }]}
      >
        <Text style={styles.knobArrow}>››</Text>
      </Animated.View>
    </View>
  );
}

function slideStyles(colors: Palette) {
  return StyleSheet.create({
    track: {
      height: TRACK_H,
      borderRadius: radii.pill,
      overflow: 'hidden',
      justifyContent: 'center',
      borderWidth: 1,
      position: 'relative'
    },
    trackAccept: { backgroundColor: 'rgba(47,111,78,0.12)', borderColor: colors.success },
    trackReject: { backgroundColor: 'rgba(180,35,24,0.10)', borderColor: colors.danger },
    disabled: { opacity: 0.45 },
    progress: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radii.pill },
    progressAccept: { backgroundColor: 'rgba(47,111,78,0.28)' },
    progressReject: { backgroundColor: 'rgba(180,35,24,0.22)' },
    label: {
      ...typography.caption,
      color: colors.ink,
      fontWeight: '700',
      textAlign: 'center',
      letterSpacing: 0.3
    },
    knob: {
      position: 'absolute',
      left: 4,
      width: SLIDE_KNOB_SIZE,
      height: SLIDE_KNOB_SIZE,
      borderRadius: SLIDE_KNOB_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center'
    },
    knobAccept: { backgroundColor: colors.success },
    knobReject: { backgroundColor: colors.danger },
    knobArrow: { color: colors.white, fontWeight: '800', fontSize: 16 }
  });
}
