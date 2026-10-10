import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useFonts } from 'expo-font';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { partnerApi } from '@/services/partner';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

/** Partner sign-in only — new shops apply on the website, not in-app. */
export default function PartnerAuth() {
  const colors = useColors();
  const styles = useThemedStyles(authStyles);
  const reduceMotion = useReducedMotion();
  const [fonts] = useFonts({
    PoppinsExtraBold: require('@/assets/fonts/Poppins-ExtraBold.ttf')
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const shop = await partnerApi.signIn(email.trim(), password);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(shop?.setupDone ? '/partner/(tabs)' : '/partner/setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  function backToCustomer() {
    useSessionStore.getState().setAudience('customer');
    router.replace('/auth');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.glow} pointerEvents="none" />
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(380)} style={styles.form}>
        <Text style={styles.kicker}>Partner</Text>
        <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Sign in to your shop</Text>
        <Text style={styles.body}>Use the account ops created for your shop. New partners apply on the website.</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={submit} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Please wait…' : 'Sign in'}</Text>
        </Pressable>

        <Pressable style={styles.secondary} onPress={backToCustomer}>
          <Text style={styles.secondaryText}>Back to customer sign-in</Text>
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

function authStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas, padding: spacing.lg, justifyContent: 'center' },
    glow: {
      position: 'absolute',
      top: -60,
      left: -50,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: colors.accent,
      opacity: 0.07
    },
    form: { gap: spacing.md },
    kicker: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
      letterSpacing: 1.6,
      textTransform: 'uppercase'
    },
    title: { ...typography.display, color: colors.ink, fontSize: 30, lineHeight: 36, letterSpacing: -0.7 },
    body: { ...typography.body, color: colors.muted, marginBottom: spacing.xs },
    input: {
      backgroundColor: colors.surface,
      color: colors.ink,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 16,
      fontSize: 16
    },
    error: { color: colors.danger },
    button: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs
    },
    buttonBusy: { opacity: 0.7 },
    buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
    secondary: {
      height: 48,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    secondaryText: { color: colors.ink, fontWeight: '600', fontSize: 15 }
  });
}
