import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CodeSlots } from '@/components/CodeSlots';
import { PressScale } from '@/components/PressScale';
import { auth } from '@/services/auth';
import { customerProfileReady, useSessionStore } from '@/store/useSessionStore';
import { fontFamily } from '@/constants/fonts';
import { lightColors, radii, spacing } from '@/constants/theme';

const accent = lightColors.accent;
const ink = lightColors.ink;
const muted = 'rgba(20,17,16,0.48)';
const line = 'rgba(20,17,16,0.10)';
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const partnerSiteUrl = (process.env.EXPO_PUBLIC_PARTNER_SITE_URL || 'https://www.cutly.buzz').replace(/\/$/, '');

type Mode = 'phone' | 'otp' | 'email';

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function toE164(local: string) {
  const d = digitsOnly(local).slice(0, 10);
  return d.length === 10 ? `+91${d}` : '';
}

export default function Auth() {
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const [mode, setMode] = useState<Mode>('phone');
  const [localPhone, setLocalPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 480, easing: easeOut, useNativeDriver: true }).start();
  }, [fade]);

  function afterAuth() {
    const session = useSessionStore.getState();
    if (!customerProfileReady(session)) {
      router.replace('/complete-profile');
      return;
    }
    router.replace('/(tabs)');
  }

  async function sendCode() {
    const phone = toE164(localPhone);
    if (!phone) {
      setError('Enter a 10-digit mobile number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await auth.sendOtp(phone);
      setMode('otp');
      setOtp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(code: string) {
    const phone = toE164(localPhone);
    if (!phone || code.length < 6) return;
    setBusy(true);
    setError('');
    try {
      await auth.verifyOtp(phone, code);
      afterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is incorrect.');
      setBusy(false);
    }
  }

  async function submitEmail() {
    if (!email.trim() || !password) {
      setError('Enter email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await auth.signIn(email.trim(), password);
      afterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  async function submitGoogle() {
    setBusy(true);
    setError('');
    try {
      const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId });
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken;
      if (!idToken) throw new Error('Google did not return a sign-in token.');
      await auth.google(idToken);
      afterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in needs a fresh Android build.');
      setBusy(false);
    }
  }

  function openPartnerSite() {
    void Linking.openURL(partnerSiteUrl);
  }

  function goPartnerSignIn() {
    useSessionStore.getState().setAudience('partner');
    router.push('/partner/auth');
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
          bounces={false}
        >
          <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
            <LinearGradient colors={['#FFE8E2', '#FFF7F4', '#FFFFFF']} style={StyleSheet.absoluteFill} />
            <View style={styles.mosaic}>
              <MosaicTile label="SALON" tone="#E8F4FF" />
              <MosaicTile label="SPA" tone="#F3EDE6" />
              <MosaicTile label="NAILS" tone="#FFE9F0" />
              <MosaicTile label="STUDIO" tone="#EAF8F0" />
            </View>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>CutLy</Text>
            </View>
          </View>

          <Animated.View
            style={[
              styles.form,
              {
                opacity: fade,
                transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }]
              }
            ]}
          >
            {mode === 'otp' ? (
              <>
                <Pressable
                  onPress={() => {
                    setMode('phone');
                    setOtp('');
                    setError('');
                  }}
                  hitSlop={10}
                  style={styles.backRow}
                >
                  <Ionicons name="chevron-back" size={24} color={ink} />
                  <Text style={styles.backText}>Change number</Text>
                </Pressable>
                <Text style={styles.title}>Enter the code</Text>
                <Text style={styles.lead}>Sent to +91 {digitsOnly(localPhone).slice(0, 10)}</Text>
                <CodeSlots
                  value={otp}
                  onChange={(next) => {
                    setOtp(next);
                    setError('');
                  }}
                  onComplete={(code) => void verifyCode(code)}
                  disabled={busy}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PressScale
                  style={[styles.cta, busy && styles.ctaDisabled]}
                  onPress={() => void verifyCode(otp)}
                  disabled={busy || otp.length < 6}
                  haptic
                >
                  <Text style={styles.ctaText}>{busy ? 'Verifying…' : 'Continue'}</Text>
                </PressScale>
                <Pressable onPress={() => void sendCode()} disabled={busy} style={styles.linkWrap}>
                  <Text style={styles.link}>Resend code</Text>
                </Pressable>
              </>
            ) : mode === 'email' ? (
              <>
                <Pressable
                  onPress={() => {
                    setMode('phone');
                    setError('');
                  }}
                  hitSlop={10}
                  style={styles.backRow}
                >
                  <Ionicons name="chevron-back" size={24} color={ink} />
                  <Text style={styles.backText}>Phone sign-in</Text>
                </Pressable>
                <Text style={styles.title}>Sign in with email</Text>
                <Text style={styles.lead}>Use the email and password on your account.</Text>
                <View style={styles.field}>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      setError('');
                    }}
                    placeholder="Email"
                    placeholderTextColor={muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.field}>
                  <TextInput
                    style={[styles.input, { paddingRight: 48 }]}
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      setError('');
                    }}
                    placeholder="Password"
                    placeholderTextColor={muted}
                    secureTextEntry={!showPw}
                  />
                  <Pressable style={styles.eye} onPress={() => setShowPw((s) => !s)} hitSlop={8}>
                    <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={muted} />
                  </Pressable>
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PressScale style={styles.cta} onPress={() => void submitEmail()} disabled={busy} haptic>
                  <Text style={styles.ctaText}>{busy ? 'Signing in…' : 'Continue'}</Text>
                </PressScale>
                <View style={styles.partnerBlock}>
                  <Text style={styles.partnerLabel}>For shops</Text>
                  <PressScale style={styles.secondary} onPress={openPartnerSite} haptic>
                    <Text style={styles.secondaryText}>Become a partner</Text>
                  </PressScale>
                  <PressScale style={styles.secondary} onPress={goPartnerSignIn} haptic>
                    <Text style={styles.secondaryText}>Already a partner</Text>
                  </PressScale>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.title}>Luxury you deserve</Text>
                <Text style={styles.lead}>Enter your mobile number to continue.</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.cc}>
                    <Text style={styles.flag}>🇮🇳</Text>
                    <Text style={styles.ccText}>+91</Text>
                  </View>
                  <View style={styles.phoneDivider} />
                  <TextInput
                    style={styles.phoneInput}
                    value={localPhone}
                    onChangeText={(v) => {
                      setLocalPhone(digitsOnly(v).slice(0, 10));
                      setError('');
                    }}
                    placeholder="9876543210"
                    placeholderTextColor={muted}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PressScale style={styles.cta} onPress={() => void sendCode()} disabled={busy} haptic>
                  <Text style={styles.ctaText}>{busy ? 'Sending…' : 'Continue'}</Text>
                </PressScale>
                <Text style={styles.legal}>
                  By continuing you agree to our Terms of Service and Privacy Policy
                </Text>

                <PressScale style={styles.secondary} onPress={() => setMode('email')} haptic>
                  <Ionicons name="mail-outline" size={18} color={ink} />
                  <Text style={styles.secondaryText}>Continue with email</Text>
                </PressScale>
                <PressScale style={styles.secondary} onPress={() => void submitGoogle()} disabled={busy} haptic>
                  <Ionicons name="logo-google" size={18} color={ink} />
                  <Text style={styles.secondaryText}>Continue with Google</Text>
                </PressScale>

                <View style={styles.partnerBlock}>
                  <Text style={styles.partnerLabel}>For shops</Text>
                  <PressScale style={styles.secondary} onPress={openPartnerSite} haptic>
                    <Text style={styles.secondaryText}>Become a partner</Text>
                  </PressScale>
                  <PressScale style={styles.secondary} onPress={goPartnerSignIn} haptic>
                    <Text style={styles.secondaryText}>Already a partner</Text>
                  </PressScale>
                </View>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function MosaicTile({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={[styles.tile, { backgroundColor: tone }]}>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1 },
  hero: {
    height: 280,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 28
  },
  mosaic: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 10,
    opacity: 0.95
  },
  tile: {
    width: '47%',
    height: 88,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tileLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 1.2,
    color: 'rgba(20,17,16,0.45)'
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  logoText: { fontFamily: fontFamily.bold, fontSize: 18, color: '#FFF' },
  form: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginLeft: -4, minHeight: 40 },
  backText: { fontFamily: fontFamily.medium, fontSize: 14, color: ink },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    color: ink,
    textAlign: 'center',
    marginTop: 4
  },
  lead: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: muted,
    textAlign: 'center',
    marginBottom: 4
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12
  },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  flag: { fontSize: 16 },
  ccText: { fontFamily: fontFamily.semibold, fontSize: 16, color: ink },
  phoneDivider: { width: 1, height: 22, backgroundColor: line, marginRight: 10 },
  phoneInput: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 17,
    color: ink,
    letterSpacing: 0.5
  },
  field: { position: 'relative' },
  input: {
    height: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    color: ink
  },
  eye: { position: 'absolute', right: 14, top: 18 },
  cta: {
    height: 54,
    borderRadius: radii.md,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 16, color: '#FFF' },
  legal: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: muted,
    textAlign: 'center',
    lineHeight: 18
  },
  secondary: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  secondaryText: { fontFamily: fontFamily.semibold, fontSize: 15, color: ink },
  partnerBlock: { marginTop: spacing.sm, gap: spacing.sm },
  partnerLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: muted,
    textAlign: 'center',
    marginBottom: 2
  },
  linkWrap: { alignItems: 'center', paddingVertical: 4 },
  link: { fontFamily: fontFamily.semibold, fontSize: 14, color: accent },
  error: { fontFamily: fontFamily.medium, fontSize: 13, color: lightColors.danger, textAlign: 'center' }
});
