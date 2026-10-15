import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PressScale } from '@/components/PressScale';
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
  PasswordField,
  Secondary,
  TextButton,
  Title,
  deleteStyles,
  useCountdown,
  useLeaveLock
} from '@/components/accountDeletion/DeleteParts';
import { partnerDeletion, type PartnerDeleteResult } from '@/services/accountDeletion';
import { appAlert } from '@/store/useDialogStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import {
  attemptsCopy,
  deleteOutcome,
  formatIstDate,
  formatIstLong,
  formatIstRow,
  mmss,
  reauthOutcome,
  holdGrant,
  liveGrant,
  type HeldGrant,
  type UpcomingBooking
} from '@/utils/deleteFlow';

type Step = 'confirm' | 'password' | 'rate' | 'bookings' | 'done';

/** #46 partner Delete account: confirm (partner variant) → P1 password → P2 409 / C6 / C8. */
export default function PartnerDeleteScreen() {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  const retryAt = useSessionStore((st) => st.reauthRetryAt);
  const setRetryAt = useSessionStore((st) => st.setReauthRetryAt);
  const [step, setStep] = useState<Step>('confirm');
  const [understood, setUnderstood] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bookings, setBookings] = useState<UpcomingBooking[]>([]);
  const [result, setResult] = useState<PartnerDeleteResult | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [rateTotal, setRateTotal] = useState(0);
  const busyRef = useRef(false);
  // A grant survives a failed DELETE (consumed inside the delete tx), so reuse it while valid.
  const grantRef = useRef<HeldGrant | null>(null);
  const left = useCountdown(retryAt);

  function goRate(at: number) {
    setRetryAt(at);
    setRateTotal(Math.max(1, Math.ceil((at - Date.now()) / 1000)));
    setStep('rate');
  }

  function signedOut() {
    const session = useSessionStore.getState();
    session.clearPartner();
    session.setAudience('customer');
    router.replace('/partner/auth');
  }

  function keep() {
    if (router.canGoBack()) router.back();
    else router.replace('/partner/(tabs)/profile');
  }

  function openPassword() {
    if (retryAt && retryAt > Date.now()) return goRate(retryAt);
    // Still holding a valid grant (e.g. after P2 or a 409): go straight to DELETE.
    if (liveGrant(grantRef.current)) return void confirm();
    setPassword('');
    setError('');
    setStep('password');
  }

  async function confirm() {
    if (busyRef.current) return;
    let grant = liveGrant(grantRef.current);
    if (!grant && !password) {
      setStep('password');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (!grant) {
        try {
          grant = holdGrant(await partnerDeletion.reauth({ password }));
          grantRef.current = grant;
        } catch (err) {
          const out = reauthOutcome(err);
          if (out.kind === 'rateLimited') return goRate(out.retryAt);
          if (out.kind === 'signedOut') return signedOut();
          setError(out.kind === 'failed' ? [out.message, attemptsCopy(out.attemptsRemaining)].filter(Boolean).join(' ') : out.message);
          return;
        }
      }
      try {
        const done = await partnerDeletion.deleteAccount(grant.reauthToken);
        grantRef.current = null;
        setResult(done);
        setCelebrate(true);
        setStep('done');
      } catch (err) {
        const out = deleteOutcome(err);
        switch (out.kind) {
          case 'bookings':
            setBookings(out.bookings);
            return setStep('bookings');
          case 'reauth':
            grantRef.current = null;
            setPassword('');
            return setError(out.message);
          case 'rateLimited':
            return goRate(out.retryAt);
          case 'retry':
            // Grant is still valid: retry the DELETE without asking for the password again.
            return appAlert('Try again', out.message, [
              { label: 'Not now', role: 'cancel' },
              { label: 'Try again', role: 'confirm', onPress: () => void confirm() }
            ]);
          case 'opsOnly':
            // No real support contact exists in the repo yet; don't open a placeholder number.
            return appAlert('Contact CutLy support', out.message);
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

  function finish() {
    const session = useSessionStore.getState();
    session.clearPartner();
    session.passLaunch();
    session.setAudience('customer');
    router.replace('/auth');
  }

  // C8: the token is already dead server-side; never let back/swipe return into the app.
  const leave = useLeaveLock(step === 'done', finish);

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
            { icon: 'storefront-outline', text: 'Your shop closes and is hidden from search.' },
            { icon: 'refresh-outline', text: 'Sign in within 14 days and everything comes back.' },
            { icon: 'lock-closed-outline', text: 'After 14 days your name, phone and email are erased for good.' }
          ]}
        />
        <CheckRow checked={understood} onToggle={() => setUnderstood((v) => !v)} label="I understand my account will be deleted after 14 days." />
        <View style={s.spacer} />
        <Cta pill label="Continue" disabled={!understood} onPress={openPassword} />
        <TextButton label="Keep my account" onPress={keep} />
      </>
    );
  } else if (step === 'password') {
    content = (
      <>
        <BackRow onPress={() => setStep('confirm')} />
        <Text style={s.kicker}>Partner</Text>
        <Title partner>Confirm it’s you</Title>
        <Text style={s.body}>Enter your shop password to delete your partner account.</Text>
        <PasswordField value={password} onChange={setPassword} onSubmit={() => void confirm()} editable={!busy} />
        <ErrorLine text={error} />
        <View style={s.spacer} />
        <Cta pill label={busy ? 'Verifying…' : 'Continue'} disabled={busy || !password} onPress={() => void confirm()} />
        <Secondary pill label="Keep my account" onPress={keep} disabled={busy} />
      </>
    );
  } else if (step === 'rate') {
    content = (
      <>
        <BackRow onPress={() => setStep('confirm')} />
        <CountdownRing left={left} total={Math.max(rateTotal, left)} />
        <Title>Too many tries</Title>
        <Text style={s.lead}>
          For your safety we’ve paused this for a bit. You can try again in {mmss(left)}.
        </Text>
        <View style={s.spacer} />
        <Cta
          pill
          label="Try again"
          disabled={left > 0}
          onPress={() => {
            setRetryAt(null);
            openPassword();
          }}
        />
        <TextButton label="Keep my account" onPress={keep} />
      </>
    );
  } else if (step === 'bookings') {
    content = (
      <>
        <ScreenBack onPress={keep} />
        <Badge icon="calendar-outline" color={c.warning} />
        <Title>Finish or cancel your upcoming bookings first.</Title>
        <Text style={s.lead}>
          Your shop still has {bookings.length} booking{bookings.length === 1 ? '' : 's'}. Complete or cancel them on Floor, then come back.
        </Text>
        <View style={s.card}>
          {bookings.map((b, i) => {
            const who = [b.customerName, b.serviceNames?.join(', ')].filter(Boolean).join(' · ');
            return (
              <PressScale
                key={b.id}
                onPress={() => router.push({ pathname: '/partner/history/[id]', params: { id: b.id } })}
                style={[s.row, i < bookings.length - 1 && s.rowLine]}
                accessibilityLabel={`Booking ${b.bookingCode}, ${formatIstRow(b.startsAt)}`}
                pressedScale={0.98}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>#{b.bookingCode}</Text>
                  {who ? <Text style={s.rowSub}>{who}</Text> : null}
                  <Text style={s.rowSub}>{formatIstRow(b.startsAt)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.muted} />
              </PressScale>
            );
          })}
        </View>
        <View style={s.spacer} />
        <Cta pill label="Open Floor" onPress={() => router.replace('/partner/(tabs)/floor')} />
        <TextButton label="Back to profile" onPress={keep} />
      </>
    );
  } else {
    const restoreBefore = result?.restoreBefore ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    content = (
      <>
        <View style={s.success} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="checkmark" size={56} color="#FFF" />
        </View>
        <Title>Your account is scheduled for deletion</Title>
        <Text style={s.lead}>Sign in before {formatIstLong(restoreBefore)} to restore it. After that it’s gone for good.</Text>
        <InfoCard
          rows={[
            {
              icon: 'time-outline',
              text: (
                <>
                  Restore before <Text style={s.rowStrong}>{formatIstDate(restoreBefore)} IST</Text>
                </>
              )
            }
          ]}
        />
        <View style={s.spacer} />
        <Cta pill label="Done" onPress={leave} />
      </>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ gestureEnabled: step !== 'done' }} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.form}>{content}</View>
      </ScrollView>
      <SuccessOverlay visible={celebrate} label="Scheduled" onDone={() => setCelebrate(false)} />
    </SafeAreaView>
  );
}
