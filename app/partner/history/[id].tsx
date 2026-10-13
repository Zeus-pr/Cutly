import { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/components/BackButton';
import { PressScale } from '@/components/PressScale';
import { ListRowsSkeleton } from '@/components/Skeleton';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { partnerApi, type PartnerHistoryItem } from '@/services/partner';
import { useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { formatDateTime, formatTime } from '@/utils/time';

export default function PartnerHistoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useThemedStyles(detailStyles);
  const [item, setItem] = useState<PartnerHistoryItem | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setLoading(true);
      setError('');
      partnerApi
        .history()
        .then((res) => {
          if (!live) return;
          const found = res.items.find((row) => row.id === id) || null;
          setItem(found);
          if (!found) setError('Visit not found.');
        })
        .catch((err) => {
          if (!live) return;
          setError(err instanceof Error ? err.message : 'Could not load visit.');
        })
        .finally(() => {
          if (live) setLoading(false);
        });
      return () => {
        live = false;
      };
    }, [id])
  );

  const missed =
    item?.status === 'EXPIRED' || item?.status === 'NO_SHOW' || item?.status === 'REJECTED';
  const accepted =
    item?.status === 'CONFIRMED' ||
    item?.status === 'ARRIVED' ||
    item?.status === 'IN_SERVICE' ||
    item?.status === 'COMPLETED';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <BackButton label="" onPress={() => router.back()} />
        <Text style={styles.topTitle}>Visit</Text>
        <View style={styles.topSpacer} />
      </View>

      {loading ? (
        <View style={styles.pad}>
          <ListRowsSkeleton count={3} />
        </View>
      ) : error || !item ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{error || 'Visit not found'}</Text>
          <PressScale style={styles.backLink} onPress={() => router.back()} haptic>
            <Text style={styles.backLinkText}>Back to history</Text>
          </PressScale>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <Text style={styles.name}>{item.name}</Text>
              <View
                style={[
                  styles.badge,
                  missed && styles.badgeMissed,
                  accepted && styles.badgeOk
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    missed && styles.badgeTextMissed,
                    accepted && styles.badgeTextOk
                  ]}
                >
                  {item.statusLabel}
                </Text>
              </View>
            </View>
            <Text style={styles.code}>{item.bookingCode}</Text>
          </View>

          <View style={styles.card}>
            <Row label="Service" value={item.service} styles={styles} />
            <Row label="Staff" value={item.barberName} styles={styles} />
            <Row label="Starts" value={formatDateTime(item.startsAt)} styles={styles} />
            <Row
              label="Ends"
              value={`${formatTime(item.endsAt)}`}
              styles={styles}
              last
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment</Text>
            <Row
              label="Total"
              value={formatINR(item.totalPaise ?? item.advancePaise)}
              styles={styles}
            />
            {typeof item.collectedPaise === 'number' ? (
              <Row label="Collected" value={formatINR(item.collectedPaise)} styles={styles} />
            ) : null}
            {typeof item.remainingPaise === 'number' && item.remainingPaise > 0 ? (
              <Row label="Remaining" value={formatINR(item.remainingPaise)} styles={styles} />
            ) : null}
            <Row
              label="Status"
              value={
                item.paymentStatus === 'REFUNDED'
                  ? 'Refunded'
                  : item.paymentStatus === 'CAPTURED'
                    ? 'Captured'
                    : item.paymentStatus || '—'
              }
              styles={styles}
              last
            />
          </View>

          {item.phone ? (
            <PressScale
              style={styles.callBtn}
              onPress={() => void Linking.openURL(`tel:${item.phone}`)}
              haptic
            >
              <Text style={styles.callBtnText}>Call {item.phone}</Text>
            </PressScale>
          ) : (
            <Text style={styles.noPhone}>No phone on file</Text>
          )}

          {(item.status === 'CANCELLED' ||
            item.status === 'REJECTED' ||
            item.paymentStatus === 'REFUNDED') && (
            <Text style={styles.policy}>
              Cancel free until 12 hours before a confirmed visit. The bill is paid at the shop.
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  styles,
  last
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof detailStyles>;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function detailStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm
    },
    topTitle: {
      ...typography.heading,
      color: colors.ink,
      flex: 1,
      textAlign: 'center',
      fontSize: 18
    },
    topSpacer: { width: 40 },
    pad: { padding: spacing.md },
    content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
    empty: { paddingTop: 80, alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
    emptyTitle: { ...typography.heading, color: colors.ink },
    backLink: {
      marginTop: spacing.sm,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: radii.pill,
      backgroundColor: colors.accent
    },
    backLinkText: { fontFamily: fontFamily.semibold, color: colors.white },
    hero: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 8
    },
    heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    name: {
      fontFamily: fontFamily.bold,
      fontSize: 26,
      lineHeight: 30,
      letterSpacing: -0.4,
      color: colors.ink,
      flex: 1
    },
    badge: {
      backgroundColor: colors.sand,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    badgeMissed: { backgroundColor: 'rgba(180,35,24,0.12)' },
    badgeOk: { backgroundColor: 'rgba(240,107,85,0.14)' },
    badgeText: { fontFamily: fontFamily.semibold, fontSize: 11, color: colors.ink },
    badgeTextMissed: { color: colors.danger },
    badgeTextOk: { color: colors.accentDark },
    code: { ...typography.caption, color: colors.muted, letterSpacing: 0.4 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.line
    },
    cardTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      paddingTop: spacing.md,
      paddingBottom: 4
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { ...typography.body, color: colors.muted, flexShrink: 0 },
    rowValue: {
      fontFamily: fontFamily.medium,
      fontSize: 15,
      color: colors.ink,
      textAlign: 'right',
      flex: 1
    },
    callBtn: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingVertical: 16,
      alignItems: 'center'
    },
    callBtnText: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.white },
    noPhone: { ...typography.caption, color: colors.muted, textAlign: 'center' },
    policy: { ...typography.caption, color: colors.muted, lineHeight: 18 }
  });
}
