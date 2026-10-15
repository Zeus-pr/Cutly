import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CodeSlots } from '@/components/CodeSlots';
import { PressScale } from '@/components/PressScale';
import { CutlyLogo } from '@/components/CutlyLogo';
import { EmailCodeStep } from '@/components/EmailCodeStep';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import { auth, save } from '@/services/auth';
import { emailVerify } from '@/services/emailVerify';
import { useColors, useThemeStore } from '@/store/useThemeStore';
import { ApiError } from '@/utils/deleteFlow';
import { SEND_FAILED_COPY, resumablePending, type SignupStarted } from '@/utils/emailVerifyFlow';
import { customerProfileReady, useSessionStore } from '@/store/useSessionStore';
import { fontFamily } from '@/constants/fonts';
import { lightColors, radii, spacing } from '@/constants/theme';

const accent = lightColors.accent;
const ink = lightColors.ink;
const muted = 'rgba(20,17,16,0.48)';
const line = 'rgba(20,17,16,0.10)';
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const partnerSiteUrl = (process.env.EXPO_PUBLIC_PARTNER_SITE_URL || 'https://www.cutly.buzz').replace(/\/$/, '');

type Mode = 'phone' | 'otp' | 'email' | 'signup' | 'signupCode' | 'verified';

const SIGNIN_CAT = require('@/assets/animations/signin-cat.json');
const PHOTOS = {
  hair: require('@/assets/home-photos/hair.jpg'),
  spa: require('@/assets/home-photos/self-care-spa.jpg'),
  wellness: require('@/assets/home-photos/wellness.jpg'),
  tattoo: require('@/assets/home-photos/tattoo.jpg')
};
/** T4 spec 03: resume the code step for 30 min if the app is killed. */
const PENDING_KEY = 'cutly.pendingSignup';

async function clearSavedPending() {
  await SecureStore.deleteItemAsync(PENDING_KEY).catch(() => undefined);
}

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
  const [pending, setPending] = useState<SignupStarted | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const dark = useThemeStore((state) => state.dark);
  const themed = useColors();
  const reduceMotion = useReducedMotion();
  // Spec §4: pause the cat when the screen blurs.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const catRef = useRef<LottieView>(null);
  useEffect(() => {
    if (reduceMotion) return;
    if (focused) catRef.current?.play();
    else catRef.current?.pause();
  }, [focused, reduceMotion]);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 480, easing: easeOut, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    void SecureStore.getItemAsync(PENDING_KEY).then((raw) => {
      const saved = resumablePending(raw);
      if (!saved) {
        if (raw) {
          void clearSavedPending();
          setMode('signup');
          setError('Your code request expired. Send a new one.');
        }
        return;
      }
      setEmail(saved.email);
      setPending({ pendingId: saved.pendingId, maskedEmail: saved.maskedEmail, resendInSec: 0, expiresInSec: 600 });
      setMode('signupCode');
    });
  }, []);

  function openSignup() {
    setError('');
    setMode('signup');
  }

  async function startSignup() {
    const phone = toE164(localPhone);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    if (!phone) {
      setError('Enter a 10-digit mobile number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await emailVerify.startSignup({ email: email.trim(), password, phone });
      if ('token' in result) {
        // Old API (SIGNUP_EMAIL_VERIFY=off): one-step session, email stays unverified.
        save(result as Parameters<typeof save>[0]);
        afterAuth();
        return;
      }
      setPending(result);
      await SecureStore.setItemAsync(
        PENDING_KEY,
        JSON.stringify({ pendingId: result.pendingId, maskedEmail: result.maskedEmail, email: email.trim(), savedAt: Date.now() })
      ).catch(() => undefined);
      setMode('signupCode');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_UNAVAILABLE') setError(SEND_FAILED_COPY);
      else if (err instanceof ApiError && err.status === 429) setError(err.message);
      else setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function verifySignup(code: string) {
    if (!pending) return;
    const session = await emailVerify.verifySignup(pending.pendingId, code);
    save(session as Parameters<typeof save>[0]);
    await clearSavedPending();
    setVerifiedEmail(String(session.user.email || email.trim().toLowerCase()));
    setMode('verified');
  }

  function afterAuth() {
    const session = useSessionStore.getState();
    // #46 C9: SessionGate (app/_layout.tsx) owns the /account/restored redirect.
    if (session.restoredNotice === 'customer') return;
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
    <View style={[styles.root, dark && { backgroundColor: themed.canvas }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.glow} pointerEvents="none" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 28 }]}
          bounces={false}
        >
          {mode === 'phone' ? (
            <View style={[styles.brandRow, { paddingTop: insets.top + 12 }]}>
              <View style={styles.brandLeft}>
                <View style={styles.logoBadge}>
                  <CutlyLogo width={56} rounded={0} markOnly />
                </View>
                <Text style={styles.categories}>Hair · Wellness · Tattoo · Piercing · And more</Text>
              </View>
              <View style={styles.collage} accessible={false} importantForAccessibility="no-hide-descendants">
                <View style={styles.collageCol}>
                  <Image source={PHOTOS.hair} style={[styles.tile, styles.tileTall, { borderTopLeftRadius: 4 }]} contentFit="cover" accessible={false} />
                  <Image source={PHOTOS.wellness} style={[styles.tile, styles.tileShort, { borderBottomRightRadius: 4 }]} contentFit="cover" accessible={false} />
                </View>
                <View style={[styles.collageCol, { marginTop: 24 }]}>
                  <Image source={PHOTOS.spa} style={[styles.tile, styles.tileShort, { borderTopRightRadius: 4 }]} contentFit="cover" accessible={false} />
                  <Image source={PHOTOS.tattoo} style={[styles.tile, styles.tileShort, { borderBottomLeftRadius: 4 }]} contentFit="cover" accessible={false} />
                </View>
              </View>
            </View>
          ) : (
            <View style={{ height: insets.top + 12 }} />
          )}

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
                <Text style={styles.title} accessibilityRole="header">Enter the code</Text>
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
                <Text style={styles.title} accessibilityRole="header">Sign in with email</Text>
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
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <PasswordInput value={password} onChange={setPassword} show={showPw} toggle={() => setShowPw((v) => !v)} onEdit={() => setError('')} />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PressScale style={styles.cta} onPress={() => void submitEmail()} disabled={busy} haptic>
                  <Text style={styles.ctaText}>{busy ? 'Signing in…' : 'Continue'}</Text>
                </PressScale>
                <PressScale style={styles.linkWrap} onPress={openSignup} haptic accessibilityRole="link">
                  <Text style={styles.link}>New here? Create an account</Text>
                </PressScale>
                <PartnerBlock onSite={openPartnerSite} onSignIn={goPartnerSignIn} />
              </>
            ) : mode === 'signup' ? (
              <>
                <Pressable onPress={() => { setMode('email'); setError(''); }} hitSlop={10} style={styles.backRow}>
                  <Ionicons name="chevron-back" size={24} color={ink} />
                  <Text style={styles.backText}>Email sign-in</Text>
                </Pressable>
                <Text style={styles.title} accessibilityRole="header">Create your account</Text>
                <Text style={styles.lead}>We'll email you a code to confirm the address.</Text>
                <View style={styles.field}>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      setError('');
                      setPending(null); // §7: editing the email drops the old pendingId
                    }}
                    placeholder="Email"
                    placeholderTextColor={muted}
                    keyboardType="email-address"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <PasswordInput value={password} onChange={setPassword} show={showPw} toggle={() => setShowPw((v) => !v)} onEdit={() => setError('')} />
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
                    placeholder="Enter your mobile number"
                    placeholderTextColor={muted}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
                {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
                <PressScale style={[styles.cta, busy && styles.ctaDisabled]} onPress={() => void startSignup()} disabled={busy} haptic>
                  <Text style={styles.ctaText}>{busy ? 'Sending…' : 'Send code'}</Text>
                </PressScale>
                <Legal />
              </>
            ) : mode === 'signupCode' && pending ? (
              <EmailCodeStep
                key={pending.pendingId}
                maskedEmail={pending.maskedEmail}
                backLabel="Change email"
                onBack={() => { setMode('signup'); setError(''); }}
                resendInSec={pending.resendInSec}
                verify={verifySignup}
                resend={async () => {
                  const sent = await emailVerify.resendSignup(pending.pendingId);
                  return { resendInSec: sent.resendInSec };
                }}
                onOutcome={(outcome) => {
                  if (outcome.kind === 'restart' || outcome.kind === 'taken') {
                    void clearSavedPending();
                    setPending(null);
                    setMode('signup');
                    setError(outcome.message);
                    return true;
                  }
                  return false;
                }}
              />
            ) : mode === 'verified' ? (
              <>
                <SuccessOverlay visible label="Email verified" onDone={() => undefined} />
                <Text style={[styles.title, { marginTop: 160 }]} accessibilityRole="header">Email verified</Text>
                <Text style={styles.lead}>{verifiedEmail} is confirmed. Let's finish your profile.</Text>
                <PressScale style={styles.cta} onPress={afterAuth} haptic>
                  <Text style={styles.ctaText}>Continue</Text>
                </PressScale>
              </>
            ) : (
              <>
                <Text style={styles.headline} accessibilityRole="header">{'Luxury\nyou deserve.'}</Text>
                <Text style={styles.sub}>
                  Book top salons, wellness centres, tattoo studios, piercing experts and more, all in one place.
                </Text>
                <View style={styles.catWrap} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
                  <LottieView
                    ref={catRef}
                    source={SIGNIN_CAT}
                    autoPlay={!reduceMotion && focused}
                    loop
                    progress={reduceMotion ? 0 : undefined}
                    resizeMode="contain"
                    style={{ width: 112, height: 80 }}
                  />
                </View>
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
                    placeholder="Enter your mobile number"
                    placeholderTextColor={muted}
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                </View>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <PressScale style={styles.cta} onPress={() => void sendCode()} disabled={busy} haptic>
                  <Text style={styles.ctaText}>{busy ? 'Sending…' : 'Continue'}</Text>
                </PressScale>
                <Legal />
                <View style={styles.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>OR</Text>
                  <View style={styles.orLine} />
                </View>
                <PressScale style={styles.methodRow} onPress={() => setMode('email')} haptic>
                  <Ionicons name="mail-outline" size={20} color={ink} />
                  <Text style={styles.methodText}>Continue with email</Text>
                  <Ionicons name="chevron-forward" size={16} color={muted} />
                </PressScale>
                <PressScale style={styles.methodRow} onPress={() => void submitGoogle()} disabled={busy} haptic>
                  <Ionicons name="logo-google" size={20} color={ink} />
                  <Text style={styles.methodText}>Continue with Google</Text>
                  <Ionicons name="chevron-forward" size={16} color={muted} />
                </PressScale>
                <PartnerBlock onSite={openPartnerSite} onSignIn={goPartnerSignIn} />
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Legal() {
  return (
    <Text style={styles.legal}>
      By continuing you agree to our{' '}
      <Text style={styles.legalLink} accessibilityRole="link" onPress={() => router.push('/legal/terms')}>
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text style={styles.legalLink} accessibilityRole="link" onPress={() => router.push('/legal/privacy')}>
        Privacy Policy
      </Text>
    </Text>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  toggle,
  onEdit
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
  onEdit: () => void;
}) {
  // #52 lesson: icon in a relative row, centred vertically, so web and native agree.
  return (
    <View style={styles.pwRow}>
      <TextInput
        style={[styles.input, { flex: 1, paddingRight: 52 }]}
        value={value}
        onChangeText={(v) => {
          onChange(v);
          onEdit();
        }}
        placeholder="Password"
        placeholderTextColor={muted}
        secureTextEntry={!show}
        autoComplete="password"
      />
      <View style={styles.eyeSlot}>
        <PressScale style={styles.eye} onPress={toggle} accessibilityLabel={show ? 'Hide password' : 'Show password'} haptic>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={muted} />
        </PressScale>
      </View>
    </View>
  );
}

function PartnerBlock({ onSite, onSignIn }: { onSite: () => void; onSignIn: () => void }) {
  return (
    <View style={styles.partnerBlock}>
      <View style={styles.hairline} />
      <Text style={styles.partnerLabel}>For business partners</Text>
      <View style={styles.partnerCards}>
        <PressScale style={[styles.partnerCard, styles.partnerCardSand]} onPress={onSite} haptic>
          <Ionicons name="storefront-outline" size={18} color={ink} />
          <Text style={styles.partnerCardText}>Become a partner</Text>
        </PressScale>
        <PressScale style={[styles.partnerCard, styles.partnerCardOutline]} onPress={onSignIn} haptic>
          <Ionicons name="person-circle-outline" size={18} color={ink} />
          <Text style={styles.partnerCardText}>Partner sign in</Text>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1 },
  glow: { position: 'absolute', top: -60, left: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: accent, opacity: 0.07 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: spacing.lg },
  brandLeft: { gap: 10, maxWidth: 150 },
  logoBadge: { width: 64, height: 64, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  categories: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 16, color: muted },
  collage: { width: 150, height: 170, flexDirection: 'row', gap: 6, marginRight: -8 },
  collageCol: { flex: 1, gap: 6 },
  tile: { width: '100%', borderRadius: 20, overflow: 'hidden' },
  tileTall: { height: 96 },
  tileShort: { height: 64 },
  headline: { fontFamily: fontFamily.bold, fontSize: 34, lineHeight: 38, letterSpacing: -0.6, color: ink, marginTop: 8 },
  sub: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, color: muted, marginTop: -8 },
  catWrap: { alignSelf: 'flex-end', marginRight: 20, zIndex: 1, marginTop: -8, marginBottom: -16 },
  form: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginLeft: -4, minHeight: 44 },
  backText: { fontFamily: fontFamily.medium, fontSize: 14, color: ink },
  title: { fontFamily: fontFamily.bold, fontSize: 26, color: ink, textAlign: 'center', marginTop: 4 },
  lead: { fontFamily: fontFamily.regular, fontSize: 14, color: muted, textAlign: 'center', marginBottom: 4 },
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
  phoneInput: { flex: 1, fontFamily: fontFamily.medium, fontSize: 16, color: ink, letterSpacing: 0.3 },
  field: { position: 'relative' },
  pwRow: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  eyeSlot: { position: 'absolute', top: 0, bottom: 0, right: 4, justifyContent: 'center' },
  eye: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  cta: { height: 54, borderRadius: radii.md, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 16, color: '#FFF' },
  legal: { fontFamily: fontFamily.regular, fontSize: 12, color: muted, textAlign: 'center', lineHeight: 18 },
  legalLink: { textDecorationLine: 'underline' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: line },
  orText: { fontFamily: fontFamily.medium, fontSize: 12, letterSpacing: 1, color: muted },
  methodRow: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: line,
    backgroundColor: '#FFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12
  },
  methodText: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 15, color: ink },
  partnerBlock: { marginTop: spacing.xs, gap: spacing.sm },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: line },
  partnerLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: muted,
    textAlign: 'center',
    marginTop: 4
  },
  partnerCards: { flexDirection: 'row', gap: 10 },
  partnerCard: { flex: 1, height: 52, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  partnerCardSand: { backgroundColor: lightColors.sand },
  partnerCardOutline: { borderWidth: 1, borderColor: line, backgroundColor: '#FFF' },
  partnerCardText: { fontFamily: fontFamily.semibold, fontSize: 14, color: ink },
  linkWrap: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  link: { fontFamily: fontFamily.semibold, fontSize: 14, color: accent },
  error: { fontFamily: fontFamily.medium, fontSize: 13, color: lightColors.danger, textAlign: 'center' }
});
