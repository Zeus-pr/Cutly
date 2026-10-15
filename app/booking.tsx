import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ChoiceSheet } from '@/components/ChoiceSheet';
import { PressScale } from '@/components/PressScale';
import { SlotGridSkeleton } from '@/components/Skeleton';
import { fontFamily } from '@/constants/fonts';
import { serviceBrowsePath } from '@/constants/serviceCategories';
import { type Palette, radii, spacing, typography } from '@/constants/theme';
import { api } from '@/services/api';
import { notifyAwaitingShop, registerForPushNotifications } from '@/services/notifications';
import { appAlert, appConfirm } from '@/store/useDialogStore';
import { useBookingCartStore } from '@/store/useBookingCartStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import type { AvailabilitySlot, Service } from '@/types/domain';
import { bookingIntentKey } from '@/utils/idempotency';
import { formatINR } from '@/utils/money';
import { bookingDayOptions, formatDayBanner, formatTime, isFutureStart, todayKeyIST } from '@/utils/time';
import { SUPPORT_WHATSAPP_URL } from '@/constants/support';

const SLOT_PREVIEW = 12;

const SUPPORT_URL = SUPPORT_WHATSAPP_URL;

function audienceTag(name: string): 'Men' | 'Women' | 'All' {
  if (/bridal|lash|makeup|manicure|pedicure|wax/i.test(name) && !/men|beard|shave/i.test(name)) return 'Women';
  if (/beard|shave|men'?s|groom/i.test(name) && !/bridal|lash|makeup/i.test(name)) return 'Men';
  return 'All';
}

const DAY_COUNT = 7;

function parseServiceIds(raw: string | string[] | undefined, fallback?: string): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw?.includes(',')) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (raw?.trim()) return [raw.trim()];
  if (fallback?.trim()) return [fallback.trim()];
  return [];
}

export default function Booking() {
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    shopId: string;
    serviceId?: string;
    serviceIds?: string;
    rescheduleId?: string;
  }>();
  const serviceIds = useMemo(
    () => parseServiceIds(params.serviceIds, params.serviceId),
    [params.serviceIds, params.serviceId]
  );
  const serviceIdsKey = serviceIds.join(',');
  const isReschedule = Boolean(params.rescheduleId);
  const [barberId, setBarberId] = useState<string>();
  const [slotBarberId, setSlotBarberId] = useState<string>();
  const [date, setDate] = useState(todayKeyIST);
  const [selected, setSelected] = useState<string>();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(true);
  const [slotsExpanded, setSlotsExpanded] = useState(false);
  const [requestNote, setRequestNote] = useState('');
  const [working, setWorking] = useState(false);

  const days = useMemo(() => bookingDayOptions(DAY_COUNT), []);
  const shopId = params.shopId || '';

  const shopQ = useQuery({ queryKey: ['shop', shopId], queryFn: () => api.shop(shopId) });
  const serviceQ = useQuery<Service[]>({
    queryKey: ['services', shopId],
    queryFn: () => api.services(shopId)
  });
  const barberQ = useQuery({
    queryKey: ['barbers', shopId],
    queryFn: () => api.barbers(shopId)
  });
  const slotsQ = useQuery<AvailabilitySlot[]>({
    queryKey: ['availability', shopId, serviceIdsKey, date, barberId],
    queryFn: () => api.availability(shopId, serviceIds, date, barberId),
    enabled: Boolean(shopId && serviceIds.length),
    staleTime: 20_000
  });

  const selectedServices = useMemo(
    () => (serviceQ.data || []).filter((s) => serviceIds.includes(s.id)),
    [serviceQ.data, serviceIds]
  );
  const totalPaise = selectedServices.reduce((sum, s) => sum + s.pricePaise, 0);
  const totalMins = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const packageLabel = selectedServices.map((s) => s.name).join(' · ') || 'Services';
  const slots = useMemo(
    () => (slotsQ.data || []).filter((s) => s.available && isFutureStart(s.start)),
    [slotsQ.data]
  );
  const visibleSlots = slotsExpanded || slots.length <= SLOT_PREVIEW ? slots : slots.slice(0, SLOT_PREVIEW);
  const showViewAllSlots = slots.length > SLOT_PREVIEW && !slotsExpanded;
  const addableServices = useMemo(
    () => (serviceQ.data || []).filter((s) => !serviceIds.includes(s.id)),
    [serviceQ.data, serviceIds]
  );

  useEffect(() => {
    setSelected(undefined);
    setSlotBarberId(undefined);
    setSlotsExpanded(false);
  }, [date, barberId, serviceIdsKey]);

  useEffect(() => {
    if (!shopId) return;
    useBookingCartStore.getState().setCart(shopId, serviceIds);
  }, [shopId, serviceIdsKey, serviceIds]);

  useEffect(() => {
    if (selected && !isFutureStart(selected)) {
      setSelected(undefined);
      setSlotBarberId(undefined);
    }
  }, [selected, slots]);

  if (!shopQ.data || !selectedServices.length) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ padding: spacing.md }}>
          <BackButton />
          <Text style={[styles.muted, { marginTop: spacing.lg }]}>
            {serviceQ.isLoading ? 'Loading cart…' : 'Pick services on the shop page first.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const bookPackage = async () => {
    if (!selected || working) return;
    const chair = barberId || slotBarberId;
    if (!chair) {
      appAlert('Pick staff', 'Choose Any staff or a named staff member.');
      return;
    }
    setWorking(true);
    try {
      const hold = await api.createHold({
        shopId,
        serviceIds,
        barberId: barberId || undefined,
        startsAt: selected
      });
      const nextBarberId = hold.barberId;
      const idempotencyKey = bookingIntentKey({
        shopId,
        serviceId: [...serviceIds].sort().join('+'),
        barberId: nextBarberId,
        startsAt: selected
      });

      if (isReschedule && params.rescheduleId) {
        await api.rescheduleBooking(params.rescheduleId, {
          startsAt: selected,
          barberId: nextBarberId,
          holdId: hold.id
        });
        await queryClient.invalidateQueries({ queryKey: ['bookings'] });
        await queryClient.invalidateQueries({ queryKey: ['availability'] });
        appAlert('New time requested', 'Awaiting shop confirmation again.');
        useBookingCartStore.getState().clearCart();
        router.replace({ pathname: '/booking/[id]', params: { id: params.rescheduleId } });
        return;
      }

      await registerForPushNotifications();
      const booking = await api.createBooking({
        shopId,
        serviceIds,
        barberId: nextBarberId,
        startsAt: selected,
        holdId: hold.id,
        idempotencyKey,
        payMode: 'shop'
      });
      await queryClient.invalidateQueries({ queryKey: ['availability'] });
      if (booking.checkout) {
        useBookingCartStore.getState().clearCart();
        router.push({
          pathname: '/booking/pay',
          params: {
            bookingId: booking.id,
            keyId: booking.checkout.keyId,
            orderId: booking.checkout.orderId,
            amountPaise: String(booking.checkout.amountPaise),
            description: booking.checkout.description,
            shopName: shopQ.data.name,
            serviceName: packageLabel,
            barberName: barberQ.data?.find((b) => b.id === nextBarberId)?.name || 'Staff',
            startsAt: booking.startsAt,
            total: String(booking.totalPaise)
          }
        });
        return;
      }
      await notifyAwaitingShop({
        shopName: shopQ.data.name,
        serviceName: packageLabel,
        startsAt: booking.startsAt,
        bookingCode: booking.bookingCode,
        bookingId: booking.id
      });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
      useBookingCartStore.getState().clearCart();
      router.replace({ pathname: '/booking/success', params: { id: booking.id } });
    } catch (err) {
      appAlert(
        isReschedule ? 'Reschedule failed' : 'Booking failed',
        err instanceof Error ? err.message : 'Try another slot.'
      );
    } finally {
      setWorking(false);
    }
  };

  const onBook = () => {
    if (!selected) {
      appAlert('Pick a time', 'Choose a slot to continue.');
      return;
    }
    const chair = barberId || slotBarberId;
    if (!chair) {
      appAlert('Pick staff', 'Choose Any staff or a named staff member.');
      return;
    }
    if (isReschedule) {
      appConfirm({
        title: 'Request new time?',
        message: 'The shop will need to accept the new time.',
        cancelLabel: 'Keep time',
        confirmLabel: 'Request',
        onConfirm: () => void bookPackage()
      });
      return;
    }
    void bookPackage();
  };

  const removeService = (id: string) => {
    const next = serviceIds.filter((sid) => sid !== id);
    if (!next.length) {
      // Last line item — clear draft cart so the floating pill disappears.
      useBookingCartStore.getState().clearCart();
      router.back();
      return;
    }
    useBookingCartStore.getState().setCart(shopId, next);
    router.setParams({ serviceIds: next.join(','), serviceId: undefined });
  };

  const openAddService = () => {
    if (!shopId) return;
    if (!addableServices.length) {
      appAlert('All services added', 'Every menu item from this shop is already in your bill.');
      return;
    }
    // Push menu once; menu returns via navigate → same booking screen (no stack of bookings).
    router.push({
      pathname: '/shop/[id]/menu',
      params: { id: shopId, serviceIds: serviceIdsKey, fromBooking: '1' }
    });
  };

  const bookCta = working
    ? 'Working…'
    : isReschedule
      ? 'Request new time'
      : 'Book & pay after services';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <BackButton />
          <PressScale style={styles.support} onPress={() => void Linking.openURL(SUPPORT_URL)} haptic>
            <Ionicons name="headset-outline" size={18} color={colors.accent} />
            <Text style={styles.supportText}>Support</Text>
          </PressScale>
        </View>

        <View style={styles.shopBlock}>
          <Text style={styles.shopName} numberOfLines={2}>
            {shopQ.data.name}
            {shopQ.data.address ? `, ${shopQ.data.address}` : ''}
          </Text>
          <PressScale onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shopId } })} haptic>
            <View style={styles.editRow}>
              <Text style={styles.editLink}>Edit</Text>
              <Ionicons name="chevron-down" size={14} color={colors.accent} />
            </View>
          </PressScale>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {isReschedule ? 'Select a new date & time' : 'Select Date & Time of Appointment'}
          </Text>
          <View style={styles.dateBanner}>
            <Text style={styles.dateBannerText}>{formatDayBanner(date)}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {days.map((day) => {
              const active = day.key === date;
              return (
                <PressScale
                  key={day.key}
                  onPress={() => setDate(day.key)}
                  style={[styles.dayChip, active && styles.dayChipSelected]}
                  selected={active}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.dayWeekday, active && styles.dayTextSelected]}>{day.weekday}</Text>
                  <Text style={[styles.dayNum, active && styles.dayTextSelected]}>{day.day}</Text>
                  <Text style={[styles.dayMonth, active && styles.dayTextSelected]}>{day.month}</Text>
                </PressScale>
              );
            })}
          </ScrollView>
          <View style={styles.slotHint}>
            <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
            <Text style={styles.slotHintText}>Pick one time slot · {totalMins} min total</Text>
          </View>
          {slotsQ.isLoading ? (
            <SlotGridSkeleton count={8} />
          ) : (
            <View style={styles.slots}>
              {visibleSlots.map((slot) => {
                const active = selected === slot.start;
                return (
                  <Pressable
                    key={slot.start}
                    onPress={() => {
                      setSelected(slot.start);
                      setSlotBarberId(slot.barberId);
                    }}
                    style={[styles.slot, active && styles.slotSelected]}
                  >
                    <Text style={[styles.slotText, active && styles.slotTextSelected]}>{formatTime(slot.start)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {showViewAllSlots ? (
            <PressScale style={styles.viewAllSlots} onPress={() => setSlotsExpanded(true)} haptic>
              <Text style={styles.viewAllSlotsText}>View all ({slots.length} slots)</Text>
            </PressScale>
          ) : null}
          {slotsQ.isError ? (
            <Text style={styles.mutedSmall}>
              {slotsQ.error instanceof Error ? slotsQ.error.message : 'Could not load slots.'}
            </Text>
          ) : null}
          {!slotsQ.isLoading && !slotsQ.isError && slots.length === 0 ? (
            <Text style={styles.mutedSmall}>
              {date === todayKeyIST()
                ? shopQ.data?.isOpen === false
                  ? 'Not taking bookings right now. Try tomorrow or ask the shop to turn appointments back on.'
                  : 'No more starts fit before closing tonight. Try tomorrow or a shorter service.'
                : 'No slots this day. Try another day or another staff member.'}
            </Text>
          ) : null}

          <Text style={styles.subCardTitle}>Preferred staff</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontal}>
            {[{ id: undefined as string | undefined, name: 'Any staff', rating: 0 }, ...(barberQ.data || [])].map(
              (barber) => {
                const active = barberId === barber.id;
                return (
                  <PressScale
                    key={barber.id || 'any'}
                    onPress={() => setBarberId(barber.id)}
                    style={[styles.barber, active && styles.barberSelected]}
                    selected={active}
                  >
                    <View style={[styles.barberAvatar, active && styles.barberAvatarSelected]}>
                      <Text style={[styles.barberInitial, active && { color: colors.white }]}>
                        {barber.id ? barber.name[0] : '✦'}
                      </Text>
                    </View>
                    <Text style={styles.barberName} numberOfLines={2}>
                      {barber.name}
                    </Text>
                    {barber.rating != null && barber.rating > 0 ? (
                      <Text style={styles.barberRating}>★ {barber.rating}</Text>
                    ) : null}
                  </PressScale>
                );
              }
            )}
          </ScrollView>
        </View>

        <PressScale
          style={styles.cardRow}
          onPress={() =>
            appAlert('Offers', 'Shop offers and vouchers will show here soon. Your bill uses live menu prices today.')
          }
          haptic
        >
          <View style={styles.offerIcon}>
            <Text style={styles.offerPct}>%</Text>
          </View>
          <Text style={styles.cardRowLabel}>Choose Offer</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </PressScale>

        <View style={styles.card}>
          <View style={styles.billTitleRow}>
            <Text style={styles.billTitle}>Bill Details</Text>
            <PressScale
              style={styles.addServiceBtn}
              onPress={openAddService}
              haptic
              accessibilityRole="button"
              accessibilityLabel="Add service"
            >
              <Ionicons name="add" size={16} color={colors.accent} />
              <Text style={styles.addServiceBtnText}>Add</Text>
            </PressScale>
          </View>
          <PressScale style={styles.billHeader} onPress={() => setServicesOpen((v) => !v)} haptic>
            <View style={styles.billHeaderLeft}>
              <Text style={styles.billHeaderLabel}>Your Services</Text>
              <Ionicons name={servicesOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
            </View>
            <Text style={styles.billHeaderTotal}>{formatINR(totalPaise)}</Text>
          </PressScale>

          {servicesOpen
            ? selectedServices.map((s, index) => {
                const tag = audienceTag(s.name);
                return (
                  <View key={s.id} style={[styles.serviceRow, index > 0 && styles.serviceRowBorder]}>
                    <View style={styles.serviceIconWrap}>
                      <Ionicons
                        name={tag === 'Women' ? 'woman-outline' : tag === 'Men' ? 'man-outline' : 'person-outline'}
                        size={22}
                        color={colors.accent}
                      />
                      <Text style={styles.serviceTag}>{tag}</Text>
                    </View>
                    <View style={styles.serviceBody}>
                      <Text style={styles.servicePath}>{serviceBrowsePath(s.name, s.categoryId)}</Text>
                      <Text style={styles.serviceName}>{s.name}</Text>
                      <Text style={styles.serviceMeta}>From {formatINR(s.pricePaise)}</Text>
                    </View>
                    <Pressable
                      onPress={() => removeService(s.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${s.name}`}
                    >
                      <Ionicons name="close" size={22} color={colors.muted} />
                    </Pressable>
                  </View>
                );
              })
            : null}

          <View style={styles.approxRow}>
            <Text style={styles.approxLabel}>Approx Total</Text>
            <Text style={styles.approxValue}>{formatINR(totalPaise)}</Text>
          </View>
        </View>

        <View style={styles.taxNote}>
          <Text style={styles.taxNoteText}>
            Prices are inclusive of all applicable taxes. The total may vary after consultation depending on the
            service and who you choose.
          </Text>
        </View>

        <View style={styles.card}>
          <ActionRow
            icon="information-circle-outline"
            label="How to avail this offer?"
            onPress={() =>
              appAlert(
                'Offers',
                'When a shop runs a CutLy offer, you will see steps here. Today, your cart uses menu prices only.'
              )
            }
            colors={colors}
            styles={styles}
          />
          <View style={styles.rowDivider} />
          <ActionRow
            icon="shield-checkmark-outline"
            label="Cancellation policy"
            onPress={() => setPolicyOpen(true)}
            colors={colors}
            styles={styles}
          />
          <View style={styles.rowDivider} />
          <ActionRow
            icon="calculator-outline"
            label="Calculate your bill with offer"
            onPress={() =>
              appAlert('Bill calculator', 'Offer math will live here. Your approx total above is what the shop sees today.')
            }
            colors={colors}
            styles={styles}
          />
          <View style={styles.rowDivider} />
          <View style={styles.requestBlock}>
            <View style={styles.requestLabelRow}>
              <Ionicons name="create-outline" size={20} color={colors.ink} />
              <Text style={styles.requestLabel}>Add a request</Text>
            </View>
            <TextInput
              value={requestNote}
              onChangeText={setRequestNote}
              placeholder="Eg: Stylist name"
              placeholderTextColor={colors.muted}
              style={styles.requestInput}
              multiline
            />
            {requestNote.trim() ? (
              <Text style={styles.requestFootnote}>We will show this note to the shop when requests support it.</Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.tagline}>Book with CutLy</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <PressScale
          style={[styles.bookBtn, (!selected || working) && styles.bookBtnDisabled]}
          onPress={onBook}
          disabled={working}
          haptic
        >
          <Text style={styles.bookBtnText}>{bookCta}</Text>
        </PressScale>
        <Text style={styles.legal}>
          By booking an appointment you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>

      <ChoiceSheet
        visible={policyOpen}
        title="Cancellation policy"
        subtitle="Applies after the shop confirms your appointment."
        showCloseButton
        options={[
          {
            id: 'ok',
            label: 'Got it',
            subtitle:
              'Cancel free before the shop accepts. After confirm, cancel at least 12 hours ahead. Pay the bill at the shop.'
          }
        ]}
        onSelect={() => setPolicyOpen(false)}
        onClose={() => setPolicyOpen(false)}
      />

    </SafeAreaView>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  colors,
  styles
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  colors: Palette;
  styles: ReturnType<typeof screenStyles>;
}) {
  return (
    <PressScale style={styles.actionRow} onPress={onPress} haptic>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <Text style={styles.actionRowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.muted} />
    </PressScale>
  );
}

function screenStyles(colors: Palette) {
  const infoTint = 'rgba(112, 179, 233, 0.14)';
  const infoInk = '#4A7FA8';
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 200 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md
    },
    support: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    supportText: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.accent },
    shopBlock: { marginBottom: spacing.md },
    shopName: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 22, color: colors.ink },
    editRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
    editLink: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.accent },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.line
    },
    cardTitle: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22, color: colors.ink, marginBottom: spacing.md },
    billTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md
    },
    billTitle: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22, color: colors.ink },
    addServiceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.canvas
    },
    addServiceBtnText: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.accent },
    subCardTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.muted,
      marginTop: spacing.lg,
      marginBottom: spacing.sm
    },
    dateBanner: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.sm,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md
    },
    dateBannerText: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    dayRow: { gap: spacing.sm, paddingRight: spacing.md, marginBottom: spacing.md },
    dayChip: {
      minWidth: 56,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      alignItems: 'center',
      gap: 2
    },
    dayChipSelected: { backgroundColor: colors.accent },
    dayWeekday: { fontFamily: fontFamily.semibold, fontSize: 11, color: colors.muted },
    dayNum: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 22, color: colors.ink },
    dayMonth: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.muted },
    dayTextSelected: { color: colors.white },
    slotHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
    slotHintText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.muted, flex: 1 },
    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slot: {
      width: '23%',
      minWidth: 72,
      paddingVertical: 12,
      borderRadius: radii.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface
    },
    slotSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    slotText: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.ink },
    slotTextSelected: { color: colors.white },
    viewAllSlots: {
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingVertical: 8,
      paddingHorizontal: 2
    },
    viewAllSlotsText: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.accent },
    mutedSmall: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.muted, marginTop: spacing.sm },
    horizontal: { gap: spacing.sm, paddingRight: spacing.md },
    barber: {
      width: 88,
      paddingVertical: spacing.sm,
      paddingHorizontal: 6,
      borderRadius: radii.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.canvas
    },
    barberSelected: { borderColor: colors.accent, backgroundColor: colors.sand },
    barberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6
    },
    barberAvatarSelected: { backgroundColor: colors.accent },
    barberInitial: { fontFamily: fontFamily.bold, color: colors.ink, fontSize: 16 },
    barberName: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.ink, textAlign: 'center' },
    barberRating: { fontFamily: fontFamily.regular, fontSize: 10, color: colors.muted, marginTop: 2 },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.line,
      gap: spacing.sm
    },
    offerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.success,
      alignItems: 'center',
      justifyContent: 'center'
    },
    offerPct: { fontFamily: fontFamily.bold, color: colors.white, fontSize: 16 },
    cardRowLabel: { fontFamily: fontFamily.medium, fontSize: 15, color: colors.ink, flex: 1 },
    billHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderColor: colors.line
    },
    billHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    billHeaderLabel: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    billHeaderTotal: { fontFamily: fontFamily.semibold, fontSize: 17, color: colors.ink },
    serviceRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
    serviceRowBorder: { borderTopWidth: 1, borderColor: colors.line },
    serviceIconWrap: { alignItems: 'center', width: 48 },
    serviceTag: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.muted, marginTop: 2 },
    serviceBody: { flex: 1, gap: 2 },
    servicePath: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.muted },
    serviceName: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.ink },
    serviceMeta: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.muted },
    approxRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderColor: colors.line
    },
    approxLabel: { fontFamily: fontFamily.semibold, fontSize: 17, color: colors.ink },
    approxValue: { fontFamily: fontFamily.semibold, fontSize: 17, color: colors.ink },
    taxNote: {
      backgroundColor: infoTint,
      borderRadius: radii.sm,
      padding: spacing.md,
      marginBottom: spacing.sm
    },
    taxNoteText: { fontFamily: fontFamily.regular, fontSize: 13, color: infoInk, lineHeight: 18 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 14 },
    actionRowLabel: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.ink, flex: 1 },
    rowDivider: { height: 1, backgroundColor: colors.line },
    requestBlock: { paddingVertical: spacing.md, gap: spacing.sm },
    requestLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    requestLabel: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    requestInput: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontFamily: fontFamily.regular,
      fontSize: 15,
      color: colors.ink,
      minHeight: 44,
      backgroundColor: colors.canvas
    },
    requestFootnote: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.muted },
    tagline: {
      fontFamily: fontFamily.medium,
      textAlign: 'center',
      color: colors.muted,
      fontSize: 15,
      marginTop: spacing.sm,
      marginBottom: spacing.md
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderColor: colors.line,
      gap: spacing.sm
    },
    bookBtn: {
      height: 52,
      borderRadius: radii.sm,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center'
    },
    bookBtnDisabled: { opacity: 0.45 },
    bookBtnText: { fontFamily: fontFamily.bold, color: colors.white, fontSize: 17 },
    legal: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 16,
      paddingBottom: 4
    },
    muted: { ...typography.body, color: colors.muted }
  });
}
