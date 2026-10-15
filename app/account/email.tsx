import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { CodeSlots } from '@/components/CodeSlots';
import { PressScale } from '@/components/PressScale';
import { EmailCodeStep } from '@/components/EmailCodeStep';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import {
  BackRow,
  CountdownRing,
  Cta,
  ErrorLine,
  OrDivider,
  PasswordField,
  Secondary,
  Title,
  deleteStyles,
  freshGoogleIdToken,
  useCountdown
} from '@/components/accountDeletion/DeleteParts';
import { refreshProfile } from '@/services/auth';
import { emailVerify } from '@/services/emailVerify';
import { showToast } from '@/store/useToastStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { localPhone, pickReauthMethod, reauthOutcome, type ReauthMethod } from '@/utils/deleteFlow';
import { TAKEN_COPY, codeOutcome, displayPhone, type CodeSent } from '@/utils/emailVerifyFlow';

type Step = 'reauth' | 'rate' | 'new' | 'code' | 'done' | 'verify';

/**
 * T4 (#9) screens 09–12 (change / add email, P3 re-auth first) and the 08 "Verify now" path
 * (`?mode=verify`: send → code → toast "Email verified" → back to Profile).
 */
export default function EmailScreen() {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  const params = useLocalSearchParams<{ mode?: string }>();
  const verifyMode = params.mode === 'verify';
  const phone = useSessionStore((st) => st.phone);
  const email = useSessionStore((st) => st.email);
  const emailVerified = useSessionStore((st) => st.emailVerified);
  const hasPassword = useSessionStore((st) => st.hasPassword);
  const googleLinked = useSessionStore((st) => st.googleLinked);
  const authMethods = useSessionStore((st) => st.authMethods);
  const choice = pickReauthMethod({ phone, hasPassword, googleLinked, authMethods });

  const [step, setStep] = useState<Step>(verifyMode ? 'verify' : 'reauth');
  const [method, setMethod] = useState<ReauthMethod | null>(choice.primary);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [sent, setSent] = useState<CodeSent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [rateTotal, setRateTotal] = useState(60);
  const [done, setDone] = useState<{ email: string; notified: boolean } | null>(null);
  const grantRef = useRef<string | null>(null);
  const smsSent = useRef(false);
  const left = useCountdown(retryAt);
  // F2: the success overlay closes itself so Done is reachable.
  const [overlay, setOverlay] = useState(false);
  const overlayDone = useCallback(() => setOverlay(false), []);

  useEffect(() => {
    void refreshProfile();
  }, []);

  useEffect(() => {
    if (step === 'rate' && retryAt && left === 0) setStep(grantRef.current ? 'new' : 'reauth');
  }, [left, retryAt, step]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));
  const rate = (at: number) => {
    setRetryAt(at);
    setRateTotal(Math.max(1, Math.round((at - Date.now()) / 1000)));
    setStep('rate');
  };
  const signedOut = () => {
    useSessionStore.getState().clear();
    router.replace('/auth');
  };

  // 08 "Verify now": send the code to the current address on open.
  useEffect(() => {
    if (!verifyMode) return;
    void (async () => {
      setBusy(true);
      try {
        setSent(await emailVerify.sendVerify());
        setStep('code');
      } catch (err) {
        const out = codeOutcome(err);
        if (out.kind === 'rateLimited') rate(out.retryAt);
        else if (out.kind === 'signedOut') signedOut();
        else setError(out.kind === 'error' || 'message' in out ? (out as { message: string }).message : '');
      } finally {
        setBusy(false);
      }
    })();
  }, [verifyMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 09: OTP re-auth sends the SMS once when the step opens.
  useEffect(() => {
    if (step !== 'reauth' || method !== 'otp' || smsSent.current) return;
    smsSent.current = true;
    emailVerify.sendReauthSms().catch((err) => {
      const out = reauthOutcome(err);
      if (out.kind === 'rateLimited') rate(out.retryAt);
      else if (out.kind === 'signedOut') signedOut();
      else setError(out.message);
    });
  }, [step, method]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reauth(proof: { code: string } | { password: string } | { googleIdToken: string }) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const grant = await emailVerify.reauthForChange(proof);
      grantRef.current = grant.reauthToken;
      setStep('new');
    } catch (err) {
      setCode('');
      const out = reauthOutcome(err);
      if (out.kind === 'rateLimited') rate(out.retryAt);
      else if (out.kind === 'signedOut') signedOut();
      else setError(out.message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const idToken = await freshGoogleIdToken().catch(() => null);
    setBusy(false);
    if (idToken) await reauth({ googleIdToken: idToken });
  }

  async function sendToNew() {
    const value = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Enter a valid email.');
      return;
    }
    if (!grantRef.current) {
      setStep('reauth');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setSent(await emailVerify.requestChange(value, grantRef.current));
      grantRef.current = null; // single use, burnt by the server
      setStep('code');
    } catch (err) {
      const out = codeOutcome(err);
      if (out.kind === 'rateLimited') rate(out.retryAt);
      else if (out.kind === 'signedOut') signedOut();
      else if (out.kind === 'taken') setError(TAKEN_COPY);
      else if ((err as { code?: string }).code === 'REAUTH_REQUIRED') {
        grantRef.current = null;
        smsSent.current = false;
        setStep('reauth');
        setError('Confirm it’s you again.');
      } else setError('message' in out ? out.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(value: string) {
    if (verifyMode) {
      const r = await emailVerify.confirmVerify(value);
      useSessionStore.getState().setProfile(r.user as never);
      // V14: toast (not a dialog), then back to Profile.
      showToast('Email verified', 'checkmark-circle-outline');
      back();
      return;
    }
    const r = await emailVerify.confirmChange(value);
    useSessionStore.getState().setProfile({ ...(r.user as object), emailReleased: false } as never);
    setDone({ email: String(r.user.email || newEmail.trim().toLowerCase()), notified: r.notifiedOldAddress });
    setOverlay(true);
    setStep('done');
  }

  let body: React.ReactNode = null;
  if (step === 'rate') {
    body = (
      <>
        <BackRow onPress={back} />
        <Title>Too many tries</Title>
        <Text style={s.lead}>For your security, wait a little before trying again.</Text>
        <CountdownRing left={left} total={rateTotal} />
      </>
    );
  } else if (step === 'verify') {
    body = (
      <>
        <BackRow onPress={back} />
        <Title>Check your email</Title>
        <Text style={s.lead}>{busy ? 'Sending a code…' : ''}</Text>
        <ErrorLine text={error} />
      </>
    );
  } else if (step === 'reauth') {
    body = (
      <>
        <BackRow onPress={back} />
        <Title>Confirm it’s you</Title>
        {method === 'otp' ? (
          <>
            {/* V15: design copy + Resend link. */}
            <Text style={s.lead}>Enter the code sent to {displayPhone(phone)}</Text>
            <CodeSlots value={code} onChange={setCode} onComplete={(v) => void reauth({ code: v })} disabled={busy} accessibilityLabel="6-digit code" tone="email" error={Boolean(error)} />
            <ErrorLine text={error} />
            <Cta label={busy ? 'Checking…' : 'Continue'} onPress={() => void reauth({ code })} disabled={busy || code.length < 6} />
            <PressScale
              style={s.textBtn}
              onPress={() => {
                smsSent.current = false;
                setError('');
                setCode('');
                emailVerify.sendReauthSms().then(() => showToast('New code sent', 'chatbubble-outline')).catch((err) => {
                  const out = reauthOutcome(err);
                  if (out.kind === 'rateLimited') rate(out.retryAt);
                  else if (out.kind === 'signedOut') signedOut();
                  else setError(out.message);
                });
              }}
              disabled={busy}
              haptic
              accessibilityRole="button"
            >
              <Text style={s.link}>Resend code</Text>
            </PressScale>
          </>
        ) : method === 'password' ? (
          <>
            <Text style={s.lead}>Enter your password to change your email.</Text>
            <PasswordField value={password} onChange={setPassword} onSubmit={() => void reauth({ password })} editable={!busy} />
            <ErrorLine text={error} />
            <Cta label={busy ? 'Checking…' : 'Continue'} onPress={() => void reauth({ password })} disabled={busy || !password} />
          </>
        ) : method === 'google' ? (
          <>
            <Text style={s.lead}>Sign in with Google again to change your email.</Text>
            <ErrorLine text={error} />
          </>
        ) : (
          <Text style={s.lead}>This account has no sign-in method we can check. Contact support.</Text>
        )}
        {choice.alsoGoogle || method === 'google' ? (
          <>
            {method !== 'google' ? <OrDivider /> : null}
            <Secondary label="Continue with Google" icon="logo-google" onPress={() => void google()} disabled={busy} />
          </>
        ) : null}
      </>
    );
  } else if (step === 'new') {
    body = (
      <>
        <BackRow onPress={back} />
        <Title>{email ? 'Change email' : 'Add email'}</Title>
        <Text style={s.lead}>
          We'll send a code to the new address.{email ? ' Your current email stays until you confirm it.' : ''}
        </Text>
        <View style={s.field}>
          <TextInput
            style={[s.input, { backgroundColor: '#FAFAFA', paddingRight: 16 }]}
            value={newEmail}
            onChangeText={(v) => {
              setNewEmail(v);
              setError('');
            }}
            placeholder="New email"
            placeholderTextColor={c.muted}
            keyboardType="email-address"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="New email"
          />
        </View>
        <ErrorLine text={error} />
        <Cta label={busy ? 'Sending…' : 'Send code'} onPress={() => void sendToNew()} disabled={busy} />
      </>
    );
  } else if (step === 'code' && sent) {
    body = (
      <EmailCodeStep
        maskedEmail={sent.maskedEmail}
        backLabel={verifyMode ? 'Back' : 'Change email'}
        onBack={verifyMode ? back : () => setStep(grantRef.current ? 'new' : 'reauth')}
        resendInSec={sent.resendInSec}
        verify={verifyCode}
        resend={() => (verifyMode ? emailVerify.sendVerify() : emailVerify.resendChange())}
        onOutcome={(out) => {
          if (out.kind === 'signedOut') {
            signedOut();
            return true;
          }
          if (out.kind === 'restart' || out.kind === 'taken') {
            setStep(verifyMode ? 'verify' : 'reauth');
            smsSent.current = false;
            setError(out.message);
            return true;
          }
          return false;
        }}
      />
    );
  } else if (step === 'done' && done) {
    body = (
      <>
        <SuccessOverlay visible={overlay} label="Email updated" onDone={overlayDone} />
        <Title>Email updated</Title>
        <Text style={s.lead}>
          You'll now sign in with {done.email}.{done.notified ? " We've let your old address know." : ''}
        </Text>
        <Cta label="Done" onPress={() => router.replace('/(tabs)/profile')} />
      </>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.form}>{body}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
