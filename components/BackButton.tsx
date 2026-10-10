import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

type Props = {
  onPress?: () => void;
  label?: string;
  accessibilityLabel?: string;
};

/** Bare chevron back (no pill / border) with an optional text label. */
export function BackButton({ onPress, label = 'Back', accessibilityLabel }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(backStyles);

  return (
    <Pressable
      onPress={onPress || (() => (router.canGoBack() ? router.back() : undefined))}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label || 'Back'}
      style={styles.hit}
    >
      <Ionicons name="chevron-back" size={24} color={colors.ink} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

function backStyles(colors: Palette) {
  return StyleSheet.create({
    hit: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: -4,
      paddingRight: 2,
      minHeight: 40,
      minWidth: 40,
      justifyContent: 'center'
    },
    label: {
      ...typography.caption,
      fontWeight: '600',
      color: colors.ink
    }
  });
}
