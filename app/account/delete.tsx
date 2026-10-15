import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CodeSlots } from '@/components/CodeSlots';
import { ScreenBack } from '@/components/ScreenBack';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import {
  BackRow,
  Badge,
  CheckRow,
  CountdownRing,
  Cta,
  ErrorLine,
  InfoCard,
  OrDivider,
  PasswordField,
  Secondary,
  TextButton,
  Title,
  deleteStyles,
  freshGoogleIdToken,
  useCountdown
} from '@/components/accountDeletion/DeleteParts';
import { customerDeletion, type CustomerDeleteResult, type ReauthProof } from '@/services/accountDeletion';
import { refreshProfile } from '@/services/auth';
import { appAlert } from '@/store/useDialogStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import {
  attemptsCopy,
  deleteOutcome,
  formatIstDate,
  formatIstLong,
  localPhone,
  maskEmail,
  mmss,
  pickReauthMethod,
  reauthOutcome,
  type ReauthMethod
} from '@/utils/deleteFlow';

type Step = 'confirm' | 'method' | 'rate' | 'visit' | 'done';

/** #46 customer Delete account: C1 confirm → C2 OTP / C4 Google / C5 password → C6 / C7 / C8. */
export default function DeleteAccountScreen() {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  const phone = useSessionStore((st) => st.phone);
  const email = useSessionStore((st) => st.email);
  const hasPassword = useSessionStore((st) => st.hasPassword);
  const googleLinked = useSessionStore((st) => st.googleLinked);
  const authMethods = useSessionStore((st) => st.authMethods);
  const retryAt = useSessionStore((st) => st.reauthRetryAt);
  const setRetryAt = useSessionStore((st) => st.setReauthRetryAt);

  const [step, setStep] = useState<Step>('confirm');
  const [understood, setUnderstood] = useState(false);
  const [method, setMethod] = useState<ReauthMethod | null>(null);
  const [code, setCode] = useState('');
  const [slotsKey, setSlotsKey] = useState(0);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CustomerDeleteResult | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [rateTotal, setRateTotal] = useState(0);
  const busyRef = useRef(false);
  const left = useCountdown(retryAt);
  const choice = pickReauthMethod({ phone, hasPassword, googleLinked, authMethods });

  useEffect(() => {
    // authMethods / hasPassword come from /auth/me (older sessions may not have them yet).
    void refreshProfile();
  }, []);

  const goRate = useCallback(
    (at: number) => {
      setRetryAt(at);
      setRateTotal(Math.max(1, Math.ceil((at - Date.now()) / 1000)));
      setStep('rate');
    },
    [setRetryAt]
  );

  const signedOut = useCallback(() => {
    useSessionStore.getState().clear();
    router.replace('/auth');
  }, []);

  const sendCode = useCallback(async () => {
    setError('');
    try {
      await customerDeletion.sendCode();
    } catch (err) {
      const out = reauthOutcome(err);
      if (out.kind === 'rateLimited') return goRate(out.retryAt);
      if (out.kind === 'signedOut') return signedOut();
      setError(out.message);
    }
  }, [goRate, signedOut]);

  const openMethod = useCallback(
    (m: ReauthMethod | null) => {
      if (retryAt && retryAt > Date.now()) return goRate(retryAt);
      setMethod(m);
      setError('');
      setHint('');
      setCode('');
      setPassword('');
      setStep('method');
      if (m === 'otp') void sendCode();
    },
    [goRate, retryAt, sendCode]
  );

  async function confirm(proof: ReauthProof) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setHint('');
    try {
      let grant;
      try {
        grant = await customerDeletion.reauth(proof);
      } catch (err) {
        const out = reauthOutcome(err);
        if (out.kind === 'rateLimited') return goRate(out.retryAt);
        if (out.kind === 'signedOut') return signedOut();
        if (out.kind === 'failed') {
          setError([out.message, attemptsCopy(out.attemptsRemaining)].filter(Boolean).join(' '));
          if ('googleIdToken' in proof) setHint('Use the Google account you signed in with.');
          if ('code' in proof) {
            setCode('');
            setSlotsKey((k) => k + 1);
          }
          return;
        }
        setError(out.message);
        return;
      }
      // Straight to DELETE: the grant is single-use and lasts 300 s.
      try {
        const done = await customerDeletion.deleteAccount(grant.reauthToken);
        setResult(done);
        setCelebrate(true);
        setStep('done');
      } catch (err) {
        const out = deleteOutcome(err);
        switch (out.kind) {
          case 'visit':
            return setStep('visit');
          case 'reauth':
            setError(out.message);
            if (method === 'otp') void sendCode();
            return;
          case 'rateLimited':
            return goRate(out.retryAt);
          case 'retry':
            setUnderstood(false);
            setStep('confirm');
            return appAlert('Try again', out.message);
          case 'signedOut':
            return signedOut();
          default:
            return setError('message' in out ? out.message : 'Something went wrong. Try again.');
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    try {
      const idToken = await freshGoogleIdToken();
      if (!idToken) return; // cancelled: stay put, no error
      await confirm({ googleIdToken: idToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in needs a fresh Android build.');
    }
  }

  function keep() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  function finish() {
    // tokenVersion was bumped server-side; this session is already dead.
    useSessionStore.getState().clear();
    useSessionStore.getState().passLaunch();
    router.replace('/auth');
  }

  let content: ReactNode;
  if (step === 'confirm') {
    content = (
      <>
        <ScreenBack onPress={keep} />
        <Badge icon="trash-outline" color={c.danger} />
        <Title>Delete your account?</Title>
        <Text style={s.lead}>
          You’ll be signed out on every device. You have 14 days to change your mind — just sign in again to restore it.
        </Text>
        <InfoCard
          rows={[
            { icon: 'calendar-outline', text: 'Upcoming visits are cancelled. Advance refunds follow the cancellation policy.' },
            { icon: 'refresh-outline', text: 'Sign in within 14 days and everything comes back.' },
            { icon: 'lock-closed-outline', text: 'After 14 days your name, phone, email and favourites are erased for good.' }
          ]}
        />
        <CheckRow checked={understood} onToggle={() => setUnderstood((v) => !v)} label="I understand my account will be deleted after 14 days." />
        <View style={s.spacer} />
        <Cta
          label="Continue"
          disabled={!understood}
          onPress={() => {
            if (!choice.primary) {
              return appAlert('Contact CutLy support', 'This account has no sign-in method we can confirm in the app. Ask support to delete it.');
            }
            openMethod(choice.primary);
          }}
        />
        <TextButton label="Keep my account" onPress={keep} />
      </>
    );
  } else if (step === 'method' && method === 'otp') {
    content = (
      <>
        <BackRow onPress={() => setStep('confirm')} />
        <Title>Confirm it’s you</Title>
        <Text style={s.lead}>Enter the code sent to +91 {localPhone(phone)}</Text>
        <View accessible accessibilityLabel="6-digit code">
          <CodeSlots key={slotsKey} value={code} onChange={setCode} onComplete={(v) => void confirm({ code: v })} disabled={busy} />
        </View>
        <ErrorLine text={error} />
        <Cta label={busy ? 'Verifying…' : 'Continue'} disabled={busy || code.length !== 6} onPress={() => void confirm({ code })} />
        <View style={s.center}>
          <TextButton label="Resend code" onPress={() => void sendCode()} disabled={busy} />
        </View>
        {choice.alsoGoogle ? (
          <>
            <OrDivider />
            <Secondary label="Continue with Google" icon="logo-google" onPress={() => void google()} disabled={busy} />
            {hint ? <Text style={s.hint}>{hint}</Text> : null}
          </>
        ) : null}
      </>
    );
  } else if (step === 'method' && method === 'password') {
    content = (
      <>
        <BackRow onPress={() => setStep('confirm')} />
        <Badge icon="lock-closed-outline" color={c.ink} />
        <Title>Confirm it’s you</Title>
        <Text style={s.lead}>Enter the password for {maskEmail(email)}.</Text>
        <PasswordField value={password} onChange={setPassword} onSubmit={() => password && void confirm({ password })} editable={!busy} />
        <ErrorLine text={error} />
        <Cta label={busy ? 'Verifying…' : 'Continue'} disabled={busy || !password} onPress={() => void confirm({ password })} />
        {choice.alsoGoogle ? (
          <>
            <OrDivider />
            <Secondary label="Continue with Google" icon="logo-google" onPress={() => void google()} disabled={busy} />
            {hint ? <Text style={s.hint}>{hint}</Text> : null}
          </>
        ) : null}
      </>
    );
  } else if (step === 'method') {
    content = (
      <>
        <BackRow onPress={() => setStep('confirm')} />
        <Badge icon="logo-google" color={c.ink} />
        <Title>Confirm it’s you</Title>
        <Text style={s.lead}>Sign in with Google again, using the account you use for CutLy.</Text>
        <Secondary label={busy ? 'Verifying…' : 'Continue with Google'} icon="logo-google" onPress={() => void google()} disabled={busy} />
        <ErrorLine text={error} />
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </>
    );
  } else if (step === 'rate') {
    content = (
      <>
        <BackRow onPress={() => setStep('confirm')} />
        <CountdownRing left={left} total={Math.max(rateTotal, left)} />
        <Title>Too many tries</Title>
        <Text style={s.lead} accessibilityLiveRegion="polite">
          For your safety we’ve paused this for a bit. You can try again in {mmss(left)}.
        </Text>
        <View style={s.spacer} />
        <Cta
          label="Try again"
          disabled={left > 0}
          onPress={() => {
            setRetryAt(null);
            openMethod(method ?? choice.primary);
          }}
        />
        <TextButton label="Keep my account" onPress={keep} />
      </>
    );
  } else if (step === 'visit') {
    content = (
      <>
        <ScreenBack onPress={keep} />
        <Badge icon="cut-outline" color={c.warning} />
        <Title>Finish your current visit first.</Title>
        <Text style={s.lead}>You’re checked in at a shop right now. Once the visit is done, you can delete your account.</Text>
        <View style={s.spacer} />
        <Cta label="View visit" onPress={() => router.replace('/visits')} />
        <TextButton label="Back to profile" onPress={keep} />
      </>
    );
  } else {
    const restoreBefore = result?.restoreBefore ?? new Date().toISOString();
    const cancelled = result?.cancelledBookings ?? 0;
    content = (
      <>
        <View style={s.success} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="checkmark" size={56} color="#FFF" />
        </View>
        <Title>Your account is scheduled for deletion</Title>
        <Text style={s.lead}>Sign in before {formatIstLong(restoreBefore)} to restore it. After that it’s gone for good.</Text>
        <InfoCard
          rows={[
            ...(cancelled > 0
              ? [{ icon: 'calendar-outline' as const, text: `${cancelled} upcoming visit${cancelled === 1 ? '' : 's'} cancelled` }]
              : []),
            {
              icon: 'time-outline' as const,
              text: (
                <>
                  Restore before <Text style={s.rowStrong}>{formatIstDate(restoreBefore)} IST</Text>
                </>
              )
            }
          ]}
        />
        <View style={s.spacer} />
        <Cta label="Done" onPress={finish} />
      </>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.form}>{content}</View>
      </ScrollView>
      <SuccessOverlay visible={celebrate} label="Scheduled" onDone={() => setCelebrate(false)} />
    </SafeAreaView>
  );
}
