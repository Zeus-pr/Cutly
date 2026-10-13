import { useState, type ComponentProps } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '@/components/PressScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenBack } from '@/components/ScreenBack';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { deleteAccount, updateProfile } from '@/services/auth';
import { appAlert, appConfirm } from '@/store/useDialogStore';
import { useColors, useThemeStore, useThemedStyles } from '@/store/useThemeStore';
import { useSessionStore } from '@/store/useSessionStore';

/** Same options as complete-profile. */
const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
  { id: 'prefer_not', label: 'Prefer not to say' }
] as const;

type GenderId = (typeof GENDERS)[number]['id'];

function genderLabelOf(id: string | null | undefined) {
  return GENDERS.find((g) => g.id === id)?.label || '';
}

type Ion = ComponentProps<typeof Ionicons>['name'];

type Row = { label: string; icon: Ion; onPress?: () => void; danger?: boolean };

export default function Profile() {
  const colors = useColors();
  const styles = useThemedStyles(profileStyles);
  const dark = useThemeStore((state) => state.dark);
  const email = useSessionStore((state) => state.email);
  const phone = useSessionStore((state) => state.phone);
  const name = useSessionStore((state) => state.name);
  const gender = useSessionStore((state) => state.gender);
  const display = name?.trim() || 'Add your name';
  const contact = phone || email || '';
  const version = Constants.expoConfig?.version || '1.0.0';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name || '');
  const [draftPhone, setDraftPhone] = useState(phone || '');
  const [draftGender, setDraftGender] = useState<GenderId | ''>((gender as GenderId) || '');
  const [genderOpen, setGenderOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  function openEdit() {
    setDraft(name || '');
    setDraftPhone(phone || '');
    setDraftGender((gender as GenderId) || '');
    setGenderOpen(false);
    setError('');
    setEditing(true);
  }

  async function saveName() {
    const next = draft.trim();
    const nextPhone = draftPhone.trim();
    if (!next) {
      setError('Enter your name.');
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(nextPhone)) {
      setError('Phone is required with country code, like +9198…');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateProfile({ name: next, phone: nextPhone, ...(draftGender ? { gender: draftGender } : {}) });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (deleting) return;
    appConfirm({
      title: 'Delete account?',
      message: 'This removes your login, bookings, and saved places. This cannot be undone.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Delete account',
      destructive: true,
      onConfirm: () => {
        void removeAccount();
      }
    });
  }

  async function removeAccount() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteAccount();
      useSessionStore.getState().clear();
      router.replace('/welcome');
    } catch (err) {
      appAlert('Could not delete', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function shareApp() {
    try {
      await Share.share({
        message: 'Book salons, spas and studios on CutLy. https://cutly.buzz'
      });
    } catch {
      /* dismissed */
    }
  }

  const shortcuts: Row[] = [
    { label: 'My Appointments', icon: 'calendar-outline', onPress: () => router.push('/(tabs)/bookings') },
    { label: 'Notifications', icon: 'notifications-outline', onPress: () => router.push('/notifications') },
    { label: 'My Favourites', icon: 'heart-outline', onPress: () => router.push('/favourites') }
  ];

  const spread: Row[] = [
    { label: 'Invite Friends & Family', icon: 'people-outline', onPress: () => void shareApp() },
    { label: 'Share App', icon: 'share-outline', onPress: () => void shareApp() }
  ];

  const more: Row[] = [
    {
      label: 'Contact Us',
      icon: 'logo-whatsapp',
      onPress: () => void Linking.openURL('https://wa.me/919000000000')
    },
    { label: "FAQ's", icon: 'information-circle-outline', onPress: () => router.push('/legal/faq') },
    { label: 'Terms & Conditions', icon: 'document-text-outline', onPress: () => router.push('/legal/terms') },
    { label: 'Privacy Policy', icon: 'shield-checkmark-outline', onPress: () => router.push('/legal/privacy') },
    {
      label: 'Delete account',
      icon: 'trash-outline',
      danger: true,
      onPress: confirmDelete
    },
    {
      label: 'Logout',
      icon: 'log-out-outline',
      danger: true,
      onPress: () => {
        useSessionStore.getState().clear();
        router.replace('/welcome');
      }
    }
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <ScreenBack />
        <Text style={styles.headerTitle}>My Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.profileCopy}>
              <Text style={styles.name}>{display.toUpperCase()}</Text>
              {contact ? <Text style={styles.phone}>{contact}</Text> : null}
              {genderLabelOf(gender) ? <Text style={styles.phone}>{genderLabelOf(gender)}</Text> : null}
              {!phone ? <Text style={styles.warn}>Add a phone number to book</Text> : null}
            </View>
            <PressScale onPress={openEdit} style={styles.editBtn} haptic>
              <Ionicons name="pencil" size={14} color={colors.accent} />
              <Text style={styles.editText}>EDIT</Text>
            </PressScale>
          </View>
        </View>

        <View style={styles.shortcutStack}>
          {shortcuts.map((row) => (
            <PressScale key={row.label} style={styles.shortcutCard} onPress={row.onPress} pressedScale={0.98} haptic>
              <Ionicons name={row.icon} size={22} color={colors.ink} />
              <Text style={styles.shortcutLabel}>{row.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </PressScale>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.group}>
            <View style={[styles.row, styles.rowLast]}>
              <Ionicons name={dark ? 'moon' : 'sunny-outline'} size={22} color={colors.ink} />
              <View style={styles.prefCopy}>
                <Text style={styles.rowText}>Dark / light mode</Text>
                <Text style={styles.prefHint}>{dark ? 'Dark' : 'Light'}</Text>
              </View>
              <Switch
                value={dark}
                onValueChange={(value) => useThemeStore.getState().setDark(value)}
                trackColor={{ false: '#D5D8D7', true: colors.accent }}
                thumbColor={colors.white}
                ios_backgroundColor="#D5D8D7"
                accessibilityLabel="Dark mode"
              />
            </View>
          </View>
        </View>

        <Section title="Spread the love" rows={spread} />
        <Section title="More" rows={more} />

        <Text style={styles.version}>App Version v{version}</Text>
      </ScrollView>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(false)}>
          <Pressable style={styles.dialog}>
            <Text style={styles.dialogTitle}>Edit profile</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Full name"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoFocus
            />
            <TextInput
              value={draftPhone}
              onChangeText={setDraftPhone}
              placeholder="Phone +9198XXXXXXXX"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <PressScale style={styles.select} onPress={() => setGenderOpen((v) => !v)} haptic>
              <Text style={[styles.selectText, !draftGender && styles.selectPlaceholder]}>
                {genderLabelOf(draftGender) || 'Select gender'}
              </Text>
              <Ionicons name={genderOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
            </PressScale>
            {genderOpen ? (
              <View style={styles.genderList}>
                {GENDERS.map((g, index) => (
                  <PressScale
                    key={g.id}
                    style={[styles.genderRow, index === GENDERS.length - 1 && styles.genderRowLast]}
                    onPress={() => {
                      setDraftGender(g.id);
                      setGenderOpen(false);
                    }}
                    haptic
                  >
                    <Text style={styles.genderRowText}>{g.label}</Text>
                    {draftGender === g.id ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                  </PressScale>
                ))}
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={() => void saveName()} />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const colors = useColors();
  const styles = useThemedStyles(profileStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>
        {rows.map((row, index) => (
          <PressScale
            key={row.label}
            style={[styles.row, index === rows.length - 1 && styles.rowLast]}
            onPress={row.onPress}
            pressedScale={0.98}
            haptic
          >
            <Ionicons name={row.icon} size={22} color={row.danger ? colors.danger : colors.ink} />
            <Text style={[styles.rowText, row.danger && styles.logout]}>{row.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </PressScale>
        ))}
      </View>
    </View>
  );
}

function profileStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: fontFamily.semibold,
      fontSize: 17,
      color: colors.ink
    },
    headerSpacer: { width: 36 },
    content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden'
    },
    profileTop: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      gap: spacing.sm
    },
    profileCopy: { flex: 1, gap: 4 },
    name: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.ink, letterSpacing: 0.4 },
    phone: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.muted },
    warn: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.accentDark },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    editText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.accent, letterSpacing: 0.6 },
    shortcutStack: { gap: spacing.sm },
    shortcutCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingVertical: 16
    },
    shortcutLabel: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    section: { gap: spacing.sm },
    sectionTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.ink, marginLeft: 2 },
    group: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden'
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    rowLast: { borderBottomWidth: 0 },
    rowText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 15, color: colors.ink },
    prefCopy: { flex: 1, gap: 2 },
    prefHint: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.muted },
    logout: { color: colors.danger },
    version: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center',
      marginTop: spacing.sm
    },
    backdrop: { flex: 1, backgroundColor: 'rgba(20,17,16,0.45)', justifyContent: 'center', padding: spacing.lg },
    dialog: { backgroundColor: colors.canvas, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md },
    dialogTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.ink },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.ink
    },
    select: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    selectText: { fontFamily: fontFamily.regular, fontSize: 16, color: colors.ink },
    selectPlaceholder: { color: colors.muted },
    genderList: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden'
    },
    genderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    genderRowLast: { borderBottomWidth: 0 },
    genderRowText: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.ink },
    error: { fontFamily: fontFamily.medium, color: colors.danger, fontSize: 13 }
  });
}
