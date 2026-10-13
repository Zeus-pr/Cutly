import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FloatingCartPill } from '@/components/FloatingCartPill';
import { PressScale } from '@/components/PressScale';
import { ScreenBack } from '@/components/ScreenBack';
import { ServiceCategoryThumb } from '@/components/ServiceCategoryThumb';
import {
  categoriesForServices,
  filterByAudience,
  type AudienceFilter,
  type GroupedServices
} from '@/constants/serviceCategories';
import { fontFamily } from '@/constants/fonts';
import { type Palette, radii, spacing } from '@/constants/theme';
import { api } from '@/services/api';
import { useBookingCartStore } from '@/store/useBookingCartStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { formatINR } from '@/utils/money';
import { flatSubstringMatch } from '@/utils/placeTrust';

type Audience = AudienceFilter;

const move = { duration: 200, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

export default function ShopServiceMenu() {
  const colors = useColors();
  const styles = useThemedStyles(menuStyles);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const {
    id,
    category: categoryParam,
    serviceIds: serviceIdsParam,
    fromBooking: fromBookingParam
  } = useLocalSearchParams<{
    id: string;
    category?: string;
    serviceIds?: string;
    fromBooking?: string;
  }>();
  const shopId = Array.isArray(id) ? id[0] : id;
  const initialCat = typeof categoryParam === 'string' ? categoryParam : undefined;
  const fromBooking = fromBookingParam === '1' || fromBookingParam === 'true';
  const seedIds = useMemo(() => {
    const raw = Array.isArray(serviceIdsParam) ? serviceIdsParam.join(',') : serviceIdsParam || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }, [serviceIdsParam]);

  const [activeCat, setActiveCat] = useState(initialCat || '');
  const appliedEntryCat = useRef(false);
  const [audience, setAudience] = useState<Audience>('all');
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<string[]>(seedIds);

  const { data: shop } = useQuery({
    queryKey: ['shop', shopId],
    queryFn: () => api.shop(shopId || ''),
    enabled: Boolean(shopId)
  });
  const { data: serviceList = [] } = useQuery({
    queryKey: ['services', shopId],
    queryFn: () => api.services(shopId || ''),
    enabled: Boolean(shopId)
  });

  const shopKinds = shop?.kinds?.length ? shop.kinds : shop?.kind ? [shop.kind] : [];
  const grouped = useMemo(
    () => categoriesForServices(serviceList, shopKinds),
    [serviceList, shopKinds]
  );

  useEffect(() => {
    if (!grouped.length) return;
    if (!appliedEntryCat.current && initialCat && grouped.some((g) => g.category.id === initialCat)) {
      appliedEntryCat.current = true;
      setActiveCat(initialCat);
      return;
    }
    appliedEntryCat.current = true;
    if (activeCat && grouped.some((g) => g.category.id === activeCat)) return;
    setActiveCat(grouped[0].category.id);
  }, [grouped, activeCat, initialCat]);

  // Keep cart in sync when opening from booking “Add service” with seed ids.
  const seedKey = seedIds.join(',');
  useEffect(() => {
    if (!seedKey) return;
    setPicked(seedKey.split(',').filter(Boolean));
  }, [seedKey]);

  // Prefill selection from draft cart — do not write back until “Add to cart”.
  useEffect(() => {
    if (!shopId || seedKey) return;
    const stored = useBookingCartStore.getState();
    if (stored.shopId === shopId && stored.serviceIds.length) {
      setPicked(stored.serviceIds);
    }
  }, [shopId, seedKey]);

  const cartInStore = useBookingCartStore(
    (s) => s.shopId === shopId && s.serviceIds.length > 0
  );
  // Pill clear / external clear — drop local picks that were mirroring the store.
  const hadCommittedCart = useRef(false);
  useEffect(() => {
    if (cartInStore) {
      hadCommittedCart.current = true;
      return;
    }
    if (hadCommittedCart.current && !seedKey) {
      hadCommittedCart.current = false;
      setPicked([]);
    }
  }, [cartInStore, seedKey]);

  const current: GroupedServices | undefined =
    grouped.find((g) => g.category.id === activeCat) || grouped[0];

  const visibleGroups = useMemo(() => {
    if (!current) return [];
    let list = current.groups;
    const q = query.trim();
    if (q) {
      list = list
        .map((g) => ({
          ...g,
          services: g.services.filter((s) => flatSubstringMatch(s.name, q))
        }))
        .filter((g) => g.services.length > 0);
    }
    if (audience !== 'all') {
      list = list
        .map((g) => ({
          ...g,
          services: filterByAudience(g.services, audience)
        }))
        .filter((g) => g.services.length > 0);
    }
    return list;
  }, [current, query, audience]);

  useEffect(() => {
    if (!visibleGroups.length) return;
    setOpenGroups((prev) => {
      const first = visibleGroups[0].group.id;
      if (prev[first]) return prev;
      return { [first]: true };
    });
  }, [activeCat, visibleGroups]);

  const selected = useMemo(
    () => serviceList.filter((s) => picked.includes(s.id)),
    [serviceList, picked]
  );
  const cartTotal = selected.reduce((sum, s) => sum + s.pricePaise, 0);

  function toggleService(serviceId: string) {
    setPicked((prev) => {
      const next = prev.includes(serviceId)
        ? prev.filter((x) => x !== serviceId)
        : [...prev, serviceId];
      // After Add to cart, keep the teal pill in sync when user unselects / reselects.
      const store = useBookingCartStore.getState();
      if (shopId && store.shopId === shopId && store.serviceIds.length) {
        if (next.length) store.setCart(shopId, next);
        else store.clearCart();
      }
      return next;
    });
  }

  function addToCart() {
    if (!shopId || !picked.length) return;
    useBookingCartStore.getState().setCart(shopId, picked);
    // From booking “Add service”: update bill and return (don’t stack bookings).
    if (fromBooking) {
      router.dismissTo({
        pathname: '/booking',
        params: { shopId, serviceIds: picked.join(',') }
      });
    }
    // Otherwise stay on menu — teal View cart pill appears above the footer.
  }

  const title = current?.category.label || shop?.name || 'Services';
  const footerPad = Math.max(insets.bottom, 10);
  // Stable offset — don’t shrink when meta line hides or the pill jumps up on unselect.
  const menuPillBottom = footerPad + 52 + 10 + 22 + 10;

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ScreenBack onPress={() => router.back()} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backHit} />
      </View>

      <View style={styles.body}>
        {/* Fixed outer shell — ScrollView alone expands with label text on Android. */}
        <View style={styles.sideRail}>
          <ScrollView
            style={styles.sideScroll}
            contentContainerStyle={styles.sideContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {grouped.map(({ category }) => {
              const on = category.id === (current?.category.id || activeCat);
              return (
                <Pressable
                  key={category.id}
                  style={[styles.sideItem, on && styles.sideItemOn]}
                  onPress={() => setActiveCat(category.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  {on ? <View style={styles.sideBar} /> : null}
                  <ServiceCategoryThumb
                    category={category}
                    size={52}
                    shape="circle"
                    selected={on}
                  />
                  <Text
                    style={[styles.sideLabel, on && styles.sideLabelOn]}
                    numberOfLines={2}
                    allowFontScaling={false}
                  >
                    {category.gridLabel || category.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.main}>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for service..."
              placeholderTextColor={colors.muted}
              style={styles.searchInput}
              autoCorrect={false}
            />
          </View>

          <View style={styles.genderRow}>
            <View style={styles.genderSlot}>
              <PressScale
                style={[styles.genderPill, audience === 'men' && styles.genderPillMen]}
                onPress={() => setAudience(audience === 'men' ? 'all' : 'men')}
                haptic
              >
                <Ionicons
                  name="man-outline"
                  size={20}
                  color={audience === 'men' ? '#2B6CB0' : colors.muted}
                />
                <Text style={[styles.genderText, audience === 'men' && styles.genderTextMen]}>Men</Text>
              </PressScale>
            </View>
            <View style={styles.genderSlot}>
              <PressScale
                style={[styles.genderPill, audience === 'women' && styles.genderPillWomen]}
                onPress={() => setAudience(audience === 'women' ? 'all' : 'women')}
                haptic
              >
                <Ionicons
                  name="woman-outline"
                  size={20}
                  color={audience === 'women' ? '#C0266B' : colors.muted}
                />
                <Text style={[styles.genderText, audience === 'women' && styles.genderTextWomen]}>
                  Women
                </Text>
              </PressScale>
            </View>
            <View style={styles.genderSlot}>
              <PressScale
                style={[styles.genderPill, audience === 'kids' && styles.genderPillKids]}
                onPress={() => setAudience(audience === 'kids' ? 'all' : 'kids')}
                haptic
              >
                <Ionicons
                  name="happy-outline"
                  size={20}
                  color={audience === 'kids' ? '#B7791F' : colors.muted}
                />
                <Text style={[styles.genderText, audience === 'kids' && styles.genderTextKids]}>Kids</Text>
              </PressScale>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.accordionList} showsVerticalScrollIndicator={false}>
            {visibleGroups.map(({ group, services }) => {
              const open = Boolean(openGroups[group.id]);
              return (
                <AccordionBlock
                  key={group.id}
                  label={`${group.label} (${services.length})`}
                  open={open}
                  onToggle={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  reduced={!!reduced}
                >
                  {services.map((service) => {
                    const on = picked.includes(service.id);
                    return (
                      <PressScale
                        key={service.id}
                        style={[styles.serviceRow, on && styles.serviceRowOn]}
                        onPress={() => toggleService(service.id)}
                        selected={on}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.serviceName}>{service.name}</Text>
                        </View>
                        <Text style={styles.servicePrice}>{formatINR(service.pricePaise)}</Text>
                        <View style={[styles.check, on && styles.checkOn]}>
                          {on ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                        </View>
                      </PressScale>
                    );
                  })}
                </AccordionBlock>
              );
            })}
            {!visibleGroups.length ? (
              <Text style={styles.empty}>
                {current?.services.length
                  ? 'No services match this filter.'
                  : 'No services in this category yet.'}
              </Text>
            ) : null}
            <View style={{ height: cartInStore && !fromBooking ? 88 : 24 }} />
          </ScrollView>
        </View>
      </View>

      {/* Always mounted so exit SlideOutDown can finish when cart clears. */}
      {!fromBooking ? (
        <FloatingCartPill
          placement="shop"
          forShopId={shopId}
          bottomOffset={menuPillBottom}
        />
      ) : null}

      <View style={[styles.footer, { paddingBottom: footerPad }]}>
        {picked.length ? (
          <Text style={styles.cartMeta}>
            {picked.length} selected · {formatINR(cartTotal)}
          </Text>
        ) : null}
        <PressScale
          style={[styles.cta, picked.length ? styles.ctaOn : styles.ctaOff]}
          onPress={addToCart}
          disabled={!picked.length}
          haptic
        >
          <Text style={styles.ctaText}>
            {picked.length
              ? fromBooking
                ? `Update cart (${picked.length})`
                : `Add to cart (${picked.length})`
              : 'Select a service'}
          </Text>
        </PressScale>
      </View>
    </View>
  );
}

function AccordionBlock({
  label,
  open,
  onToggle,
  children,
  reduced
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  reduced: boolean;
}) {
  const colors = useColors();
  const styles = useThemedStyles(menuStyles);
  const rot = useSharedValue(open ? 180 : 0);

  useEffect(() => {
    if (reduced) {
      rot.set(open ? 180 : 0);
      return;
    }
    rot.set(withTiming(open ? 180 : 0, move));
  }, [open, reduced, rot]);

  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.get()}deg` }]
  }));

  return (
    <View style={styles.accordion}>
      <Pressable style={styles.accordionHead} onPress={onToggle} accessibilityRole="button">
        <Text style={styles.accordionLabel}>{label}</Text>
        <Animated.View style={chevron}>
          <Ionicons name="chevron-down" size={20} color={colors.ink} />
        </Animated.View>
      </Pressable>
      {open ? <View style={styles.accordionBody}>{children}</View> : null}
    </View>
  );
}

function menuStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    backHit: { width: 36, height: 40 },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontFamily: fontFamily.bold,
      fontSize: 17,
      color: colors.ink
    },
    body: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
    /** ~20% rail on phone — circle 52, shell 64 (Luzo). Icons stay large. */
    sideRail: {
      width: 64,
      maxWidth: 64,
      flexGrow: 0,
      flexShrink: 0,
      backgroundColor: colors.canvas,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.line,
      overflow: 'hidden'
    },
    sideScroll: { flex: 1, width: 64 },
    sideContent: {
      width: 64,
      paddingTop: 4,
      paddingBottom: 40,
      alignItems: 'center'
    },
    sideItem: {
      width: 64,
      alignItems: 'center',
      paddingVertical: 10,
      gap: 5,
      position: 'relative',
      overflow: 'hidden'
    },
    sideItemOn: { backgroundColor: colors.surface },
    sideBar: {
      position: 'absolute',
      right: 0,
      top: 8,
      bottom: 8,
      width: 3,
      borderTopLeftRadius: 2,
      borderBottomLeftRadius: 2,
      backgroundColor: colors.accent
    },
    sideLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 9,
      lineHeight: 11,
      color: colors.muted,
      textAlign: 'center',
      width: 58
    },
    sideLabelOn: { color: colors.ink, fontFamily: fontFamily.bold },
    main: { flex: 1, minWidth: 0, paddingHorizontal: 14, paddingTop: 12 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 44,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 14,
      backgroundColor: colors.canvas
    },
    searchInput: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.ink,
      paddingVertical: 0
    },
    genderRow: { flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 4 },
    genderSlot: { flex: 1 },
    genderPill: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      height: 44,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: colors.line,
      backgroundColor: colors.surface
    },
    genderPillMen: { borderColor: '#2B6CB0', backgroundColor: '#EBF4FF' },
    genderPillWomen: { borderColor: '#C0266B', backgroundColor: '#FDF2F7' },
    genderPillKids: { borderColor: '#B7791F', backgroundColor: '#FFF7E6' },
    genderText: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.muted },
    genderTextMen: { color: '#2B6CB0' },
    genderTextWomen: { color: '#C0266B' },
    genderTextKids: { color: '#B7791F' },
    accordionList: { paddingTop: 4, paddingBottom: 20 },
    accordion: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    accordionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 2
    },
    accordionLabel: { fontFamily: fontFamily.semibold, fontSize: 15, color: colors.ink },
    accordionBody: { gap: 8, paddingBottom: 14 },
    serviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: radii.md,
      backgroundColor: colors.canvas,
      borderWidth: 1.5,
      borderColor: 'transparent'
    },
    serviceRowOn: { borderColor: colors.accent, backgroundColor: 'rgba(240,107,85,0.18)' },
    serviceName: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.ink },
    serviceMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
    servicePrice: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.ink },
    check: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface
    },
    checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    empty: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.muted,
      marginTop: 32,
      textAlign: 'center',
      paddingHorizontal: 16
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingTop: 10,
      gap: 6,
      backgroundColor: colors.surface
    },
    cartMeta: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      color: colors.muted,
      textAlign: 'center'
    },
    cta: {
      height: 52,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center'
    },
    ctaOn: { backgroundColor: colors.accent },
    ctaOff: { backgroundColor: colors.accent, opacity: 0.4 },
    ctaText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.white }
  });
}
