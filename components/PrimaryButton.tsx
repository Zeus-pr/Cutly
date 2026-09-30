import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing } from '@/constants/theme';
export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && !disabled && { opacity: 0.82 }]}><Text style={styles.text}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ button: { height: 54, borderRadius: radii.md, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }, text: { color: colors.lime, fontSize: 15, fontWeight: '800' }, disabled: { opacity: 0.45 } });
