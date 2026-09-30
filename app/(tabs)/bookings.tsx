import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/constants/theme';

export default function Bookings() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Bookings</Text>
        <View style={styles.empty}>
          <View style={styles.mark}>
            <Ionicons name="calendar-outline" size={28} color={colors.ink} />
          </View>
          <Text style={styles.heading}>No bookings yet</Text>
          <Text style={styles.body}>When you book a chair, it will show up here.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.md, flex: 1 },
  title: { ...typography.display, color: colors.ink },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  mark: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  heading: { ...typography.heading, color: colors.ink },
  body: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm, maxWidth: 260 }
});
