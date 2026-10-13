import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { BackButton } from '@/components/BackButton';
import { HoursEditor } from '@/components/HoursEditor';
import { HoursEditorSkeleton, ListRowsSkeleton } from '@/components/Skeleton';
import { PressScale } from '@/components/PressScale';
import { PrimaryButton } from '@/components/PrimaryButton';
import { catalogueForKinds, normalizeShopKind, type ShopKindId } from '@/constants/catalogue';
import { inferServiceAudience } from '@/constants/serviceCategories';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import type { ServiceAudience } from '@/types/domain';
import { partnerApi } from '@/services/partner';
import { appAlert, appConfirm } from '@/store/useDialogStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import {
  defaultHourDrafts,
  draftsFromApiDays,
  draftsToApiDays,
  type HourDayDraft
} from '@/utils/hoursDraft';
import { sanitizeMinuteCount, isCloseAfterOpen } from '@/utils/clock12';

type MenuDraft = {
  key: string;
  id?: string;
  name: string;
  durationMinutes: string;
  priceRupees: string;
  bufferMinutes: string;
  audience: ServiceAudience;
};

const AUDIENCE_OPTIONS: { id: ServiceAudience; label: string }[] = [
  { id: 'UNISEX', label: 'Unisex' },
  { id: 'MEN', label: 'Men' },
  { id: 'WOMEN', label: 'Women' },
  { id: 'KIDS', label: 'Kids' }
];

function toDraft(row: {
  id?: string;
  name: string;
  durationMinutes: number;
  pricePaise: number;
  bufferMinutes?: number;
  audience?: string | null;
}): MenuDraft {
  return {
    key: row.id || `new-${row.name}-${Math.random().toString(36).slice(2, 7)}`,
    id: row.id,
    name: row.name,
    durationMinutes: String(row.durationMinutes),
    priceRupees: String(Math.round(row.pricePaise / 100)),
    bufferMinutes: String(row.bufferMinutes ?? 10),
    audience: (row.audience as ServiceAudience | null | undefined) || inferServiceAudience(row.name)
  };
}

export default function PartnerShopSettings() {
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const queryClient = useQueryClient();
  const shopQ = useQuery({ queryKey: ['partner-shop'], queryFn: () => partnerApi.shop() });
  const hoursQ = useQuery({ queryKey: ['partner-hours'], queryFn: () => partnerApi.hours() });

  const [drafts, setDrafts] = useState<HourDayDraft[]>(defaultHourDrafts);
  const [menu, setMenu] = useState<MenuDraft[]>([]);
  const [localPhone, setLocalPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hoursQ.data?.days) setDrafts(draftsFromApiDays(hoursQ.data.days));
  }, [hoursQ.data]);

  useEffect(() => {
    if (!shopQ.data) return;
    if (shopQ.data.services) setMenu(shopQ.data.services.map(toDraft));
    const raw = shopQ.data.phone?.replace(/\D/g, '') || '';
    setLocalPhone(raw.startsWith('91') && raw.length === 12 ? raw.slice(2) : raw.slice(-10));
  }, [shopQ.data]);

  const kinds = useMemo(() => {
    const raw = (shopQ.data?.kinds?.length
      ? shopQ.data.kinds
      : shopQ.data?.kind
        ? [shopQ.data.kind]
        : ['SALON']) as string[];
    const normalized = raw
      .map((k) => normalizeShopKind(k) || (k as ShopKindId))
      .filter(Boolean) as ShopKindId[];
    return normalized.length ? normalized : (['SALON'] as ShopKindId[]);
  }, [shopQ.data?.kind, shopQ.data?.kinds]);

  const catalogueLeft = useMemo(() => {
    const taken = new Set(menu.map((row) => row.name.toLowerCase()));
    return catalogueForKinds(kinds).filter((row) => !taken.has(row.name.toLowerCase()));
  }, [kinds, menu]);

  function patchMenu(key: string, patch: Partial<MenuDraft>) {
    setMenu((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeMenu(key: string) {
    if (menu.length <= 1) {
      appAlert('Keep one service', 'Customers need at least one bookable service.');
      return;
    }
    appConfirm({
      title: 'Remove service?',
      message: 'It disappears from the customer menu right away. Past bookings stay intact.',
      cancelLabel: 'Keep',
      confirmLabel: 'Remove',
      destructive: true,
      onConfirm: () => setMenu((prev) => prev.filter((row) => row.key !== key))
    });
  }

  function addFromCatalogue(name: string) {
    const hit = catalogueForKinds(kinds).find((row) => row.name === name);
    if (!hit) return;
    setMenu((prev) => [...prev, toDraft(hit)]);
    void Haptics.selectionAsync();
  }

  async function save() {
    const days = draftsToApiDays(drafts);
    if (!days.length) {
      appAlert('Keep one open day', 'At least one weekday must be open.');
      return;
    }
    for (const day of days) {
      if (!isCloseAfterOpen(day.opensAt, day.closesAt)) {
        appAlert('Closing must be later', 'Every open day needs close time after open.');
        return;
      }
    }
    const digits = localPhone.replace(/\D/g, '').slice(0, 10);
    if (digits.length > 0 && digits.length !== 10) {
      appAlert('Check phone number', 'Enter a 10-digit mobile number, or leave blank to hide Contact.');
      return;
    }
    const phone = digits.length === 10 ? `+91${digits}` : null;
    let services;
    try {
      services = menu.map((row) => {
        const durationMinutes = Number(row.durationMinutes);
        const priceRupees = Number(row.priceRupees);
        const bufferMinutes = Number(row.bufferMinutes);
        if (!row.name.trim()) throw new Error('Every service needs a name.');
        if (!Number.isFinite(durationMinutes) || durationMinutes < 10) {
          throw new Error(`Set a duration of at least 10 minutes for ${row.name}.`);
        }
        if (!Number.isFinite(priceRupees) || priceRupees < 1) {
          throw new Error(`Set a price of at least ₹1 for ${row.name}.`);
        }
        return {
          ...(row.id ? { id: row.id } : {}),
          name: row.name.trim(),
          durationMinutes: Math.round(durationMinutes),
          pricePaise: Math.round(priceRupees * 100),
          bufferMinutes: Number.isFinite(bufferMinutes) ? Math.max(0, Math.round(bufferMinutes)) : 10,
          audience: row.audience
        };
      });
    } catch (err) {
      appAlert('Check menu', err instanceof Error ? err.message : 'Fix the menu and try again.');
      return;
    }

    setBusy(true);
    try {
      await partnerApi.setPhone(phone);
      await partnerApi.setHours(days);
      await partnerApi.setServices(services);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['partner-hours'] }),
        queryClient.invalidateQueries({ queryKey: ['partner-shop'] }),
        queryClient.invalidateQueries({ queryKey: ['partner-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['availability'] }),
        queryClient.invalidateQueries({ queryKey: ['shops'] }),
        queryClient.invalidateQueries({ queryKey: ['shop'] }),
        queryClient.invalidateQueries({ queryKey: ['services'] })
      ]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      appAlert('Shop settings saved', 'Contact, hours, and menu update for customers immediately.');
    } catch (err) {
      appAlert('Could not save', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  const loading = shopQ.isLoading || hoursQ.isLoading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <BackButton />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Shop</Text>
        <Text style={styles.title}>Shop settings</Text>
        <Text style={styles.body}>
          Change contact number, open days, hours, and your menu any time. Customers see updates right away.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionKicker}>Contact</Text>
          <Text style={styles.sectionTitle}>Shop phone</Text>
          <Text style={styles.sectionHint}>
            Shown on your customer shop page next to Get Directions. Leave blank to hide the number.
          </Text>
          <View style={styles.phoneRow}>
            <Text style={styles.cc}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              value={localPhone}
              onChangeText={(v) => setLocalPhone(v.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210"
              placeholderTextColor={colors.muted}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionKicker}>Schedule</Text>
          <Text style={styles.sectionTitle}>Open days & timings</Text>
          <Text style={styles.sectionHint}>
            Times are IST · tap to open the native clock (12-hour). Close must be after open.
          </Text>
          {hoursQ.isLoading ? <HoursEditorSkeleton /> : <HoursEditor value={drafts} onChange={setDrafts} />}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionKicker}>Menu</Text>
          <Text style={styles.sectionTitle}>Services</Text>
          <Text style={styles.sectionHint}>Price, duration, gap after the service, and who each service is for (Men / Women / Kids filters).</Text>
          {loading && !menu.length ? (
            <ListRowsSkeleton count={3} />
          ) : (
            menu.map((row) => (
              <View key={row.key} style={styles.serviceCard}>
                <View style={styles.serviceHead}>
                  <TextInput
                    value={row.name}
                    onChangeText={(name) => patchMenu(row.key, { name })}
                    style={styles.serviceName}
                    placeholder="Service name"
                    placeholderTextColor={colors.muted}
                  />
                  <PressScale onPress={() => removeMenu(row.key)} style={styles.removeBtn} haptic>
                    <Text style={styles.removeText}>Remove</Text>
                  </PressScale>
                </View>
                <View style={styles.fields}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Minutes</Text>
                    <TextInput
                      value={row.durationMinutes}
                      onChangeText={(raw) =>
                        patchMenu(row.key, { durationMinutes: sanitizeMinuteCount(raw, 480) })
                      }
                      keyboardType="number-pad"
                      style={styles.fieldInput}
                      placeholder="30"
                      placeholderTextColor={colors.muted}
                      maxLength={3}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>₹ Price</Text>
                    <TextInput
                      value={row.priceRupees}
                      onChangeText={(raw) =>
                        patchMenu(row.key, { priceRupees: sanitizeMinuteCount(raw, 999999) })
                      }
                      keyboardType="number-pad"
                      style={styles.fieldInput}
                      placeholder="300"
                      placeholderTextColor={colors.muted}
                      maxLength={6}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Buffer</Text>
                    <TextInput
                      value={row.bufferMinutes}
                      onChangeText={(raw) =>
                        patchMenu(row.key, { bufferMinutes: sanitizeMinuteCount(raw, 120) })
                      }
                      keyboardType="number-pad"
                      style={styles.fieldInput}
                      placeholder="10"
                      placeholderTextColor={colors.muted}
                      maxLength={3}
                    />
                  </View>
                </View>
                <View style={styles.audienceBlock}>
                  <Text style={styles.fieldLabel}>For</Text>
                  <View style={styles.chips}>
                    {AUDIENCE_OPTIONS.map((opt) => {
                      const on = row.audience === opt.id;
                      return (
                        <PressScale
                          key={opt.id}
                          onPress={() => patchMenu(row.key, { audience: opt.id })}
                          style={[styles.chip, on && styles.chipOn]}
                          selected={on}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          haptic
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{opt.label}</Text>
                        </PressScale>
                      );
                    })}
                  </View>
                </View>
              </View>
            ))
          )}

          {catalogueLeft.length ? (
            <View style={styles.addBlock}>
              <Text style={styles.addLabel}>Add from catalogue</Text>
              <View style={styles.chips}>
                {catalogueLeft.slice(0, 8).map((row) => (
                  <PressScale
                    key={row.name}
                    onPress={() => addFromCatalogue(row.name)}
                    style={styles.chip}
                    haptic
                  >
                    <Text style={styles.chipText}>{row.name}</Text>
                  </PressScale>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <PrimaryButton label={busy ? 'Saving…' : 'Save changes'} onPress={() => void save()} disabled={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

function screenStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    top: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
    content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
    kicker: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase'
    },
    title: { ...typography.title, color: colors.ink, fontSize: 30, letterSpacing: -0.6 },
    body: { ...typography.body, color: colors.muted, marginBottom: spacing.sm },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.line
    },
    sectionKicker: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase'
    },
    sectionTitle: { ...typography.heading, color: colors.ink, fontSize: 20 },
    sectionHint: { ...typography.caption, color: colors.muted, marginBottom: spacing.xs },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 52,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.canvas,
      paddingHorizontal: spacing.md,
      gap: spacing.sm
    },
    cc: { ...typography.heading, color: colors.ink, fontSize: 16 },
    phoneInput: {
      flex: 1,
      ...typography.body,
      fontSize: 17,
      color: colors.ink,
      letterSpacing: 0.4,
      paddingVertical: 0
    },
    serviceCard: {
      backgroundColor: colors.canvas,
      borderRadius: radii.md,
      padding: spacing.md,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.line
    },
    serviceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    serviceName: {
      flex: 1,
      ...typography.heading,
      fontSize: 17,
      color: colors.ink,
      paddingVertical: 4
    },
    removeBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.sand
    },
    removeText: { ...typography.caption, color: colors.danger, fontWeight: '700' },
    fields: { flexDirection: 'row', gap: spacing.sm },
    field: { flex: 1, gap: 4 },
    fieldLabel: { ...typography.caption, color: colors.muted, fontWeight: '600' },
    fieldInput: {
      backgroundColor: colors.surface,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 12,
      ...typography.body,
      color: colors.ink,
      fontWeight: '700',
      fontSize: 18
    },
    addBlock: { gap: spacing.sm, marginTop: spacing.xs },
    addLabel: { ...typography.caption, color: colors.muted, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      backgroundColor: colors.sand,
      borderRadius: radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.line
    },
    chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipTextOn: { color: colors.white },
    audienceBlock: { gap: 6, marginTop: spacing.sm },
    chipText: { ...typography.caption, color: colors.ink, fontWeight: '700' }
  });
}
