import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '@/components/BackButton';
import { ListRowsSkeleton } from '@/components/Skeleton';
import { SlideToAction } from '@/components/SlideToAction';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { alertNewShopRequests, registerPartnerPushNotifications } from '@/services/notifications';
import { partnerApi, type BookingRequest } from '@/services/partner';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { formatDateTime } from '@/utils/time';

export default function PartnerRequests() {
  const colors = useColors();
  const styles = useThemedStyles(requestStyles);
  const [items, setItems] = useState<BookingRequest[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [sliding, setSliding] = useState(false);

  const load = useCallback(async (mode: 'focus' | 'refresh' | 'poll' = 'focus') => {
    if (mode === 'refresh') setRefreshing(true);
    else if (mode === 'focus') setLoading(true);
    if (mode !== 'poll') setError('');
    try {
      if (mode === 'focus') void registerPartnerPushNotifications();
      const next = await partnerApi.requests();
      setItems(next.items);
      // Local sound when a new request appears (covers missing remote push token).
      void alertNewShopRequests(next.items);
    } catch (err) {
      if (mode !== 'poll') setError(err instanceof Error ? err.message : 'Could not load requests.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('focus');
      // Auto-refresh so partner does not need pull-to-refresh when requests arrive (push + poll).
      const timer = setInterval(() => {
        void load('poll');
      }, 8_000);
      return () => clearInterval(timer);
    }, [load])
  );

  async function respond(request: BookingRequest, decision: 'ACCEPT' | 'REJECT') {
    if (busyId || exitingId) return;
    setBusyId(request.id);
    setError('');
    try {
      await partnerApi.respondToRequest(request.id, decision);
      setExitingId(request.id);
      setTimeout(() => {
        setItems((list) => list.filter((row) => row.id !== request.id));
        setExitingId(null);
        setBusyId(null);
      }, 320);
    } catch (err) {
      setBusyId(null);
      setError(err instanceof Error ? err.message : 'Could not update request.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <BackButton label="" />
        <Text style={styles.title}>Requests</Text>
        <View style={styles.backSpacer} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        scrollEnabled={!sliding}
        // Avoid horizontal bounce fighting the accept/reject slider.
        directionalLockEnabled
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            tintColor={colors.accent}
            enabled={!sliding}
          />
        }
        ListHeaderComponent={
          <Text style={styles.sub}>
            All pending appointments across days. Slide to accept or reject — decided cards leave this list.
          </Text>
        }
        ListEmptyComponent={
          loading ? (
            <ListRowsSkeleton count={3} />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{error ? 'Could not load' : 'No open requests'}</Text>
              <Text style={styles.emptyBody}>{error || 'New paid bookings land here until you decide.'}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <RequestCard
            item={item}
            leaving={exitingId === item.id}
            busy={busyId === item.id}
            onAccept={() => void respond(item, 'ACCEPT')}
            onReject={() => void respond(item, 'REJECT')}
            onDragChange={setSliding}
          />
        )}
      />
      {error && items.length ? <Text style={styles.error}>{error}</Text> : null}
    </SafeAreaView>
  );
}

function RequestCard({
  item,
  leaving,
  busy,
  onAccept,
  onReject,
  onDragChange
}: {
  item: BookingRequest;
  leaving: boolean;
  busy: boolean;
  onAccept: () => void;
  onReject: () => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const styles = useThemedStyles(requestStyles);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!leaving) return;
    Animated.timing(anim, { toValue: 0, duration: 280, useNativeDriver: true }).start();
  }, [leaving, anim]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: anim,
          transform: [
            {
              translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] })
            }
          ]
        }
      ]}
    >
      <Text style={styles.name}>{item.name}</Text>
      <Text style={styles.meta}>
        {item.service} · {item.barberName}
      </Text>
      <Text style={styles.when}>{formatDateTime(item.startsAt)}</Text>
      <Text style={styles.code}>
        {item.bookingCode} · {formatINR(item.advancePaise)} advance
      </Text>
      <Text style={styles.policy}>
        Reject → advance refunded to customer. Accept → they show a visit code on Floor. Customer cancel ≥12h before
        start also refunds; within 12h shop keeps the advance.
      </Text>
      <View style={styles.sliders}>
        <SlideToAction
          label="Slide to accept"
          tone="accept"
          disabled={busy}
          onComplete={onAccept}
          onDragChange={onDragChange}
        />
        <SlideToAction
          label="Slide to reject · refund"
          tone="reject"
          disabled={busy}
          onComplete={onReject}
          onDragChange={onDragChange}
        />
      </View>
    </Animated.View>
  );
}

function requestStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm
    },
    back: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface
    },
    backSpacer: { width: 40 },
    title: { ...typography.heading, color: colors.ink, flex: 1, textAlign: 'center', fontSize: 18 },
    content: { padding: spacing.md, paddingBottom: 40, flexGrow: 1, gap: spacing.sm },
    sub: { ...typography.body, color: colors.muted, marginBottom: spacing.sm },
    empty: { paddingTop: 80, alignItems: 'center', gap: spacing.sm },
    emptyTitle: { ...typography.heading, color: colors.ink },
    emptyBody: { ...typography.body, color: colors.muted, textAlign: 'center', maxWidth: 280 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.md,
      gap: 4,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: spacing.sm
    },
    name: { ...typography.heading, color: colors.ink },
    meta: { ...typography.body, color: colors.muted },
    when: { ...typography.body, color: colors.ink, fontWeight: '600' },
    code: { ...typography.caption, color: colors.muted },
    policy: { ...typography.caption, color: colors.muted, marginTop: spacing.sm, lineHeight: 18 },
    sliders: { gap: spacing.sm, marginTop: spacing.md },
    error: { color: colors.danger, padding: spacing.md }
  });
}
