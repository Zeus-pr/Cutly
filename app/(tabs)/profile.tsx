import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '@/components/PrimaryButton';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemeStore, useThemedStyles } from '@/store/useThemeStore';
import { updateProfileName } from '@/services/auth';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useSessionStore } from '@/store/useSessionStore';

const preferences = [
  { label: 'Favourite shops', icon: 'heart-outline' as const },
  { label: 'Notifications', icon: 'notifications-outline' as const },
  { label: 'Help & support', icon: 'help-circle-outline' as const },
  { label: 'Privacy & terms', icon: 'shield-checkmark-outline' as const }
];

export default function Profile() {
  const colors = useColors();
  const dark = useThemeStore((state) => state.dark);
  const styles = useThemedStyles(profileStyles);
  const email = useSessionStore((state) => state.email);
  const phone = useSessionStore((state) => state.phone);
  const name = useSessionStore((state) => state.name);
  const display = name?.trim() || 'Add your name';
  const contact = email || phone || '';
  const initial = (name || email || phone || 'C').trim().charAt(0).toUpperCase();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function openEdit() {
    setDraft(name || '');
    setError('');
    setEditing(true);
  }

  async function saveName() {
    const next = draft.trim();
    if (!next) {
      setError('Enter your name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateProfileName(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroName}>{display}</Text>
            {contact ? <Text style={styles.heroSub}>{contact}</Text> : null}
            <Pressable onPress={openEdit} hitSlop={8}>
              <Text style={styles.edit}>Edit profile ›</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.shortcuts}>
          <Pressable style={styles.shortcut} onPress={() => router.push('/(tabs)/bookings')}>
            <Ionicons name="calendar-outline" size={22} color={colors.limeDark} />
            <Text style={styles.shortcutText}>Your bookings</Text>
          </Pressable>
          <Pressable style={styles.shortcut} onPress={() => usePlaceStore.getState().openSheet()}>
            <Ionicons name="location-outline" size={22} color={colors.limeDark} />
            <Text style={styles.shortcutText}>Saved locations</Text>
          </Pressable>
        </View>

        <Section title="Your preferences">
          <View style={styles.row}>
            <Ionicons name="moon-outline" size={20} color={colors.ink} />
            <Text style={styles.rowText}>Dark mode</Text>
            <Switch
              value={dark}
              onValueChange={(value) => useThemeStore.getState().setDark(value)}
              trackColor={{ false: '#D5D8D7', true: colors.accent }}
              thumbColor={colors.white}
              accessibilityLabel="Dark mode"
            />
          </View>
          {preferences.map((item, index) => (
            <Pressable key={item.label} style={[styles.row, index === preferences.length - 1 && styles.rowLast]}>
              <Ionicons name={item.icon} size={20} color={colors.ink} />
              <Text style={styles.rowText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </Section>

        <Section title="Account">
          <Pressable
            style={[styles.row, styles.rowLast]}
            onPress={() => {
              useSessionStore.getState().clear();
              router.replace('/welcome');
            }}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={[styles.rowText, styles.logout]}>Log out</Text>
          </Pressable>
        </Section>
      </ScrollView>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(false)}>
          <Pressable style={styles.dialog}>
            <Text style={styles.dialogTitle}>Your name</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Full name"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={() => void saveName()} />
          </Pressable>
        </Pressable>
      </Modal>
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
  edit: { color: colors.accent, marginTop: 6, fontSize: 14, fontWeight: '600' },
  shortcuts: { flexDirection: 'row', gap: 12, marginTop: spacing.md },
  shortcut: {
    flex: 1,
    minHeight: 84,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    justifyContent: 'center',
    gap: 8
  },
  shortcutText: { ...typography.heading, color: colors.ink, fontSize: 15 },
  section: { marginTop: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  mark: { width: 3, height: 18, borderRadius: 2, backgroundColor: colors.accent },
  sectionTitle: { ...typography.heading, color: colors.ink },
  group: { backgroundColor: colors.surface, borderRadius: radii.lg, overflow: 'hidden' },
  row: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { ...typography.body, color: colors.ink, flex: 1 },
  logout: { color: colors.danger, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(20,17,16,0.45)', justifyContent: 'center', padding: spacing.lg },
  dialog: { backgroundColor: colors.canvas, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
  dialogTitle: { ...typography.title, color: colors.ink },
  input: {
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 16
  },
  error: { color: colors.danger, ...typography.caption }
});
}
