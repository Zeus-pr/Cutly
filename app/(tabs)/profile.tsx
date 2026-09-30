import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { useSessionStore } from '@/store/useSessionStore';

const rows = ['Favourite shops', 'Saved locations', 'Notifications', 'Help & support', 'Privacy & terms'];

export default function Profile() {
  const email = useSessionStore((state) => state.email);
  const phone = useSessionStore((state) => state.phone);
  const identity = email || phone || 'CUTLY customer';
  const initial = identity.trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.name}>CUTLY customer</Text>
            <Text style={styles.phone}>{identity}</Text>
          </View>
        </View>
        <View style={styles.group}>
          {rows.map((item, index) => (
            <Pressable key={item} style={[styles.item, index === rows.length - 1 && styles.itemLast]}>
              <Text style={styles.itemText}>{item}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.logout}
          onPress={() => {
            useSessionStore.getState().clear();
            router.replace('/auth');
          }}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.md },
  title: { ...typography.display, color: colors.ink },
  profile: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '600' },
  identity: { flex: 1 },
  name: { ...typography.heading, color: colors.ink },
  phone: { ...typography.body, color: colors.muted, marginTop: 2 },
  group: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
  item: { minHeight: 52, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemLast: { borderBottomWidth: 0 },
  itemText: { ...typography.body, color: colors.ink },
  logout: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.lg, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  logoutText: { ...typography.body, color: colors.danger, fontWeight: '600' }
});
