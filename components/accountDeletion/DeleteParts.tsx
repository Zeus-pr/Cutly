import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion } from 'react-native-reanimated';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { mmss, secondsLeft } from '@/utils/deleteFlow';

/**
 * #46 shared pieces for the delete / re-auth / restore screens. Customer screens copy
 * app/auth.tsx (form, title, lead, cta, secondary, link, error); partner screens copy
 * app/partner/auth.tsx (kicker, display title, pill CTA). Spec: designs/account-deletion-reauth.
 */

export type IconName = keyof typeof Ionicons.glyphMap;

export function deleteStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    scroll: { flexGrow: 1 },
    form: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.md },
    center: { alignItems: 'center' },
    spacer: { flexGrow: 1, minHeight: spacing.lg },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginLeft: -4, minHeight: 44 },
    backText: { fontFamily: fontFamily.medium, fontSize: 14, color: c.ink },
    badge: { width: 64, height: 64, borderRadius: 18, backgroundColor: c.sand, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: spacing.md },
    title: { fontFamily: fontFamily.bold, fontSize: 26, color: c.ink, textAlign: 'center', marginTop: 4 },
    lead: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, color: c.muted, textAlign: 'center', marginBottom: 4 },
    card: { backgroundColor: c.surface, borderRadius: radii.lg, paddingHorizontal: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 44 },
    rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
    rowText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, color: c.ink },
    rowStrong: { fontFamily: fontFamily.semibold },
    rowTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: c.ink },
    rowSub: { fontFamily: fontFamily.regular, fontSize: 13, color: c.muted, marginTop: 2 },
    check: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, paddingVertical: 4 },
    box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
    boxOn: { backgroundColor: c.accent, borderColor: c.accent },
    checkText: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 20, color: c.ink },
    cta: { height: 54, borderRadius: radii.md, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    pill: { borderRadius: radii.pill },
    ctaDisabled: { opacity: 0.55 },
    ctaText: { fontFamily: fontFamily.bold, fontSize: 16, color: '#FFF' },
    secondary: { height: 52, borderRadius: radii.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    outlinePill: { height: 48, borderRadius: radii.pill },
    secondaryText: { fontFamily: fontFamily.semibold, fontSize: 15, color: c.ink },
    textBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
    textBtnLabel: { fontFamily: fontFamily.semibold, fontSize: 14, color: c.muted },
    link: { fontFamily: fontFamily.semibold, fontSize: 14, color: c.accent },
    error: { fontFamily: fontFamily.medium, fontSize: 13, color: c.danger, textAlign: 'center' },
    hint: { fontFamily: fontFamily.regular, fontSize: 13, color: c.muted, textAlign: 'center' },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.line },
    orText: { fontFamily: fontFamily.medium, fontSize: 12, letterSpacing: 1, color: c.muted },
    field: { position: 'relative' },
    input: { height: 54, borderRadius: radii.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: spacing.md, paddingRight: 48, fontFamily: fontFamily.medium, fontSize: 16, color: c.ink },
    eye: { position: 'absolute', right: 4, top: 5, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    kicker: { fontFamily: fontFamily.bold, fontSize: 13, letterSpacing: 1.6, color: c.accent, textTransform: 'uppercase' },
    displayTitle: { ...typography.display, fontWeight: undefined, color: c.ink, fontSize: 30, lineHeight: 36, letterSpacing: -0.7 },
    body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, color: c.muted },
    ringWrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
    ringText: { position: 'absolute', fontFamily: fontFamily.bold, fontSize: 30, color: c.ink },
    success: { width: 120, height: 120, borderRadius: 60, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: spacing.xl }
  });
}

export function Badge({ icon, color }: { icon: IconName; color: string }) {
  const s = useThemedStyles(deleteStyles);
  return (
    <View style={s.badge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name={icon} size={30} color={color} />
    </View>
  );
}

export function Title({ children, partner }: { children: ReactNode; partner?: boolean }) {
  const s = useThemedStyles(deleteStyles);
  return (
    <Text style={partner ? s.displayTitle : s.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function InfoCard({ rows }: { rows: { icon: IconName; text: ReactNode }[] }) {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  return (
    <View style={s.card}>
      {rows.map((row, i) => (
        <View key={i} style={[s.row, i < rows.length - 1 && s.rowLine]}>
          <Ionicons name={row.icon} size={20} color={c.muted} />
          <Text style={s.rowText}>{row.text}</Text>
        </View>
      ))}
    </View>
  );
}

export function CheckRow({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  const s = useThemedStyles(deleteStyles);
  return (
    <PressScale
      onPress={onToggle}
      style={s.check}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      pressedScale={0.98}
    >
      <View style={[s.box, checked && s.boxOn]}>{checked ? <Ionicons name="checkmark" size={16} color="#FFF" /> : null}</View>
      <Text style={s.checkText}>{label}</Text>
    </PressScale>
  );
}

export function Cta({ label, onPress, disabled, pill }: { label: string; onPress: () => void; disabled?: boolean; pill?: boolean }) {
  const s = useThemedStyles(deleteStyles);
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      style={[s.cta, pill && s.pill, disabled && s.ctaDisabled]}
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Text style={s.ctaText}>{label}</Text>
    </PressScale>
  );
}

export function Secondary({ label, icon, onPress, disabled, pill }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; pill?: boolean }) {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      style={[s.secondary, pill && s.outlinePill, disabled && s.ctaDisabled]}
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      {icon ? <Ionicons name={icon} size={18} color={c.ink} /> : null}
      <Text style={s.secondaryText}>{label}</Text>
    </PressScale>
  );
}

export function TextButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const s = useThemedStyles(deleteStyles);
  return (
    <PressScale onPress={onPress} disabled={disabled} style={s.textBtn} accessibilityLabel={label} pressedScale={0.98}>
      <Text style={s.textBtnLabel}>{label}</Text>
    </PressScale>
  );
}

export function BackRow({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  return (
    <PressScale onPress={onPress} style={s.backRow} accessibilityLabel={label} pressedScale={0.98}>
      <Ionicons name="chevron-back" size={24} color={c.ink} />
      {label ? <Text style={s.backText}>{label}</Text> : null}
    </PressScale>
  );
}

export function OrDivider() {
  const s = useThemedStyles(deleteStyles);
  return (
    <View style={s.orRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.orLine} />
      <Text style={s.orText}>OR</Text>
      <View style={s.orLine} />
    </View>
  );
}

export function ErrorLine({ text }: { text?: string | null }) {
  const s = useThemedStyles(deleteStyles);
  if (!text) return null;
  return (
    <Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

export function PasswordField({ value, onChange, onSubmit, editable = true }: { value: string; onChange: (v: string) => void; onSubmit: () => void; editable?: boolean }) {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  const [show, setShow] = useState(false);
  return (
    <View style={s.field}>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        editable={editable}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        placeholder="Password"
        placeholderTextColor={c.muted}
        returnKeyType="done"
        accessibilityLabel="Password"
        autoFocus
      />
      <PressScale onPress={() => setShow((v) => !v)} style={s.eye} accessibilityLabel={show ? 'Hide password' : 'Show password'} pressedScale={0.9}>
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.muted} />
      </PressScale>
    </View>
  );
}

/** Seconds left until `retryAt`, recomputed every second and when the app returns to the foreground. */
export function useCountdown(retryAt: number | null) {
  const [left, setLeft] = useState(() => (retryAt ? secondsLeft(retryAt) : 0));
  useEffect(() => {
    if (!retryAt) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(secondsLeft(retryAt));
    tick();
    const timer = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && tick());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [retryAt]);
  return left;
}

/** C6 ring: accent arc on a sand track with mm:ss. Static (no animation) under Reduce Motion. */
export function CountdownRing({ left, total }: { left: number; total: number }) {
  const s = useThemedStyles(deleteStyles);
  const c = useColors();
  const reduceMotion = useReducedMotion();
  const size = 168;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const minute = Math.ceil(left / 60);
  useEffect(() => {
    // Announce once per minute, not every second.
    if (left > 0) AccessibilityInfo.announceForAccessibility(`You can try again in ${minute} minute${minute === 1 ? '' : 's'}.`);
  }, [minute]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={s.ringWrap} accessibilityRole="timer" accessibilityLabel={`Try again in ${mmss(left)}`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.sand} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={reduceMotion ? 0 : circ * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={s.ringText}>{mmss(left)}</Text>
    </View>
  );
}

/** Fresh Google sign-in for re-auth: signOut first so the picker shows and the idToken is new. */
export async function freshGoogleIdToken(): Promise<string | null> {
  let mod: typeof import('@react-native-google-signin/google-signin');
  try {
    mod = await import('@react-native-google-signin/google-signin');
  } catch {
    throw new Error('Google sign-in needs a fresh Android build.');
  }
  const { GoogleSignin } = mod;
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices();
  try {
    await GoogleSignin.signOut();
  } catch {
    /* not signed in on this device */
  }
  const result = await GoogleSignin.signIn();
  if (result.type === 'cancelled') return null;
  const idToken = result.data?.idToken;
  if (!idToken) throw new Error('Google did not return a sign-in token.');
  return idToken;
}
