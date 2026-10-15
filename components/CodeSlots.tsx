import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputKeyPressEvent
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

type Props = {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Coral digit + ring when filled (Floor visit PIN). */
  accentDigits?: boolean;
  /** Screen-reader label for the hidden input. */
  accessibilityLabel?: string;
};

/**
 * RN port of reactbits CodeSlots — springy digit boxes for OTP / visit PIN.
 * https://reactbits.dev/r/CodeSlots-JS-TW
 */
export function CodeSlots({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus = true,
  disabled,
  accentDigits = false,
  accessibilityLabel = 'Verification code'
}: Props) {
  const colors = useColors();
  const styles = useThemedStyles(slotStyles);
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, '').slice(0, length).split('');

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (digits.length === length) onComplete?.(digits.join(''));
  }, [digits, length, onComplete]);

  function setCode(raw: string) {
    onChange(raw.replace(/\D/g, '').slice(0, length));
  }

  function onKeyPress(e: TextInputKeyPressEvent) {
    if (e.nativeEvent.key === 'Backspace' && !digits.length) return;
  }

  return (
    <Pressable
      style={styles.wrap}
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="none"
      disabled={disabled}
    >
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => (
          <Slot
            key={i}
            digit={digits[i] || ''}
            active={focused && (digits.length === i || (digits.length === length && i === length - 1))}
            filled={Boolean(digits[i])}
            accentDigits={accentDigits}
            colors={colors}
            styles={styles}
          />
        ))}
      </View>
      <TextInput
        ref={inputRef}
        value={digits.join('')}
        onChangeText={setCode}
        onKeyPress={onKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        caretHidden
        editable={!disabled}
        style={styles.ghost}
        accessibilityLabel={accessibilityLabel}
      />
    </Pressable>
  );
}

function Slot({
  digit,
  active,
  filled,
  accentDigits,
  colors,
  styles
}: {
  digit: string;
  active: boolean;
  filled: boolean;
  accentDigits: boolean;
  colors: Palette;
  styles: ReturnType<typeof slotStyles>;
}) {
  const scale = useSharedValue(1);
  const border = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    border.value = withTiming(active || (accentDigits && filled) ? 1 : 0, { duration: 160 });
    if (filled) {
      scale.value = withSpring(1.08, { damping: 12, stiffness: 280 }, () => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      });
    }
  }, [active, filled, accentDigits, border, scale]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: border.value > 0.5 ? colors.accent : colors.line
  }));

  return (
    <Animated.View style={[styles.slot, anim, filled && styles.slotFilled]}>
      <Text style={[styles.digit, accentDigits && filled && styles.digitAccent]}>{digit}</Text>
    </Animated.View>
  );
}

function slotStyles(colors: Palette) {
  return StyleSheet.create({
    wrap: { position: 'relative' },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm
    },
    slot: {
      flex: 1,
      aspectRatio: 0.85,
      maxWidth: 52,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center'
    },
    slotFilled: {
      backgroundColor: colors.canvas
    },
    digit: {
      fontFamily: fontFamily.bold,
      fontSize: 24,
      color: colors.ink,
      fontVariant: ['tabular-nums']
    },
    digitAccent: {
      color: colors.accent
    },
    ghost: {
      ...StyleSheet.absoluteFill,
      opacity: 0.02,
      color: colors.ink
    }
  });
}
