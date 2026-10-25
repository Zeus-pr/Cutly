import type React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Linking,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FloatingCartPill } from '@/components/FloatingCartPill';
import { PressScale } from '@/components/PressScale';
import { ScreenBack } from '@/components/ScreenBack';
import { ShopHoursSheet } from '@/components/ShopHoursSheet';
import { DetailScreenSkeleton } from '@/components/Skeleton';
import { ServiceCategoryThumb } from '@/components/ServiceCategoryThumb';
import { browseGridCategories } from '@/constants/serviceCategories';
import { fontFamily } from '@/constants/fonts';
import { type Palette, radii, spacing } from '@/constants/theme';
import { api } from '@/services/api';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { appAlert } from '@/store/useDialogStore';

type ShopTab = 'services' | 'gallery' | 'about' | 'reviews';

const TABS: { id: ShopTab; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'about', label: 'About' },
  { id: 'reviews', label: 'Reviews' }
];

const COLS = 4;
const H_PAD = spacing.md;
const TILE_GAP = 10;

function tileWidth() {
  const w = Dimensions.get('window').width;
  return Math.floor((w - H_PAD * 2 - TILE_GAP * (COLS - 1)) / COLS);
}

function priceBand(paise: number) {
  if (paise <= 0) return '₹';
  if (paise < 50000) return '₹';
  if (paise < 150000) return '₹₹';
  return '₹₹₹';
}

export default function ShopDetail() {
  const colors = useColors();
  const styles = useThemedStyles(screenStyles);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const accessToken = useSessionStore((s) => s.accessToken);
  const active = usePlaceStore((s) => s.active);
  const { id } = useLocalSearchParams<{ id: string }>();
  const shopId = Array.isArray(id) ? id[0] : id;
  const [tab, setTab] = useState<ShopTab>('services');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const cell = tileWidth();

  // Single scrolling page: tab press scrolls to its section; scrolling updates the active tab.
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const sectionY = useRef<Partial<Record<ShopTab, number>>>({});
  const tabsHeight = useRef(48);
  const scrollLock = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSectionLayout = useCallback(
    (id: ShopTab) => (e: LayoutChangeEvent) => {
      sectionY.current[id] = e.nativeEvent.layout.y;
    },
    []
  );

  const scrollToSection = useCallback((id: ShopTab) => {
    setTab(id);
    const y = sectionY.current[id];
    if (y == null) return;
    if (scrollLock.current) clearTimeout(scrollLock.current);
    // Ignore onScroll tab sync while the programmatic scroll animates.
    scrollLock.current = setTimeout(() => {
      scrollLock.current = null;
    }, 700);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - tabsHeight.current), animated: true });
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (scrollLock.current) return;
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const probe = contentOffset.y + tabsHeight.current + 24;
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
    let current: ShopTab = 'services';
    for (const t of TABS) {
      const y = sectionY.current[t.id];
      if (y != null && y <= probe) current = t.id;
    }
    // Short last section can't reach the probe line — treat bottom of page as Reviews.
    if (atBottom && sectionY.current.reviews != null) current = 'reviews';
    setTab((prev) => (prev === current ? prev : current));
  }, []);

  const { data: shop, isLoading, isError, error } = useQuery({
    queryKey: ['shop', shopId, active?.latitude, active?.longitude],
    queryFn: () =>
      api.shop(shopId || '', { lat: active?.latitude, lng: active?.longitude }),
    enabled: Boolean(shopId)
  });
  const { data: serviceList = [] } = useQuery({
    queryKey: ['services', shopId],
    queryFn: () => api.services(shopId || ''),
    enabled: Boolean(shopId)
  });
  const { data: reviews = [] } = useQuery({
    queryKey: ['shop-reviews', shopId],
    queryFn: () => api.shopReviews(shopId || ''),
    enabled: Boolean(shopId)
  });
  const { data: fav } = useQuery({
    queryKey: ['favourite', shopId],
    queryFn: () => api.isFavourite(shopId || ''),
    enabled: Boolean(shopId && accessToken)
  });

  const shopKinds = shop?.kinds?.length ? shop.kinds : shop?.kind ? [shop.kind] : [];
  const gridCats = useMemo(
    () => browseGridCategories(serviceList, shopKinds),
    [serviceList, shopKinds]
  );
  const photos = shop?.photos?.length ? shop.photos : shop?.imageUrl ? [shop.imageUrl] : [];
  const amenities = shop?.amenities?.length ? shop.amenities : shop?.tags || [];
  const brands = shop?.productBrands || [];

  async function toggleHeart() {
    if (!shop) return;
    if (!accessToken) {
      appAlert('Sign in', 'Sign in to save favourite shops.');
      return;
    }
    try {
      await api.setFavourite(shop.id, !fav?.favourite);
      void queryClient.invalidateQueries({ queryKey: ['favourite', shop.id] });
      void queryClient.invalidateQueries({ queryKey: ['favourites'] });
    } catch (err) {
      appAlert('Could not save', err instanceof Error ? err.message : 'Try again.');
    }
  }

  function openDirections() {
    if (!shop) return;
    const q =
      shop.latitude != null && shop.longitude != null
        ? `${shop.latitude},${shop.longitude}`
        : encodeURIComponent(`${shop.name}, ${shop.address}`);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`);
  }

  function openContact() {
    if (!shop) return;
    const phone = shop.phone?.trim();
    if (!phone) {
      appAlert('No number yet', 'This shop hasn’t added a contact number.');
      return;
    }
    void Linking.openURL(`tel:${phone}`);
  }

  function formatShopPhone(phone: string) {
    const d = phone.replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
    if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
    return phone;
  }

  async function shareShop() {
    if (!shop) return;
    await Share.share({ message: `${shop.name}\n${shop.address}\nBook on CutLy` });
  }

  function openMenu(categoryId?: string) {
    if (!shop) return;
    router.push({
      pathname: '/shop/[id]/menu',
      params: { id: shop.id, ...(categoryId ? { category: categoryId } : {}) }
    });
  }

  if (!shop) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        {isLoading ? (
          <DetailScreenSkeleton />
        ) : (
          <View style={styles.missingWrap}>
            <ScreenBack onPress={() => router.back()} />
            <Text style={styles.missing}>
              {isError && error instanceof Error ? error.message : 'Shop not found.'}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const aboutText = `${shop.name} offers a curated set of services on CutLy — book ahead, skip the wait, and settle at the shop. Hygiene, trained staff, and clear pricing come first.`;
  const aboutShown = aboutOpen ? aboutText : `${aboutText.slice(0, 110)}…`;
  const footerPad = Math.max(insets.bottom, 10);

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
        scrollEventThrottle={32}
        onScroll={onScroll}
      >
        <View style={styles.hero}>
          {photos[0] ? (
            <Image source={photos[0]} style={styles.heroPhoto} contentFit="cover" />
          ) : (
            <View style={[styles.heroPhoto, { backgroundColor: colors.ink }]} />
          )}
          <PressScale style={styles.viewGallery} onPress={() => scrollToSection('gallery')} haptic>
            <Text style={styles.viewGalleryText}>View gallery ›</Text>
          </PressScale>
          <ScreenBack style={styles.heroBack} onPhoto onPress={() => router.back()} />
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.title} numberOfLines={2}>
                {shop.name}
                {shop.city ? `, ${shop.city}` : ''}
              </Text>
              <Text style={styles.metaLine}>
                Unisex · {priceBand(shop.priceFromPaise)}
                {shop.rating != null && shop.reviewCount > 0
                  ? ` · ★ ${shop.rating.toFixed(1)}`
                  : ' · New'}
              </Text>
            </View>
            <PressScale style={styles.iconBtn} onPress={() => void toggleHeart()} accessibilityLabel="Favourite">
              <Ionicons
                name={fav?.favourite ? 'heart' : 'heart-outline'}
                size={22}
                color={fav?.favourite ? colors.accent : colors.ink}
              />
            </PressScale>
            <PressScale style={styles.iconBtn} onPress={() => void shareShop()} accessibilityLabel="Share">
              <Ionicons name="share-outline" size={22} color={colors.ink} />
            </PressScale>
          </View>

          <PressScale style={styles.openBanner} onPress={() => setHoursOpen(true)} haptic>
            <Ionicons
              name={shop.isOpen ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={shop.isOpen ? colors.success : colors.muted}
            />
            <Text style={[styles.openText, { color: shop.isOpen ? colors.success : colors.muted }]}>
              {shop.isOpen ? 'Open now' : 'Closed'}
              {shop.hoursDetail ? ` | ${shop.hoursDetail}` : ''}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </PressScale>

          {/* Square-ish action tiles (Luzo) */}
          <View style={styles.quickRow}>
            <View style={styles.quickSlot}>
              <PressScale style={styles.quickTile} onPress={openDirections} haptic>
                <View style={styles.quickIconWrap}>
                  <Ionicons name="navigate" size={22} color={colors.ink} />
                </View>
                <Text style={styles.quickTitle}>Get Directions</Text>
                <Text style={styles.quickSub} numberOfLines={1}>
                  {shop.distanceKm > 0 ? `${shop.distanceKm.toFixed(1)} km ›` : 'Open maps ›'}
                </Text>
              </PressScale>
            </View>
            <View style={styles.quickSlot}>
              <PressScale style={styles.quickTile} onPress={openContact} haptic>
                <View style={styles.quickIconWrap}>
                  <Ionicons name="call" size={22} color={colors.ink} />
                </View>
                <Text style={styles.quickTitle}>Contact</Text>
                <Text style={styles.quickSub} numberOfLines={1}>
                  {shop.phone ? `${formatShopPhone(shop.phone)} ›` : 'No number yet'}
                </Text>
              </PressScale>
            </View>
          </View>

          <LinearGradient colors={['#F7E4C8', '#F0D4A8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.offerCard}>
            <Text style={styles.offerBadge}>CUTLY EXCLUSIVE</Text>
            <Text style={styles.offerTitle}>Book on CutLy</Text>
            <Text style={styles.offerSub}>Clear prices · visit code at the shop</Text>
            <View style={styles.offerValidPill}>
              <Ionicons name="calendar-outline" size={12} color="#8A5A12" />
              <Text style={styles.offerValid}>Valid on all days</Text>
            </View>
          </LinearGradient>
        </View>

        <View
          style={styles.tabsBar}
          onLayout={(e) => {
            tabsHeight.current = e.nativeEvent.layout.height;
          }}
        >
          <View style={styles.tabs}>
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <Pressable
                  key={t.id}
                  style={styles.tab}
                  onPress={() => scrollToSection(t.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>
                    {t.label}
                  </Text>
                  {on ? <View style={styles.tabLine} /> : <View style={styles.tabLineSpacer} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.tabBody} onLayout={onSectionLayout('services')}>
          <Text style={styles.sectionTitle}>Services</Text>
          <View style={styles.catGrid}>
            {gridCats.map((category) => (
              <PressScale
                key={category.id}
                style={[styles.catTile, { width: cell }]}
                onPress={() => openMenu(category.id)}
                haptic
                accessibilityRole="button"
                accessibilityLabel={category.label}
              >
                <ServiceCategoryThumb category={category} size={cell} shape="square" />
                <Text style={styles.catLabel} numberOfLines={2}>
                  {category.gridLabel || category.label}
                </Text>
              </PressScale>
            ))}
          </View>
        </View>

        <View style={styles.tabBody} onLayout={onSectionLayout('gallery')}>
          <Text style={styles.sectionTitle}>Gallery</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
            {(['All Photos', 'Ambience', 'Services'] as const).map((label, i) => {
              const uri = photos[i] || photos[0];
              return (
                <View key={label} style={styles.galleryCard}>
                  {uri ? (
                    <Image source={uri} style={styles.galleryImg} contentFit="cover" />
                  ) : (
                    <LinearGradient colors={['#2A2A2A', '#444']} style={styles.galleryImg}>
                      <Ionicons name="image-outline" size={28} color="#AAA" />
                    </LinearGradient>
                  )}
                  <Text style={styles.galleryCap}>
                    {label} ({uri ? photos.length || 1 : 0})
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.tabBody} onLayout={onSectionLayout('about')}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutBody}>
            {aboutShown}{' '}
            <Text style={styles.link} onPress={() => setAboutOpen((v) => !v)}>
              {aboutOpen ? 'show less' : '…show more'}
            </Text>
          </Text>

          <Text style={styles.sectionTitle}>Amenities</Text>
          {amenities.length ? (
            <View style={styles.amenityGrid}>
              {amenities.map((a) => (
                <View key={a} style={styles.amenity}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.ink} />
                  <Text style={styles.amenityText}>{a}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>Amenities coming soon.</Text>
          )}

          <LinearGradient colors={['#1E2836', '#3A4A5E']} style={styles.brandsBand}>
            <Text style={styles.brandsTitle}>Products used by salon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandsRow}>
              {(brands.length ? brands : ['Soon', 'Soon', 'Soon', 'Soon']).map((b, i) => (
                <View key={`${b}-${i}`} style={styles.brandChip}>
                  <Text style={styles.brandText} numberOfLines={2}>
                    {brands.length ? b : 'Soon'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </LinearGradient>

          <Text style={styles.sectionTitle}>Address</Text>
          <Text style={styles.aboutBody}>{shop.address}</Text>
          <Pressable onPress={openDirections} style={styles.dirLink}>
            <Ionicons name="locate" size={16} color={colors.accent} />
            <Text style={styles.link}>Get directions</Text>
          </Pressable>
        </View>

        <View style={styles.tabBody} onLayout={onSectionLayout('reviews')}>
          <Text style={styles.sectionTitle}>Customer Reviews ({reviews.length})</Text>
          {reviews.length === 0 ? (
            <Text style={styles.empty}>No Customer Reviews Yet</Text>
          ) : (
            reviews.slice(0, 20).map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <Text style={styles.reviewName}>
                  {review.customerName} · ★{review.shopRating}
                </Text>
                {review.text ? <Text style={styles.aboutBody}>{review.text}</Text> : null}
              </View>
            ))
          )}
        </View>

        <View style={{ height: 88 + footerPad }} />
      </ScrollView>

      {/* Hide sticky footer while Timings Modal is open — Android cold-open can paint footer over Modal. */}
      {!hoursOpen ? (
        <>
          <FloatingCartPill
            placement="shop"
            forShopId={shop.id}
            bottomOffset={56 + footerPad + 8}
          />
          <View style={[styles.footer, { paddingBottom: footerPad }]}>
            <PressScale style={[styles.footerBtn, styles.bookBtn]} onPress={() => openMenu()} haptic>
              <Text style={styles.bookText}>Book services</Text>
            </PressScale>
          </View>
        </>
      ) : null}

      <ShopHoursSheet
        shopId={shop.id}
        shopName={shop.name}
        visible={hoursOpen}
        onClose={() => setHoursOpen(false)}
      />
    </View>
  );
}

function screenStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { paddingBottom: 8 },
    missingWrap: { padding: spacing.md, gap: spacing.md },
    missing: { fontFamily: fontFamily.regular, fontSize: 15, color: colors.muted, textAlign: 'center' },
    hero: { height: 228, backgroundColor: colors.sand, overflow: 'hidden' },
    heroPhoto: { width: '100%', height: 228 },
    viewGallery: {
      position: 'absolute',
      bottom: 12,
      right: 16,
      backgroundColor: 'rgba(20,17,16,0.6)',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radii.pill
    },
    viewGalleryText: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.white },
    heroBack: { position: 'absolute', top: 4, left: H_PAD },
    titleBlock: { paddingHorizontal: H_PAD, paddingTop: spacing.md, gap: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
    title: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.ink, lineHeight: 24 },
    metaLine: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.muted, marginTop: 4 },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    openBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#EEF6F0',
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 11
    },
    openText: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 13 },
    quickRow: { flexDirection: 'row', gap: 10 },
    quickSlot: { flex: 1 },
    quickTile: {
      width: '100%',
      minHeight: 92,
      backgroundColor: colors.canvas,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      paddingHorizontal: 8,
      gap: 4
    },
    quickIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2
    },
    quickTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.ink, textAlign: 'center' },
    quickSub: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.muted, textAlign: 'center' },
    offerCard: {
      borderRadius: radii.md,
      padding: spacing.md,
      gap: 4,
      borderWidth: 1,
      borderColor: 'rgba(240,107,85,0.15)'
    },
    offerBadge: {
      fontFamily: fontFamily.bold,
      fontSize: 11,
      color: '#8A5A12',
      letterSpacing: 0.8
    },
    offerTitle: { fontFamily: fontFamily.bold, fontSize: 20, color: colors.ink, marginTop: 2 },
    offerSub: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.ink },
    offerValidPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(255,255,255,0.55)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radii.pill,
      marginTop: 6
    },
    offerValid: { fontFamily: fontFamily.semibold, fontSize: 11, color: '#8A5A12' },
    /** Sticky wrapper — full width so RN sticky header doesn’t collapse to a column. */
    tabsBar: {
      width: '100%',
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line
    },
    tabs: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      alignItems: 'stretch',
      width: '100%',
      marginTop: 0,
      paddingHorizontal: 4
    },
    tab: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingTop: 12,
      minWidth: 0
    },
    tabLabel: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.muted },
    tabLabelOn: { color: colors.ink, fontFamily: fontFamily.bold },
    tabLine: {
      marginTop: 10,
      height: 2.5,
      alignSelf: 'center',
      width: '64%',
      maxWidth: 72,
      borderRadius: 2,
      backgroundColor: colors.ink
    },
    tabLineSpacer: { marginTop: 10, height: 2.5, width: '64%', maxWidth: 72 },
    tabBody: { paddingHorizontal: H_PAD, paddingTop: spacing.md, paddingBottom: spacing.sm },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
    catTile: { alignItems: 'center', gap: 6, marginBottom: 4 },
    catLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      lineHeight: 14,
      color: colors.ink,
      textAlign: 'center',
      width: '100%',
      minHeight: 28
    },
    galleryRow: { gap: 12, paddingBottom: 8 },
    galleryCard: { width: 120, gap: 6 },
    galleryImg: {
      width: 120,
      height: 160,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: colors.canvas
    },
    galleryCap: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.ink },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.ink,
      marginTop: spacing.sm,
      marginBottom: spacing.sm
    },
    aboutBody: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.ink, lineHeight: 21 },
    link: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.accent },
    amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    amenity: { width: '46%', flexDirection: 'row', alignItems: 'center', gap: 8 },
    amenityText: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.ink, flex: 1 },
    brandsBand: {
      marginTop: spacing.lg,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingLeft: spacing.md,
      gap: 12
    },
    brandsTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.white },
    brandsRow: { gap: 12, paddingRight: spacing.md },
    brandChip: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.white,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8
    },
    brandText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      color: colors.ink,
      textAlign: 'center'
    },
    dirLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    reviewCard: {
      backgroundColor: colors.canvas,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: 4
    },
    reviewName: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.ink },
    empty: { fontFamily: fontFamily.regular, fontSize: 14, color: colors.muted, marginTop: 8 },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: H_PAD,
      paddingTop: 12,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line
    },
    footerBtn: {
      width: '100%',
      height: 52,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center'
    },
    bookBtn: { backgroundColor: colors.accent },
    bookText: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.white }
  });
}
