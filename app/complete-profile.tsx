import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DateOfBirthField } from '@/components/DateOfBirthField';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { dropExpiredSession, refreshProfile, updateProfile } from '@/services/auth';
import { ensureLocationPermission, readCurrentPlace } from '@/services/device-location';
import { usePlaceStore } from '@/store/usePlaceStore';
import { customerProfileReady, useSessionStore } from '@/store/useSessionStore';
import { assertDateOfBirth } from '@/utils/dateOfBirth';
import { useColors, useThemeStore, useThemedStyles } from '@/store/useThemeStore';

const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'other', label: 'Other' },
  { id: 'prefer_not', label: 'Prefer not to say' }
] as const;

export default function CompleteProfile() {
  const colors = useColors();
  const dark = useThemeStore((state) => state.dark);
  const styles = useThemedStyles(formStyles);
  const savedName = useSessionStore((state) => state.name) || '';
  const savedGender = useSessionStore((state) => state.gender) || '';
  const [name, setName] = useState(savedName);
  const [gender, setGender] = useState<(typeof GENDERS)[number]['id'] | ''>(
    GENDERS.some((g) => g.id === savedGender) ? (savedGender as (typeof GENDERS)[number]['id']) : ''
  );
  const [dob, setDob] = useState('');
  const [invite, setInvite] = useState('');
  const [genderOpen, setGenderOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const genderLabel = GENDERS.find((g) => g.id === gender)?.label || 'Select gender';

  useEffect(() => {
    let live = true;
    void refreshProfile().then((result) => {
      if (!live) return;
      if (result === 'unauthorized') {
        dropExpiredSession();
        router.replace('/auth');
        return;
      }
      const session = useSessionStore.getState();
      if (customerProfileReady(session)) {
        router.replace('/(tabs)');
        return;
      }
      if (session.name?.trim()) setName(session.name);
      if (GENDERS.some((g) => g.id === session.gender)) {
        setGender(session.gender as (typeof GENDERS)[number]['id']);
      }
      if (session.dateOfBirth) setDob(session.dateOfBirth);
    });
    return () => {
      live = false;
    };
  }, []);

  const finish = useCallback(async () => {
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    if (!gender) {
      setError('Pick a gender.');
      return;
    }
    if (!dob) {
      setError('Pick your date of birth.');
      return;
    }
    try {
      assertDateOfBirth(dob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pick your date of birth.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateProfile({
        name: name.trim(),
        gender,
        dateOfBirth: dob,
        ...(invite.trim() ? { inviteCode: invite.trim() } : {})
      });
      const allowed = await ensureLocationPermission();
      if (allowed) {
        const place = await readCurrentPlace({ forceFresh: true });
        if (place !== 'denied' && place !== 'unavailable') {
          usePlaceStore.getState().select({ ...place, originKind: 'gps' });
        } else {
          usePlaceStore.getState().openSheet();
        }
      } else {
        usePlaceStore.getState().openSheet();
      }
      router.replace('/(tabs)');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save.';
      if (message === 'Sign in again.') {
        dropExpiredSession();
        router.replace('/auth');
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [dob, gender, invite, name]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>A few details so shops know who is arriving.</Text>

          <Field label="Full name" styles={styles}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
            />
          </Field>

          <Field label="Gender" styles={styles}>
            <PressScale style={styles.select} onPress={() => setGenderOpen(true)} haptic>
              <Text style={[styles.selectText, !gender && styles.placeholder]}>{genderLabel}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.muted} />
            </PressScale>
          </Field>

          <Field label="Date of birth" styles={styles}>
            <DateOfBirthField value={dob} onChange={setDob} />
          </Field>

          <Field label="Referral code (optional)" styles={styles}>
            <TextInput
              style={styles.input}
              value={invite}
              onChangeText={setInvite}
              placeholder="If you have one"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
            />
          </Field>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PressScale style={styles.cta} onPress={() => void finish()} disabled={busy} haptic>
            <Text style={styles.ctaText}>{busy ? 'Saving…' : 'Create account'}</Text>
          </PressScale>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={genderOpen} transparent animationType="fade" onRequestClose={() => setGenderOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setGenderOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Gender</Text>
            {GENDERS.map((g) => (
              <PressScale
                key={g.id}
                style={styles.sheetRow}
                onPress={() => {
                  setGender(g.id);
                  setGenderOpen(false);
                }}
                haptic
              >
                <Text style={styles.sheetRowText}>{g.label}</Text>
                {gender === g.id ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
              </PressScale>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
  styles
}: {
  label: string;
  children: ReactNode;
  styles: ReturnType<typeof formStyles>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function formStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
    title: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.ink },
    sub: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.muted, marginBottom: spacing.sm },
    field: { gap: 8 },
    label: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.muted },
    input: {
      height: 54,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.ink
    },
    select: {
      height: 54,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    selectText: { fontFamily: fontFamily.medium, fontSize: 16, color: colors.ink },
    placeholder: { color: colors.muted },
    error: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.danger },
    cta: {
      marginTop: spacing.md,
      height: 54,
      borderRadius: radii.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    ctaText: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.white },
    sheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(20,17,16,0.4)',
      justifyContent: 'flex-end'
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: 4
    },
    sheetTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.ink, marginBottom: spacing.sm },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    sheetRowText: { fontFamily: fontFamily.medium, fontSize: 16, color: colors.ink }
  });
}
