import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/constants/theme';
export function SectionTitle({ title, action }: { title: string; action?: string }) { return <View style={styles.row}><Text style={styles.title}>{title}</Text>{action && <Text style={styles.action}>{action}</Text>}</View>; }
const styles = StyleSheet.create({ row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }, title: { ...typography.heading, color: colors.ink }, action: { ...typography.caption, color: colors.orange } });
