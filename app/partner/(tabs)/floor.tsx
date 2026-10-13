import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CodeSlots } from '@/components/CodeSlots';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import { ListRowsSkeleton, SlotGridSkeleton } from '@/components/Skeleton';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { getApiBaseUrl } from '@/services/apiBase';
import { partnerApi, type FloorVisit, type PartnerBarber } from '@/services/partner';
import { appConfirm } from '@/store/useDialogStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { formatTime, todayKeyIST } from '@/utils/time';
import type { AvailabilitySlot } from '@/types/domain';
import { Ionicons } from '@expo/vector-icons';

const WALK_DURATIONS = [15, 30, 45, 60] as const;

export default function PartnerFloor() {
  const colors = useColors();
  const styles = useThemedStyles(floorStyles);
  const [chairCount, setChairCount] = useState(1);
  const [chairs, setChairs] = useState(1);
  const [workers, setWorkers] = useState(1);
  const [staff, setStaff] = useState<PartnerBarber[]>([]);
  const [visits, setVisits] = useState<FloorVisit[]>([]);
  const [floorLoading, setFloorLoading] = useState(true);
  const [walkBarberId, setWalkBarberId] = useState('');
  const [walkMinutes, setWalkMinutes] = useState<(typeof WALK_DURATIONS)[number]>(30);
  const [walkName, setWalkName] = useState('');
  const [walkBusy, setWalkBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rescheduleVisit, setRescheduleVisit] = useState<FloorVisit | null>(null);
  const [pinVisit, setPinVisit] = useState<FloorVisit | null>(null);
  const [pinDigits, setPinDigits] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    partnerApi
      .dashboard()
      .then((board) => {
        if (!live || !board.shop) return;
        setChairCount(board.shop.chairCount);
        setChairs(board.shop.today.chairsInUse);
        setWorkers(board.shop.today.workersPresent);
        setShopId(board.shop.id);
        const barbers = board.shop.barbers || [];
        setStaff(barbers);
        setVisits(board.visits || []);
        setWalkBarberId((current) => current || barbers[0]?.id || '');
        setFloorLoading(false);
      })
      .catch((err) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : 'Could not load the floor.');
        setFloorLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      return load();
    }, [load])
  );

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    setDone(true);
    try {
      await partnerApi.floor(Math.min(workers, chairs), chairs);
      if (staff.length) {
        await partnerApi.barbers(
          staff.map((row) => ({
            ...(row.id ? { id: row.id } : {}),
            name: row.name
          }))
        );
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
      load();
    } catch (err) {
      setDone(false);
      setError(err instanceof Error ? err.message : 'Could not save.');
      setBusy(false);
    }
  }

  async function addWalkIn() {
    if (!walkBarberId) {
      setError('Pick a staff member for the walk-in.');
      return;
    }
    setWalkBusy(true);
    setError('');
    try {
      const visit = await partnerApi.createWalkIn({
        barberId: walkBarberId,
        durationMinutes: walkMinutes,
        guestName: walkName.trim() || undefined
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWalkName('');
      setVisits((list) => [...list, visit].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add walk-in.');
    } finally {
      setWalkBusy(false);
    }
  }

  async function setStatus(visit: FloorVisit, status: FloorVisit['actions'][number]['to']) {
    if (status === 'IN_SERVICE' && (visit.kind || 'booking') === 'booking') {
      setPinVisit(visit);
      setPinDigits('');
      setError('');
      return;
    }
    if (status === 'NO_SHOW' && !visit.canNoShow) {
      setError('No-show unlocks 5 minutes after the appointment start.');
      return;
    }
    setStatusBusyId(visit.id);
    setError('');
    try {
      const kind = visit.kind || 'booking';
      const next =
        kind === 'walkin'
          ? await partnerApi.setWalkInStatus(visit.id, status as 'COMPLETED' | 'CANCELLED')
          : await partnerApi.setBookingStatus(
              visit.id,
              status as 'COMPLETED' | 'NO_SHOW'
            );
      void Haptics.selectionAsync();
      setVisits((list) => {
        if (
          next.status === 'COMPLETED' ||
          next.status === 'NO_SHOW' ||
          next.status === 'CANCELLED'
        ) {
          return list.filter((row) => row.id !== visit.id);
        }
        return list.map((row) => (row.id === visit.id ? next : row));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update status.');
    } finally {
      setStatusBusyId(null);
    }
  }

  function completeVisit(visit: FloorVisit) {
    const due = visit.remainingPaise || 0;
    if (due <= 0) {
      void setStatus(visit, 'COMPLETED');
      return;
    }
    appConfirm({
      title: 'Complete visit?',
      message: `Collect ${formatINR(due)} at the shop and mark done. Remaining clears and today’s revenue updates.`,
      cancelLabel: 'Not yet',
      confirmLabel: `Done · ${formatINR(due)}`,
      onConfirm: () => void setStatus(visit, 'COMPLETED')
    });
  }

  async function submitStartPin() {
    if (!pinVisit) return;
    const code = pinDigits.trim();
    if (!/^\d{4}$/.test(code)) {
      setError('Enter the 4-digit visit code from the customer.');
      return;
    }
    setStatusBusyId(pinVisit.id);
    setError('');
    try {
      const next = await partnerApi.startBookingWithPin(pinVisit.id, code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisits((list) => list.map((row) => (row.id === next.id ? next : row)));
      setPinVisit(null);
      setPinDigits('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start service.');
    } finally {
      setStatusBusyId(null);
    }
  }

  function callCustomer(phone: string | null) {
    if (!phone) {
      setError('Customer has no phone number on file.');
      return;
    }
    void Linking.openURL(`tel:${phone}`);
  }

  async function openReschedule(visit: FloorVisit) {
    if (!visit.canReschedule) {
      setError('Reschedule unlocks 5 minutes after start — call the customer first.');
      return;
    }
    if (!visit.serviceId || !shopId) {
      setError('Missing service for this visit.');
      return;
    }
    setRescheduleVisit(visit);
    setSlots([]);
    setSlotsLoading(true);
    setError('');
    try {
      const base = getApiBaseUrl();
      const date = todayKeyIST();
      const response = await fetch(
        `${base}/shops/${shopId}/availability?serviceId=${encodeURIComponent(visit.serviceId)}&date=${date}&barberId=${encodeURIComponent(visit.barberId)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not load slots.');
      setSlots(((payload.data || []) as AvailabilitySlot[]).filter((slot) => slot.available));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load slots.');
      setRescheduleVisit(null);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function pickSlot(slot: AvailabilitySlot) {
    if (!rescheduleVisit) return;
    setStatusBusyId(rescheduleVisit.id);
    try {
      const next = await partnerApi.rescheduleBooking(rescheduleVisit.id, {
        startsAt: slot.start,
        barberId: slot.barberId || rescheduleVisit.barberId
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisits((list) => list.map((row) => (row.id === next.id ? next : row)));
      setRescheduleVisit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reschedule.');
    } finally {
      setStatusBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Today</Text>
            <Text style={styles.title}>Floor</Text>
            <Text style={styles.body}>See who is coming in and welcome them with a code.</Text>
          </View>
          <PressScale
            onPress={() => router.push('/partner/settings')}
            style={styles.settingsBtn}
            accessibilityLabel="Shop settings"
            haptic
          >
            <Ionicons name="options-outline" size={18} color={colors.ink} />
            <Text style={styles.settingsText}>Shop settings</Text>
          </PressScale>
        </View>

        <Text style={styles.label}>Add walk-in</Text>
        <Text style={styles.hint}>Starts now and blocks that staff’s slots for customers.</Text>
        <TextInput
          value={walkName}
          onChangeText={setWalkName}
          placeholder="Guest name (optional)"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <View style={styles.chips}>
          {staff.map((row) => (
            <PressScale
              key={row.id}
              style={[styles.chip, walkBarberId === row.id && styles.chipOn]}
              onPress={() => setWalkBarberId(row.id)}
              selected={walkBarberId === row.id}
              haptic
            >
              <Text style={[styles.chipText, walkBarberId === row.id && styles.chipTextOn]}>{row.name}</Text>
            </PressScale>
          ))}
        </View>
        <View style={styles.chips}>
          {WALK_DURATIONS.map((mins) => (
            <PressScale
              key={mins}
              style={[styles.chip, walkMinutes === mins && styles.chipOn]}
              onPress={() => setWalkMinutes(mins)}
              selected={walkMinutes === mins}
              haptic
            >
              <Text style={[styles.chipText, walkMinutes === mins && styles.chipTextOn]}>{mins}m</Text>
            </PressScale>
          ))}
        </View>
        <PressScale
          style={[styles.button, walkBusy && styles.buttonBusy]}
          onPress={() => void addWalkIn()}
          disabled={walkBusy}
          haptic
        >
          <Text style={styles.buttonText}>{walkBusy ? 'Seating…' : 'Seat walk-in'}</Text>
        </PressScale>

        <Text style={styles.sectionTitle}>Live visits</Text>
        {floorLoading ? (
          <ListRowsSkeleton count={2} />
        ) : visits.length === 0 ? (
          <Text style={styles.hint}>No active bookings or walk-ins on the floor right now.</Text>
        ) : (
          visits.map((visit) => {
            const kind = visit.kind || 'booking';
            const statusLabel =
              kind === 'walkin' ? 'Walk-in' : visit.status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
            const startAction = visit.actions.find((a) => a.to === 'IN_SERVICE');
            const doneAction = visit.actions.find((a) => a.to === 'COMPLETED');
            const otherActions = visit.actions.filter((a) => a.to !== 'IN_SERVICE' && a.to !== 'COMPLETED');
            const due = kind === 'booking' ? visit.remainingPaise || 0 : 0;
            const primaryStart = Boolean(startAction);
            const primaryDone = !primaryStart && Boolean(doneAction);
            const busyHere = statusBusyId === visit.id;

            return (
              <View key={`${kind}-${visit.id}`} style={styles.visit}>
                <View style={styles.visitTop}>
                  <View style={styles.visitCopy}>
                    <Text style={styles.visitName}>{visit.name}</Text>
                    <Text style={styles.visitMeta}>
                      {visit.service} · {formatTime(visit.startsAt)} · {visit.barberName}
                    </Text>
                    <Text style={styles.visitCode}>{visit.bookingCode}</Text>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{statusLabel}</Text>
                  </View>
                </View>

                {kind === 'booking' && due > 0 ? (
                  <View style={styles.dueChip}>
                    <Text style={styles.dueChipText}>
                      Due {formatINR(due)} · pay at shop
                    </Text>
                  </View>
                ) : null}
                {kind === 'booking' && visit.balanceSettled ? (
                  <Text style={styles.balanceOk}>Balance settled</Text>
                ) : null}

                <View style={styles.primaryRow}>
                  {primaryStart ? (
                    <PressScale
                      style={[styles.primaryBtn, busyHere && styles.buttonBusy]}
                      disabled={busyHere}
                      onPress={() => void setStatus(visit, 'IN_SERVICE')}
                      haptic
                    >
                      <Text style={styles.primaryBtnText}>{busyHere ? '…' : 'Start with code'}</Text>
                    </PressScale>
                  ) : null}
                  {primaryDone ? (
                    <PressScale
                      style={[styles.primaryBtn, busyHere && styles.buttonBusy]}
                      disabled={busyHere}
                      onPress={() => completeVisit(visit)}
                      haptic
                    >
                      <Text style={styles.primaryBtnText}>
                        {busyHere ? '…' : due > 0 ? `Done · ${formatINR(due)}` : 'Done'}
                      </Text>
                    </PressScale>
                  ) : null}
                  {kind === 'booking' ? (
                    <PressScale
                      style={[styles.callSideBtn, !visit.phone && styles.visitBtnDisabled]}
                      disabled={!visit.phone}
                      onPress={() => callCustomer(visit.phone)}
                      haptic
                    >
                      <Text style={styles.callSideBtnText}>Call</Text>
                    </PressScale>
                  ) : null}
                </View>

                <View style={styles.secondaryRow}>
                  {otherActions.map((action) => {
                    const noShowLocked = action.to === 'NO_SHOW' && !visit.canNoShow;
                    const isCancel = action.to === 'CANCELLED' || action.to === 'NO_SHOW';
                    const label =
                      action.to === 'CANCELLED'
                        ? 'Cancel'
                        : action.to === 'NO_SHOW'
                          ? noShowLocked
                            ? 'No-show'
                            : 'No-show'
                          : action.label;
                    return (
                      <PressScale
                        key={action.to}
                        style={[
                          styles.secondaryBtn,
                          isCancel && styles.secondaryBtnWarn,
                          (busyHere || noShowLocked) && styles.visitBtnDisabled
                        ]}
                        disabled={busyHere || noShowLocked}
                        onPress={() => void setStatus(visit, action.to)}
                        haptic
                      >
                        <Text
                          style={[
                            styles.secondaryBtnText,
                            isCancel && styles.secondaryBtnTextWarn
                          ]}
                        >
                          {label}
                        </Text>
                        {noShowLocked ? (
                          <Text style={styles.secondaryHint}>after +5m</Text>
                        ) : null}
                      </PressScale>
                    );
                  })}
                  {kind === 'booking' &&
                  (visit.status === 'CONFIRMED' || visit.status === 'ARRIVED') ? (
                    <PressScale
                      style={[
                        styles.secondaryBtn,
                        (busyHere || !visit.canReschedule) && styles.visitBtnDisabled
                      ]}
                      disabled={busyHere || !visit.canReschedule}
                      onPress={() => void openReschedule(visit)}
                      haptic
                    >
                      <Text style={styles.secondaryBtnText}>Reschedule</Text>
                      {!visit.canReschedule ? (
                        <Text style={styles.secondaryHint}>after +5m</Text>
                      ) : null}
                    </PressScale>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        <Text style={styles.label}>Seats in use, of {chairCount}</Text>
        <Stepper
          value={chairs}
          max={chairCount}
          onChange={(value) => {
            setChairs(value);
            setWorkers((count) => Math.min(count, value));
          }}
        />
        <Text style={styles.label}>Workers in today</Text>
        <Stepper value={workers} max={chairs} onChange={setWorkers} />
        {workers === 0 ? (
          <Text style={styles.warn}>
            0 workers = day closed for new bookings and walk-ins. Confirmed visits stay; raise workers to reopen.
          </Text>
        ) : (
          <Text style={styles.hint}>Open seats today = min(workers, seats). Set 0 to stop new bookings.</Text>
        )}

        <Text style={styles.label}>Staff on the floor</Text>
        <Text style={styles.hint}>Add, rename, or remove staff. Capacity still follows workers × seats.</Text>
        {staff.map((row, index) => (
          <View key={row.id || `new-${index}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={row.name}
              onChangeText={(name) =>
                setStaff((list) => list.map((item, i) => (i === index ? { ...item, name } : item)))
              }
              placeholder="Staff name"
              placeholderTextColor={colors.muted}
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable
              onPress={() => {
                if (staff.length <= 1) {
                  setError('Keep at least one staff member.');
                  return;
                }
                setStaff((list) => list.filter((_, i) => i !== index));
              }}
              hitSlop={8}
              accessibilityLabel={`Remove ${row.name}`}
            >
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <Pressable
          onPress={() => setStaff((list) => [...list, { id: '', name: `Staff ${list.length + 1}`, rating: null }])}
          style={{ marginBottom: spacing.md }}
        >
          <Text style={{ color: colors.accentDark, fontWeight: '700' }}>+ Add staff</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={() => void save()} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save capacity & staff'}</Text>
        </Pressable>
      </ScrollView>
      <SuccessOverlay
        visible={done}
        ready={saved}
        label="Floor updated"
        onDone={() => {
          setBusy(false);
          setDone(false);
          setSaved(false);
        }}
      />
      <Modal visible={Boolean(rescheduleVisit)} animationType="slide" transparent onRequestClose={() => setRescheduleVisit(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.label}>Reschedule today</Text>
            <Text style={styles.hint}>
              {rescheduleVisit ? `${rescheduleVisit.name} · call first, then pick a new slot (auto-confirmed).` : ''}
            </Text>
            {slotsLoading ? <SlotGridSkeleton count={6} /> : null}
            {!slotsLoading && slots.length === 0 ? <Text style={styles.hint}>No open slots left today.</Text> : null}
            <ScrollView style={styles.slotList}>
              {slots.map((slot) => (
                <Pressable key={slot.start} style={styles.slotBtn} onPress={() => void pickSlot(slot)}>
                  <Text style={styles.slotText}>{formatTime(slot.start)}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.button} onPress={() => setRescheduleVisit(null)}>
              <Text style={styles.buttonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(pinVisit)}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setPinVisit(null);
          setPinDigits('');
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <Pressable
            style={styles.pinBackdrop}
            onPress={() => {
              setPinVisit(null);
              setPinDigits('');
              setError('');
            }}
          />
          <View style={styles.pinSheet}>
            <View style={styles.pinGrab} />
            <Text style={styles.pinTitle}>Visit code</Text>
            <Text style={styles.pinBody}>
              {pinVisit
                ? `Ask ${pinVisit.name} for their 4-digit CutLy code to check them in and start the visit.`
                : ''}
            </Text>
            <View style={styles.pinSlots}>
              <CodeSlots
                length={4}
                value={pinDigits}
                onChange={setPinDigits}
                accentDigits
                autoFocus={Boolean(pinVisit)}
                disabled={statusBusyId === pinVisit?.id}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PressScale
              style={[
                styles.pinStartBtn,
                (statusBusyId === pinVisit?.id || pinDigits.length !== 4) && styles.buttonBusy
              ]}
              onPress={() => void submitStartPin()}
              disabled={statusBusyId === pinVisit?.id || pinDigits.length !== 4}
              haptic
            >
              <Text style={styles.primaryBtnText}>
                {statusBusyId === pinVisit?.id ? 'Starting…' : 'Start service'}
              </Text>
            </PressScale>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (value: number) => void }) {
  const styles = useThemedStyles(floorStyles);
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.step}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(Math.max(0, value - 1));
        }}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.count}>{value}</Text>
      <Pressable
        style={styles.step}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(Math.min(max, value + 1));
        }}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

function floorStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.lg, paddingBottom: 40, gap: spacing.md },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    headerCopy: { flex: 1, gap: 4 },
    settingsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.line,
      marginTop: 4
    },
    settingsText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
    kicker: { ...typography.caption, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1 },
    title: { ...typography.display, color: colors.ink },
    body: { ...typography.body, color: colors.muted },
    label: { ...typography.heading, color: colors.ink, marginTop: spacing.sm },
    sectionTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 15,
      color: colors.ink,
      marginTop: spacing.sm
    },
    hint: { ...typography.caption, color: colors.muted, marginTop: -6 },
    warn: {
      ...typography.caption,
      color: colors.warning,
      marginTop: -4,
      fontWeight: '600'
    },
    chips: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    chip: {
      flex: 1,
      minHeight: 44,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center'
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.ink,
      textAlign: 'center'
    },
    chipTextOn: { color: colors.white },
    visit: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.line
    },
    visitTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'flex-start' },
    visitCopy: { flex: 1, gap: 3 },
    visitName: { fontFamily: fontFamily.semibold, fontSize: 16, color: colors.ink },
    statusPill: {
      backgroundColor: colors.sand,
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    statusPillText: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      color: colors.ink
    },
    visitMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.muted, lineHeight: 17 },
    visitCode: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.muted, letterSpacing: 0.3 },
    dueChip: {
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(196,138,18,0.12)',
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    dueChipText: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      color: colors.warning
    },
    balanceOk: { ...typography.caption, color: colors.success, fontWeight: '700' },
    primaryRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 2 },
    primaryBtn: {
      flex: 1,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%'
    },
    primaryBtnText: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.white
    },
    callSideBtn: {
      borderRadius: radii.pill,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 72
    },
    callSideBtnText: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.ink
    },
    secondaryRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8
    },
    secondaryBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: radii.pill,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1
    },
    secondaryBtnWarn: {
      borderColor: 'rgba(180,35,24,0.28)',
      backgroundColor: 'rgba(180,35,24,0.06)'
    },
    secondaryBtnText: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.ink
    },
    secondaryBtnTextWarn: {
      color: colors.danger
    },
    secondaryHint: {
      fontFamily: fontFamily.regular,
      fontSize: 10,
      color: colors.muted
    },
    visitBtnDisabled: { opacity: 0.45 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(23,38,60,0.45)',
      justifyContent: 'flex-end'
    },
    modalAvoid: { flex: 1, justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: spacing.lg,
      gap: spacing.sm,
      maxHeight: '70%'
    },
    pinBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(23,38,60,0.4)'
    },
    pinSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      gap: spacing.sm
    },
    pinGrab: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.sand,
      marginBottom: 8
    },
    pinTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 18,
      color: colors.ink
    },
    pinBody: {
      ...typography.body,
      color: colors.muted,
      fontSize: 14,
      lineHeight: 20
    },
    pinSlots: {
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md
    },
    pinStartBtn: {
      marginTop: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingVertical: 16,
      alignItems: 'center'
    },
    slotList: { maxHeight: 260 },
    slotBtn: {
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.line
    },
    slotText: { ...typography.heading, color: colors.ink, fontSize: 16 },
    input: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      color: colors.ink,
      ...typography.body
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    step: {
      width: 48,
      height: 48,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    stepText: { fontSize: 28, color: colors.ink, fontWeight: '600' },
    count: { ...typography.title, color: colors.ink, minWidth: 40, textAlign: 'center' },
    button: {
      marginTop: spacing.sm,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingVertical: 16,
      alignItems: 'center'
    },
    buttonBusy: { opacity: 0.7 },
    buttonText: { ...typography.heading, color: colors.white },
    error: { ...typography.body, color: colors.danger }
  });
}
