import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CutlyWordmark } from '@/components/CutlyWordmark';
import { PartnerDashboardSkeleton } from '@/components/Skeleton';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import {
  alertNewShopRequests,
  getPushRegisterStatus,
  registerPartnerPushNotifications
} from '@/services/notifications';
import { ChoiceSheet } from '@/components/ChoiceSheet';
import { partnerApi, type PartnerDashboard } from '@/services/partner';
import { appAlert } from '@/store/useDialogStore';
import { isPartnerBookableNow, partnerAcceptingCopy } from '@/utils/partnerAccepting';
import { givenName, useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatTime } from '@/utils/time';

export default function PartnerHome() {
  const colors = useColors();
  const styles = useThemedStyles(homeStyles);
  const name = useSessionStore((state) => state.name);
  const [board, setBoard] = useState<PartnerDashboard | null>(null);
  const [error, setError] = useState('');
  const [pushHint, setPushHint] = useState('');
  const [loading, setLoading] = useState(true);
  const [acceptingBusy, setAcceptingBusy] = useState(false);
  const [closeSheetVisible, setCloseSheetVisible] = useState(false);
  const restoredNotice = useSessionStore((state) => state.restoredNotice);
  const setRestoredNotice = useSessionStore((state) => state.setRestoredNotice);

  const applyBoard = useCallback((next: PartnerDashboard) => {
    setBoard(next);
    void alertNewShopRequests(
      (next.requests || []).map((row) => ({
        id: row.id,
        bookingCode: row.bookingCode,
        service: row.service,
        startsAt: row.startsAt
      }))
    );
  }, []);

  const load = useCallback(() => {
    let live = true;
    void registerPartnerPushNotifications().then(() => {
      if (!live) return;
      const status = getPushRegisterStatus();
      if (!status.ok) {
        setPushHint(
          status.error ||
            'Alerts limited — keep Home open for request sounds until remote push is linked.'
        );
      } else {
        setPushHint('');
      }
    });
    partnerApi
      .dashboard()
      .then((next) => {
        if (!live) return;
        applyBoard(next);
        setLoading(false);
        setError('');
      })
      .catch((err) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : 'Could not load today.');
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [applyBoard]);

  useFocusEffect(
    useCallback(() => {
      const stop = load();
      const timer = setInterval(() => {
        partnerApi
          .dashboard()
          .then((next) => applyBoard(next))
          .catch(() => undefined);
      }, 8_000);
      return () => {
        stop();
        clearInterval(timer);
      };
    }, [load, applyBoard])
  );

  const shop = board?.shop;
  const accepting = shop ? isPartnerBookableNow(shop) : false;
  const acceptCopy = shop ? partnerAcceptingCopy(shop) : null;
  const requestCount = board?.requestCount ?? 0;
  const staffed = shop ? Math.min(shop.today.workersPresent, shop.today.chairsInUse) : 0;
  const maxHour = useMemo(() => Math.max(1, ...(board?.byHour.map((item) => item.count) || [0])), [board?.byHour]);
  const collected = Math.round((board?.revenuePaise || 0) / 100);
  const remaining = Math.round((board?.remainingPaise || 0) / 100);

  function setAccepting(next: boolean) {
    if (!shop || acceptingBusy) return;
    if (!next) {
      setCloseSheetVisible(true);
      return;
    }
    void applyAcceptingMode('open');
  }

  async function applyAcceptingMode(mode: 'open' | 'today' | 'temporary') {
    if (!shop || acceptingBusy) return;
    setAcceptingBusy(true);
    const optimistic =
      mode === 'open'
        ? { acceptingAppointments: true, acceptingPausedUntil: null as string | null }
        : mode === 'temporary'
          ? { acceptingAppointments: false, acceptingPausedUntil: null as string | null }
          : { acceptingAppointments: true, acceptingPausedUntil: new Date(Date.now() + 86_400_000).toISOString() };
    setBoard((prev) =>
      prev?.shop ? { ...prev, shop: { ...prev.shop, ...optimistic } } : prev
    );
    try {
      const updated = await partnerApi.setAcceptingAppointments(mode);
      setBoard((prev) => (prev ? { ...prev, shop: updated } : prev));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      void load();
      appAlert('Could not update', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setAcceptingBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !board ? (
          <PartnerDashboardSkeleton />
        ) : (
          <>
        <View style={styles.brandRow}>
          <CutlyWordmark partner />
          <Pressable style={styles.historyBtn} onPress={() => router.push('/partner/history')} hitSlop={8}>
            <Ionicons name="time-outline" size={18} color={colors.ink} />
            <Text style={styles.historyText}>History</Text>
          </Pressable>
        </View>
        {restoredNotice === 'partner' ? (
          <View style={styles.restoredBanner} accessibilityRole="alert">
            <Ionicons name="refresh-outline" size={20} color={colors.accent} />
            <View style={styles.restoredCopy}>
              <Text style={styles.restoredTitle}>Welcome back. Your account is restored.</Text>
              <Text style={styles.restoredBody}>Your shop is paused. Turn bookings back on when you’re ready.</Text>
            </View>
            <Pressable onPress={() => setRestoredNotice(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss">
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.headerText}>
          <Text style={styles.hello}>Good to see you, {givenName(name) || 'partner'}</Text>
          <Text style={styles.title}>{shop?.name || 'Your shop'}</Text>
          <Text style={styles.body}>{shop ? shop.address : 'Finish setup to open the floor.'}</Text>
        </View>

        {shop ? (
          <View style={[styles.acceptCard, !accepting && styles.acceptCardOff]}>
            <View style={styles.acceptCopy}>
              <Text style={styles.acceptKicker}>{acceptCopy?.kicker ?? 'Appointments'}</Text>
              <Text style={styles.acceptBody}>{acceptCopy?.body ?? ''}</Text>
            </View>
            <Switch
              value={accepting}
              onValueChange={setAccepting}
              disabled={acceptingBusy}
              trackColor={{ false: colors.sand, true: colors.accent }}
              thumbColor={colors.white}
              ios_backgroundColor={colors.sand}
              accessibilityLabel="Open for appointments"
            />
          </View>
        ) : null}

        <ChoiceSheet
          visible={closeSheetVisible}
          title="Close bookings"
          subtitle="Existing Floor visits keep running. Customers can still book other days when you choose “today only”."
          showCloseButton
          options={[
            {
              id: 'today',
              label: 'Close for today',
              subtitle: 'No new bookings until today’s closing time'
            },
            {
              id: 'temporary',
              label: 'Close temporary',
              subtitle: 'Stay closed until you turn appointments back on'
            }
          ]}
          onSelect={(id) => {
            if (id === 'today' || id === 'temporary') void applyAcceptingMode(id);
          }}
          onClose={() => setCloseSheetVisible(false)}
        />

        {pushHint ? (
          <Pressable
            style={styles.pushHint}
            onPress={() => {
              void registerPartnerPushNotifications().then(() => {
                const status = getPushRegisterStatus();
                setPushHint(status.ok ? '' : status.error || pushHint);
              });
            }}
          >
            <Ionicons name="notifications-outline" size={16} color={colors.ink} />
            <Text style={styles.pushHintText}>{pushHint}</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.requestsBtn} onPress={() => router.push('/partner/requests')}>
          <View style={styles.requestsCopy}>
            <Text style={styles.cardKicker}>Appointments</Text>
            <Text style={styles.cardTitle}>
              {requestCount ? `${requestCount} pending request${requestCount === 1 ? '' : 's'}` : 'No pending requests'}
            </Text>
            <Text style={styles.body}>Review accept / reject for every day.</Text>
          </View>
          <View style={styles.badgeWrap}>
            {requestCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{requestCount > 99 ? '99+' : String(requestCount)}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </View>
        </Pressable>

        <View style={styles.grid}>
          <Metric label="Today" value={String(board?.todayCount ?? 0)} />
          <Metric label="Waiting" value={String(board?.waiting ?? 0)} />
          <Metric label="In service" value={String(board?.inService ?? 0)} />
          <Metric label="Done" value={String(board?.done ?? 0)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>Bookings by hour</Text>
          <Text style={styles.cardTitle}>Today’s pace</Text>
          <View style={styles.chart}>
            {(board?.byHour || []).map((bucket) => {
              const height = Math.max(6, Math.round((bucket.count / maxHour) * 96));
              return (
                <View key={bucket.hour} style={styles.barCol}>
                  <View style={[styles.bar, { height }, bucket.count > 0 && styles.barOn]} />
                  <Text style={styles.barLabel}>{bucket.label}</Text>
                </View>
              );
            })}
          </View>
          {!board?.todayCount ? <Text style={styles.body}>Bars fill as bookings land through the day.</Text> : null}
        </View>

        <View style={styles.grid}>
          <Metric label="Collected" value={collected ? `₹${collected}` : '₹0'} />
          <Metric label="Remaining" value={remaining ? `₹${remaining}` : '₹0'} />
          <Metric label="Open seats" value={String(board?.openSlots ?? staffed)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{board?.next ? board.next.name : 'No one booked yet'}</Text>
          <Text style={styles.body}>
            {board?.next
              ? `${board.next.service} · ${formatTime(board.next.startsAt)}`
              : 'Accepted bookings show up here.'}
          </Text>
          {shop ? (
            <Text style={styles.body}>
              {staffed} of {shop.chairCount} seats staffed today
            </Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(homeStyles);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function homeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm
    },
    headerText: { gap: 2 },
    restoredBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderLeftWidth: 4,
      borderLeftColor: colors.accent,
      padding: spacing.md
    },
    restoredCopy: { flex: 1, gap: 2 },
    restoredTitle: { fontFamily: typography.display.fontFamily, fontSize: 15, color: colors.ink },
    restoredBody: { fontFamily: typography.body.fontFamily, fontSize: 14, lineHeight: 20, color: colors.muted },
    historyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.line
    },
    historyText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
    acceptCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.accent
    },
    acceptCardOff: {
      borderColor: colors.line,
      backgroundColor: colors.sand
    },
    acceptCopy: { flex: 1, gap: 4 },
    acceptKicker: { ...typography.heading, color: colors.ink, fontSize: 16 },
    acceptBody: { ...typography.caption, color: colors.muted },
    hello: { ...typography.body, color: colors.muted },
    title: { ...typography.title, color: colors.ink, fontSize: 28, letterSpacing: -0.5 },
    body: { ...typography.body, color: colors.muted },
    pushHint: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.sand,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.line
    },
    pushHintText: { ...typography.caption, color: colors.ink, flex: 1, fontWeight: '600' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    metric: { width: '48%', backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md },
    metricValue: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
    metricLabel: { ...typography.caption, color: colors.muted, marginTop: 4 },
    card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, gap: 8 },
    requestsBtn: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md
    },
    requestsCopy: { flex: 1, gap: 4 },
    badgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8
    },
    badgeText: { color: colors.white, fontWeight: '800', fontSize: 13 },
    cardKicker: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase'
    },
    cardTitle: { ...typography.heading, color: colors.ink, fontSize: 18 },
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 120,
      marginTop: spacing.sm,
      gap: 2
    },
    barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
    bar: { width: '70%', borderRadius: 6, backgroundColor: colors.line, minHeight: 6 },
    barOn: { backgroundColor: colors.accent },
    barLabel: { fontSize: 9, color: colors.muted, fontWeight: '600' },
    error: { color: colors.danger }
  });
}
