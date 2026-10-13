import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { type Palette, spacing, typography } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { formatDateLong, formatTime } from '@/utils/time';

export default function Confirmed() {
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const p = useLocalSearchParams<{
    startsAt: string;
    shopName: string;
    serviceName: string;
    barberName: string;
    total: string;
    advance: string;
    testMode?: string;
    awaitingShop?: string;
  }>();
  const testMode = p.testMode === '1';
  const awaiting = p.awaitingShop === '1';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.check}>
          <Text style={styles.checkText}>✓</Text>
        </View>
        <Text style={styles.eyebrow}>
          {awaiting
            ? testMode
              ? 'PAYMENT CONFIRMED · AWAITING SHOP'
              : 'AWAITING SHOP CONFIRMATION'
            : testMode
              ? 'TEST BOOKING CONFIRMED'
              : 'BOOKING CONFIRMED'}
        </Text>
        <Text style={styles.title}>{awaiting ? 'Request sent.' : "You're booked."}</Text>
        <Text style={styles.sub}>
          {awaiting
            ? `${p.shopName} must accept before your slot starts. We’ll notify you if it’s confirmed, rejected, or missed.`
            : `Your time is booked at ${p.shopName}.`}
        </Text>
        <View style={styles.card}>
          <Text style={styles.date}>{formatDateLong(p.startsAt)}</Text>
          <Text style={styles.time}>{formatTime(p.startsAt)}</Text>
          <Text style={styles.line}>
            {p.serviceName} · {p.barberName}
          </Text>
          <Text style={styles.line}>
            {formatINR(Number(p.total))} at the shop
          </Text>
        </View>
        <View style={styles.spacer} />
        <PrimaryButton label="View my bookings" onPress={() => router.replace('/(tabs)/bookings')} />
        <Text style={styles.directions}>Get directions  →</Text>
      </View>
    </SafeAreaView>
  );
}

function screenStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { flex: 1, padding: spacing.xl, alignItems: 'center', paddingTop: 90 },
    check: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    checkText: { fontSize: 42, fontWeight: '800', color: colors.white },
    eyebrow: { ...typography.caption, color: colors.accent, letterSpacing: 1.2, marginTop: spacing.xl },
    title: { ...typography.display, color: colors.ink, marginTop: spacing.sm },
    sub: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
    testNote: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: spacing.sm
    },
    card: { width: '100%', backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, marginTop: spacing.xl },
    date: { ...typography.heading, color: colors.ink },
    time: { fontSize: 30, fontWeight: '800', color: colors.ink, marginVertical: spacing.md },
    line: { ...typography.body, color: colors.muted, marginTop: 4 },
    spacer: { flex: 1 },
    directions: { ...typography.body, color: colors.accent, fontWeight: '800', marginTop: spacing.lg }
  });
}
