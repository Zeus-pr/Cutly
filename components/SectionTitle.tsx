import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, typography, type Palette } from '@/constants/theme';
import { useThemedStyles } from '@/store/useThemeStore';

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const styles = useThemedStyles(titleStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function titleStyles(colors: Palette) {
  return StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.title, fontSize: 22, color: colors.ink },
  action: { ...typography.body, color: colors.accent }
});
}
