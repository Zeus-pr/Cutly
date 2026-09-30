import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii } from '@/constants/theme';

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22
  },
  text: { color: colors.white, fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.82 }
});
