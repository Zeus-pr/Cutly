import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CutlyLogo } from '@/components/CutlyLogo';
import { auth } from '@/services/auth';
import { useSessionStore } from '@/store/useSessionStore';

const teal = '#0EC9A5';
const surface = '#FFFFFF';
const card = '#F6F6F6';
const ink = '#141110';
const muted = 'rgba(20,17,16,0.48)';
const soft = 'rgba(20,17,16,0.72)';
const line = 'rgba(20,17,16,0.10)';
const icon = 'rgba(20,17,16,0.40)';
const display = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

export default function Auth() {
  const fades = useRef([0, 1, 2, 3, 4, 5, 6].map(() => new Animated.Value(0))).current;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Login fades={fades} />
    </View>
  );
}

function fadeStyle(value: Animated.Value) {
  return {
    opacity: value,
    transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }]
  };
}

function Login({ fades }: { fades: Animated.Value[] }) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    Animated.stagger(
      60,
      fades.map((value) => Animated.timing(value, { toValue: 1, duration: 500, easing: easeOut, useNativeDriver: true }))
    ).start();
  }, [fades]);
  const [mode, setMode] = useState<'signin' | 'signup' | 'phone' | 'code'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | 'phone' | 'code' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitEmail() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') await auth.signUp(email.trim(), password);
      else await auth.signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPhone() {
    setBusy(true);
    try {
      if (mode === 'phone') {
        await auth.sendOtp(phone.trim());
        setMode('code');
        setError('');
      } else {
        await auth.verifyOtp(phone.trim(), code.trim());
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Phone sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function submitGoogle() {
    setBusy(true);
    try {
      const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId });
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken;
      if (!idToken) throw new Error('Google did not return a sign-in token.');
      await auth.google(idToken);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in needs a fresh Android build.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.login} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.accent} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.loginContent, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 28 }]}
      >
        <Animated.View style={fadeStyle(fades[0])}>
          <CutlyLogo width={210} rounded={12} />
          <Text style={styles.hello}>{mode === 'signup' ? 'Create' : mode === 'phone' || mode === 'code' ? 'Your' : 'Welcome'}</Text>
          <Text style={styles.back}>{mode === 'signup' ? 'account.' : mode === 'phone' || mode === 'code' ? 'phone.' : 'back.'}</Text>
          <Text style={styles.lead}>
            {mode === 'signup' ? 'Use your email and a password.' : mode === 'phone' ? 'We will text you a 6-digit code.' : mode === 'code' ? `Enter the code sent to ${phone}.` : 'Sign in to manage your bookings.'}
          </Text>
        </Animated.View>

        <Animated.View style={[styles.fields, fadeStyle(fades[1])]}>
          {mode === 'phone' || mode === 'code' ? (
            <>
              <Field label="Mobile number" focused={focused === 'phone'}>
                <Ionicons name="call-outline" size={16} color={icon} />
                <TextInput
                  value={phone}
                  onChangeText={(value) => { setPhone(value); setError(''); }}
                  onFocus={() => setFocused('phone')}
                  onBlur={() => setFocused(null)}
                  placeholder="+919876543210"
                  placeholderTextColor="rgba(20,17,16,0.28)"
                  keyboardType="phone-pad"
                  editable={mode === 'phone'}
                  style={styles.input}
                  selectionColor={teal}
                />
              </Field>
              {mode === 'code' ? (
                <Field label="Code" focused={focused === 'code'}>
                  <Ionicons name="keypad-outline" size={16} color={icon} />
                  <TextInput
                    value={code}
                    onChangeText={(value) => { setCode(value); setError(''); }}
                    onFocus={() => setFocused('code')}
                    onBlur={() => setFocused(null)}
                    placeholder="123456"
                    placeholderTextColor="rgba(20,17,16,0.28)"
                    keyboardType="number-pad"
                    style={styles.input}
                    selectionColor={teal}
                    onSubmitEditing={submitPhone}
                  />
                </Field>
              ) : null}
            </>
          ) : (
          <><Field label="Email" focused={focused === 'email'}>
            <Ionicons name="mail-outline" size={16} color={icon} />
            <TextInput
              value={email}
              onChangeText={(value) => { setEmail(value); setError(''); }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              placeholder="you@example.com"
              placeholderTextColor="rgba(20,17,16,0.28)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              selectionColor={teal}
            />
          </Field>
          <Field label="Password" focused={focused === 'password'}>
            <Ionicons name="lock-closed-outline" size={16} color={icon} />
            <TextInput
              value={password}
              onChangeText={(value) => { setPassword(value); setError(''); }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              placeholder="••••••••"
              placeholderTextColor="rgba(20,17,16,0.28)"
              secureTextEntry={!showPw}
              style={styles.input}
              selectionColor={teal}
              onSubmitEditing={submitEmail}
            />
            <Pressable onPress={() => setShowPw((shown) => !shown)} hitSlop={8}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={16} color={icon} />
            </Pressable>
          </Field></>
          )}
        </Animated.View>

        <Animated.View style={[styles.forgotWrap, fadeStyle(fades[2])]}>
          {mode === 'signin' ? <Pressable onPress={() => { setMode('phone'); setError(''); }}><Text style={styles.forgot}>Use phone instead</Text></Pressable> : null}
          {mode === 'phone' || mode === 'code' ? <Pressable onPress={() => { setMode('signin'); setError(''); }}><Text style={styles.forgot}>Use email instead</Text></Pressable> : null}
        </Animated.View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Animated.View style={fadeStyle(fades[3])}>
          <Pressable onPress={mode === 'phone' || mode === 'code' ? submitPhone : submitEmail} disabled={busy} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaText}>{busy ? 'Please wait' : mode === 'signup' ? 'Create account' : mode === 'phone' ? 'Send code' : mode === 'code' ? 'Verify code' : 'Sign in'}</Text>
          </Pressable>
        </Animated.View>

        <Animated.View style={[styles.divider, fadeStyle(fades[4])]}>
          <View style={styles.rule} />
          <Text style={styles.or}>or continue with</Text>
          <View style={styles.rule} />
        </Animated.View>

        <Animated.View style={[styles.socialRow, fadeStyle(fades[5])]}>
          <Social icon="logo-google" label="Google" onPress={submitGoogle} />
          <Social icon="logo-apple" label="Apple" onPress={() => setError('Apple sign-in is not set up.')} />
        </Animated.View>

        <Animated.View style={fadeStyle(fades[6])}>
          <Text style={styles.signup}>
            {mode === 'signup' ? 'Already registered? ' : 'New here? '}
            <Text style={styles.signupLink} onPress={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}>
              {mode === 'signup' ? 'Sign in' : 'Create account'}
            </Text>
          </Text>
          <Text
            style={styles.forgot}
            onPress={() => {
              useSessionStore.getState().setAudience(null);
              router.replace('/role');
            }}
          >
            Customer or partner
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, focused, children }: { label: string; focused: boolean; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>{children}</View>
    </View>
  );
}

function Social({ icon, label, onPress }: { icon: 'logo-google' | 'logo-apple'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.social, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={soft} />
      <Text style={styles.socialText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: surface },
  login: { flex: 1, backgroundColor: surface },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: teal, zIndex: 2 },
  loginContent: { paddingHorizontal: 28 },
  hello: { marginTop: 28, color: ink, fontFamily: display, fontSize: 34, lineHeight: 38, letterSpacing: -0.4 },
  back: { color: teal, fontFamily: display, fontStyle: 'italic', fontSize: 34, lineHeight: 40, letterSpacing: -0.4, marginBottom: 8 },
  lead: { color: muted, fontSize: 14, lineHeight: 20 },
  fields: { marginTop: 28, gap: 16 },
  label: { color: muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  field: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: line,
    backgroundColor: card,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  fieldFocused: { borderColor: teal },
  input: { flex: 1, color: ink, fontSize: 15, paddingVertical: 14 },
  forgotWrap: { alignItems: 'flex-end', marginTop: 14, marginBottom: 22 },
  forgot: { color: teal, fontSize: 12, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 13, marginBottom: 12 },
  cta: {
    height: 52,
    borderRadius: 16,
    backgroundColor: teal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: teal,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  ctaText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 22 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: line },
  or: { color: muted, fontSize: 11 },
  socialRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  social: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: line,
    backgroundColor: card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  socialText: { color: soft, fontSize: 14, fontWeight: '600' },
  signup: { textAlign: 'center', color: muted, fontSize: 13 },
  signupLink: { color: teal, fontWeight: '700' }
});
