import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from '@/store/useThemeStore';

type Props = {
  onPress?: () => void;
  /** Override chevron colour (e.g. white over a photo). */
  color?: string;
  size?: number;
  /** Sitting on a photo: white chevron with a soft shadow — still no filled circle. */
  onPhoto?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Bare chevron back — no circle / border / fill. Same hit area + position on every screen. */
export function ScreenBack({ onPress, color, size = 24, onPhoto, style, accessibilityLabel = 'Back' }: Props) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress || (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')))}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.hit, style]}
    >
      <Ionicons
        name="chevron-back"
        size={size}
        color={onPhoto ? '#FFFFFF' : color || colors.ink}
        style={onPhoto ? styles.photoShadow : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    marginLeft: -4,
    paddingRight: 2,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  photoShadow: {
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4
  }
});
