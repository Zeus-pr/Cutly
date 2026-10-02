import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { partnerApi } from '@/services/partner';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemeStore, useThemedStyles } from '@/store/useThemeStore';

const preferences = [
  { label: 'Shop features & photos', icon: 'images-outline' as const, action: 'details' as const },
  { label: 'Notifications', icon: 'notifications-outline' as const, action: null },
  { label: 'Help & support', icon: 'help-circle-outline' as const, action: null },
  { label: 'Privacy & terms', icon: 'shield-checkmark-outline' as const, action: null }
];

export default function PartnerProfile() {
  const colors = useColors();
  const dark = useThemeStore((state) => state.dark);
  const styles = useThemedStyles(profileStyles);
  const email = useSessionStore((state) => state.email);
  const name = useSessionStore((state) => state.name);
  const display = name?.trim() || 'Partner';
  const contact = email || '';
  const initial = (name || email || 'P').trim().charAt(0).toUpperCase();
  const [deleting, setDeleting] = useState(false);

  function confirmDelete() {
    Alert.alert(
      'Delete partner account?',
      'This removes your shop, bookings, photos, and login. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            void removeAccount();
          }
        }
      ]
    );
  }

  async function removeAccount() {
    if (deleting) return;
    setDeleting(true);
    try {
      await partnerApi.deleteAccount();
      useSessionStore.getState().clearPartner();
      router.replace('/role');
    } catch (err) {
      Alert.alert('Could not delete', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroName}>{display}</Text>
            {contact ? <Text style={styles.heroSub}>{contact}</Text> : null}
            <Text style={styles.heroTag}>CUTLY partner</Text>
          </View>
        </View>

        <View style={styles.shortcuts}>
          <Pressable style={styles.shortcut} onPress={() => router.push('/partner/(tabs)/floor')}>
            <Ionicons name="grid-outline" size={22} color={colors.limeDark} />
            <Text style={styles.shortcutText}>Today’s floor</Text>
          </Pressable>
          <Pressable style={styles.shortcut} onPress={() => router.push('/partner/details')}>
            <Ionicons name="storefront-outline" size={22} color={colors.limeDark} />
            <Text style={styles.shortcutText}>Shop details</Text>
          </Pressable>
        </View>

        <Section title="Your preferences">
          <View style={styles.row}>
            <Ionicons name={dark ? 'moon' : 'sunny-outline'} size={20} color={colors.ink} />
            <View style={styles.rowCopy}>
              <Text style={styles.rowText}>Dark / light mode</Text>
              <Text style={styles.rowHint}>{dark ? 'Dark' : 'Light'}</Text>
            </View>
            <Switch
              value={dark}
              onValueChange={(value) => useThemeStore.getState().setDark(value)}
              trackColor={{ false: '#D5D8D7', true: colors.accent }}
              thumbColor={colors.white}
              accessibilityLabel="Dark mode"
            />
          </View>
          {preferences.map((item, index) => (
            <Pressable
              key={item.label}
              style={[styles.row, index === preferences.length - 1 && styles.rowLast]}
              onPress={() => {
                if (item.action === 'details') router.push('/partner/details');
              }}
            >
              <Ionicons name={item.icon} size={20} color={colors.ink} />
              <Text style={styles.rowText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </Section>

        <Section title="Account">
          <Pressable
            style={styles.row}
            onPress={() => {
              useSessionStore.getState().clearPartner();
              router.replace('/role');
            }}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.rowText, styles.logout]}>Log out</Text>
          </Pressable>
          <Pressable style={[styles.row, styles.rowLast]} onPress={confirmDelete} disabled={deleting}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.rowText, styles.logout]}>{deleting ? 'Deleting…' : 'Delete profile'}</Text>
          </Pressable>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const styles = useThemedStyles(profileStyles);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.mark} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function profileStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.md, paddingBottom: 120 },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: '#141110',
      borderRadius: radii.lg,
      padding: spacing.md
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#F3E6C4',
      alignItems: 'center',
      justifyContent: 'center'
    },
    avatarText: { color: '#141110', fontSize: 26, fontWeight: '700' },
    heroCopy: { flex: 1 },
    heroName: { color: colors.white, fontSize: 22, fontWeight: '700' },
    heroSub: { color: 'rgba(255,255,255,0.72)', marginTop: 2, fontSize: 14 },
    heroTag: { color: colors.accent, marginTop: 6, fontSize: 13, fontWeight: '600' },
    shortcuts: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    shortcut: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      gap: 8
    },
    shortcutText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
    section: { marginTop: spacing.lg },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
    mark: { width: 4, height: 16, borderRadius: 2, backgroundColor: colors.accent },
    sectionTitle: { ...typography.heading, color: colors.ink },
    group: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    rowLast: { borderBottomWidth: 0 },
    rowCopy: { flex: 1 },
    rowText: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '500' },
    rowHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
    logout: { color: colors.danger, fontWeight: '600' }
  });
}
