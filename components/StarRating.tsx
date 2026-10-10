import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/store/useThemeStore';

/**
 * Expo-safe star control (CJ-34).
 * Evaluated `expo-store-review` (App Store only — wrong) and `react-native-rating`
 * (compatible peers) — shipped Ionicons to avoid Expo Go gesture risk.
 */
export function StarRating({
  value,
  onChange,
  size = 32,
  editable = true
}: {
  value: number;
  onChange?: (next: number) => void;
  size?: number;
  editable?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.row} accessibilityRole={editable ? 'adjustable' : 'text'}>
      {[1, 2, 3, 4, 5].map((star) => {
        const on = star <= value;
        const icon = (
          <Ionicons name={on ? 'star' : 'star-outline'} size={size} color={on ? '#C48A12' : colors.muted} />
        );
        if (!editable || !onChange) {
          return <View key={star}>{icon}</View>;
        }
        return (
          <Pressable
            key={star}
            onPress={() => onChange(star)}
            hitSlop={8}
            accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
          >
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

export function StarRatingDisplay({ value, size = 14 }: { value: number; size?: number }) {
  return <StarRating value={Math.round(value)} size={size} editable={false} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 }
});
