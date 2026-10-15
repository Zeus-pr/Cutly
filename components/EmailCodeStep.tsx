import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { CodeSlots } from '@/components/CodeSlots';
import { PressScale } from '@/components/PressScale';
import { BackRow, CountdownRing, Cta, ErrorLine, Title, deleteStyles, useCountdown } from '@/components/accountDeletion/DeleteParts';
import { useThemedStyles } from '@/store/useThemeStore';
import {
  RESEND_HINT,
  codeOutcome,
  resendCaption,
  showResendHint,
  type CodeOutcome
} from '@/utils/emailVerifyFlow';

/**
 * T4 (#9) screens 03–06 (and 11): "Check your email" code entry, shared by signup,
 * verify-existing and email change. The parent owns the API calls.
 */
export function EmailCodeStep({
  maskedEmail,
  backLabel,
  onBack,
  resendInSec = 60,
  verify,
  resend,
  onOutcome
}: {
  maskedEmail: string;
  backLabel: string;
  onBack: () => void;
  resendInSec?: number;
  verify: (code: string) => Promise<void>;
  resend: () => Promise<{ resendInSec: number }>;
  /** Outcomes the parent must handle (restart / taken / signedOut). Return true when handled. */
  onOutcome?: (outcome: CodeOutcome) => boolean;
}) {
  const s = useThemedStyles(deleteStyles);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [resends, setResends] = useState(0);
  const [resendAt, setResendAt] = useState(() => Date.now() + resendInSec * 1000);
  const [limitedUntil, setLimitedUntil] = useState<number | null>(null);
  const [toast, setToast] = useState(false);
  const toastFade = useRef(new Animated.Value(0)).current;
  const resendLeft = useCountdown(resendAt);
  const limitLeft = useCountdown(limitedUntil);
  const [limitTotal, setLimitTotal] = useState(60);

  useEffect(() => {
    if (resendLeft === 0) AccessibilityInfo.announceForAccessibility('You can resend the code now.');
  }, [resendLeft === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (limitedUntil && limitLeft === 0) setLimitedUntil(null);
  }, [limitLeft, limitedUntil]);

  function handle(outcome: CodeOutcome) {
    if (onOutcome?.(outcome)) return;
    if (outcome.kind === 'rateLimited') {
      setLimitTotal(Math.max(1, Math.round((outcome.retryAt - Date.now()) / 1000)));
      setLimitedUntil(outcome.retryAt);
      return;
    }
    if (outcome.kind === 'expired') {
      setExpired(true);
      setError(outcome.message);
      return;
    }
    if (outcome.kind === 'signedOut') {
      setError('Sign in again.');
      return;
    }
    setError(outcome.message);
  }

  const submit = useCallback(
    async (value: string) => {
      if (busy || expired || value.length < 6) return;
      setBusy(true);
      setError('');
      try {
        await verify(value);
      } catch (err) {
        setCode('');
        handle(codeOutcome(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, expired, verify] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function sendAgain() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const sent = await resend();
      setExpired(false);
      setCode('');
      setResends((n) => n + 1);
      setResendAt(Date.now() + (sent.resendInSec || 60) * 1000);
      setToast(true);
      AccessibilityInfo.announceForAccessibility('New code sent');
      toastFade.setValue(1);
      Animated.timing(toastFade, { toValue: 0, duration: 400, delay: 2200, useNativeDriver: true }).start(() => setToast(false));
    } catch (err) {
      handle(codeOutcome(err));
    } finally {
      setBusy(false);
    }
  }

  if (limitedUntil) {
    return (
      <>
        <BackRow onPress={onBack} label={backLabel} />
        <Title>Too many tries</Title>
        <Text style={s.lead}>For your security, wait a little before trying again.</Text>
        <CountdownRing left={limitLeft} total={limitTotal} />
      </>
    );
  }

  return (
    <>
      <BackRow onPress={onBack} label={backLabel} />
      <Title>Check your email</Title>
      <Text style={s.lead}>Enter the 6-digit code sent to {maskedEmail}</Text>
      <View style={expired ? { opacity: 0.55 } : undefined}>
        <CodeSlots
          value={code}
          onChange={(next) => {
            setCode(next);
            if (!expired) setError('');
          }}
          onComplete={(value) => void submit(value)}
          disabled={busy || expired}
          accessibilityLabel="6-digit code"
        />
      </View>
      <ErrorLine text={error} />
      {toast ? (
        <Animated.View style={{ opacity: toastFade, alignSelf: 'center', backgroundColor: '#17263C', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#FFF', fontSize: 13 }}>New code sent</Text>
        </Animated.View>
      ) : null}
      {expired ? (
        <Cta label={busy ? 'Sending…' : 'Send a new code'} onPress={() => void sendAgain()} disabled={busy} />
      ) : (
        <Cta label={busy ? 'Verifying…' : 'Continue'} onPress={() => void submit(code)} disabled={busy || code.length < 6} />
      )}
      {!expired ? (
        resendLeft > 0 ? (
          <Text style={s.hint} accessibilityRole="timer">
            {resendCaption(resendLeft)}
          </Text>
        ) : (
          <PressScale style={s.textBtn} onPress={() => void sendAgain()} disabled={busy} haptic accessibilityRole="button">
            <Text style={s.link}>Resend code</Text>
          </PressScale>
        )
      ) : null}
      <Text style={s.hint}>The code expires in 10 minutes. Check spam if you don't see it.</Text>
      {showResendHint(resends) ? <Text style={s.hint}>{RESEND_HINT}</Text> : null}
    </>
  );
}
