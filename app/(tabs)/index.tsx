import type React from 'react';
import { appConfirm } from '@/store/useDialogStore';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as CoverImage, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
import { CutlyWordmark } from '@/components/CutlyWordmark';
import { HomeServiceRails } from '@/components/HomeServiceRails';
import { PressScale } from '@/components/PressScale';
import { TabSceneEnter } from '@/components/TabSceneEnter';
import { TodayVisitHero } from '@/components/TodayVisitHero';
import { HOME_SERVICE_TILES } from '@/constants/homeTiles';
import { TILE_EXPLORE_TAB } from '@/constants/exploreCategories';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { api } from '@/services/api';
import { DEFAULT_PLACE, readCurrentPlace } from '@/services/device-location';
import { useHomeVisitPromptStore } from '@/store/useHomeVisitPromptStore';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { isStaleSavedPin } from '@/utils/placeTrust';
import { pickTodayVisit } from '@/utils/todayVisit';

const HOME_PROMOS = [
  {
    id: 'cut',
    image: require('@/assets/home-photos/fresh-cut.jpg'),
    title: 'A fresh cut',
    accent: 'you.',
    sub: 'Fades, trims, and a chair that’s ready when you are.'
  },
  {
    id: 'spa',
    image: require('@/assets/home-photos/self-care-spa.jpg'),
    title: 'A little time',
    accent: 'you.',
    sub: 'Salons, wellness, nails, tattoos, piercings — all in one place.'
  }
] as const;

const EXPLORE_ROW = ['salon', 'nails', 'wellness', 'tattoo', 'piercing'] as const;
const EXPLORE_LABEL: Record<(typeof EXPLORE_ROW)[number], string> = {
  salon: 'Hair',
  nails: 'Nails',
  wellness: 'Wellness',
  tattoo: 'Tattoo',
  piercing: 'Piercing'
};

export default function Home() {
  return (
    <TabSceneEnter>
      <HomeBody />
    </TabSceneEnter>
  );
}

function HomeBody() {
  const colors = useColors();
  const promoRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const promoIndex = useRef(0);
  const [promoW, setPromoW] = useState(0);
  const [promoPage, setPromoPage] = useState(0);
  const styles = useThemedStyles(homeStyles);
  const city = useSessionStore((state) => state.city);
  const accessToken = useSessionStore((state) => state.accessToken);
  const active = usePlaceStore((state) => state.active);
  const placeTitle = active?.area || city || DEFAULT_PLACE.area;
  const placeAddress = active?.address && active.address !== placeTitle ? active.address : null;
  const placeLine = placeAddress ? placeAddress.slice(0, 15) : null;

  const dismissedReviewIds = useHomeVisitPromptStore((s) => s.dismissedReviewIds);
  const hydrateDismiss = useHomeVisitPromptStore((s) => s.hydrate);
  const dismissReview = useHomeVisitPromptStore((s) => s.dismissReviewPrompt);

  useEffect(() => {
    void hydrateDismiss();
  }, [hydrateDismiss]);

  useEffect(() => {
    if (promoW <= 0) return;
    const id = setInterval(() => {
      const next = promoIndex.current + 1;
      const page = next % HOME_PROMOS.length;
      setPromoPage(page);
      promoRef.current?.scrollTo({ x: next * promoW, animated: true });
      if (next === HOME_PROMOS.length) {
        promoIndex.current = 0;
        setTimeout(() => promoRef.current?.scrollTo({ x: 0, animated: false }), 450);
        return;
      }
      promoIndex.current = next;
    }, 5000);
    return () => clearInterval(id);
  }, [promoW]);

  const { data: bookings = [], refetch } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.bookings(),
    enabled: Boolean(accessToken),
    // Live flip upcoming → started → completed without pull-to-refresh.
    refetchInterval: accessToken ? 4000 : false,
    refetchOnWindowFocus: true
  });
  const todayVisit = pickTodayVisit(bookings, new Date(), { dismissedReviewIds });
  const { data: inbox } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications(),
    enabled: Boolean(accessToken)
  });
  const unread = inbox?.unreadCount ?? 0;
  const tucked = useSharedValue(0);
  const tuckedOn = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const leafH = useSharedValue(360);
  const searchRef = useRef<React.ComponentRef<typeof View>>(null);
  const catRef = useRef<LottieView>(null);
  const catPhase = useRef<'rise' | 'eyes' | 'sink' | 'down'>('rise');
  const sinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCatFinish = useCallback((isCancelled?: boolean) => {
    if (isCancelled) return;
    if (catPhase.current === 'rise') {
      catPhase.current = 'eyes';
      catRef.current?.play(30, 67);
      sinkTimer.current = setTimeout(() => {
        catPhase.current = 'sink';
        catRef.current?.play(90, 112);
      }, 30000);
      return;
    }
    if (catPhase.current === 'eyes') {
      catRef.current?.play(30, 67);
      return;
    }
    if (catPhase.current === 'sink') {
      catPhase.current = 'down';
      sinkTimer.current = setTimeout(() => {
        catPhase.current = 'rise';
        catRef.current?.play(0, 28);
      }, 30000);
    }
  }, []);
  useEffect(() => {
    catPhase.current = 'rise';
    const frame = requestAnimationFrame(() => catRef.current?.play(0, 28));
    return () => {
      cancelAnimationFrame(frame);
      if (sinkTimer.current) clearTimeout(sinkTimer.current);
    };
  }, []);
  const alignLeaf = useCallback(() => {
    searchRef.current?.measureInWindow((_x, y) => {
      if (y > 80) leafH.value = y;
    });
  }, [leafH]);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      const next = event.contentOffset.y > 12 ? 1 : 0;
      if (tuckedOn.value === next) return;
      tuckedOn.value = next;
      tucked.value = withTiming(next, { duration: 420, easing: Easing.out(Easing.cubic) });
    }
  });
  const stickyStyle = useAnimatedStyle(() => ({
    marginHorizontal: 12 * tucked.value,
    borderTopLeftRadius: 22 * tucked.value,
    borderTopRightRadius: 22 * tucked.value,
    borderBottomLeftRadius: 22 * tucked.value,
    borderBottomRightRadius: 22 * tucked.value,
    shadowOpacity: 0.14 * tucked.value,
    elevation: 8 * tucked.value,
    backgroundColor: interpolateColor(tucked.value, [0, 1], ['transparent', colors.surface])
  }));
  const leafStyle = useAnimatedStyle(() => ({
    height: leafH.value,
    transform: [{ translateY: -scrollY.value }]
  }));

  useFocusEffect(
    useCallback(() => {
      if (accessToken) void refetch();
      const state = usePlaceStore.getState();
      if (!state.areaConfirmed || state.stalePromptShown || !state.active?.savedId) return;
      let live = true;
      void readCurrentPlace({ forceFresh: true }).then((gps) => {
        if (!live || gps === 'denied' || gps === 'unavailable') return;
        const current = usePlaceStore.getState();
        if (!current.active?.savedId || current.stalePromptShown) return;
        if (!isStaleSavedPin(gps, current.active)) return;
        current.markStalePromptShown();
        appConfirm({
          title: 'You seem elsewhere',
          message: `Saved pin is ${current.active.area}. Use your current location instead?`,
          cancelLabel: 'Keep saved',
          confirmLabel: 'Use current',
          onConfirm: () =>
            void readCurrentPlace({ forceFresh: true }).then((fresh) => {
              if (fresh === 'denied' || fresh === 'unavailable') return;
              usePlaceStore.getState().select({ ...fresh, originKind: 'gps' });
            })
        });
      });
      return () => {
        live = false;
      };
    }, [accessToken, refetch])
  );

  function onTilePress(tileId: string, serviceName: string | null) {
    const tab = TILE_EXPLORE_TAB[tileId];
    if (tab) {
      router.push({ pathname: '/category/[id]', params: { id: tab } });
      return;
    }
    if (!serviceName) {
      router.push('/search');
      return;
    }
    router.push({ pathname: '/search/[service]', params: { service: serviceName } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Animated.View pointerEvents="none" style={[styles.leafBand, leafStyle]}>
        <CoverImage
          source={require('@/assets/home-photos/leaf-pattern.png')}
          style={styles.leafImage}
          resizeMode="cover"
        />
      </Animated.View>
      <Animated.View
        style={[styles.sticky, stickyStyle]}
        onLayout={alignLeaf}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandCopy}>
            <CutlyWordmark />
            <Pressable
              style={styles.location}
              onPress={() => usePlaceStore.getState().openSheet()}
              accessibilityRole="button"
              accessibilityLabel={`Location, ${placeTitle}`}
            >
              <Ionicons name="location" size={14} color={colors.accent} />
              <Text style={styles.locationText} numberOfLines={1}>
                {placeTitle}
              </Text>
              <Ionicons name="chevron-down" size={13} color={colors.muted} />
            </Pressable>
          </View>
          <PressScale
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
            style={styles.bell}
            haptic
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            {unread > 0 ? <View style={styles.bellDot} /> : null}
          </PressScale>
        </View>
        {placeLine ? (
          <Text style={styles.locationSub} numberOfLines={1}>
            {placeLine}
          </Text>
        ) : null}
      </Animated.View>
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View>
          <Text style={styles.headline}>
            Find your kind{'\n'}of <Text style={styles.headlineAccent}>self-care.</Text>
          </Text>
          <View pointerEvents="none" style={styles.catPeek}>
            <LottieView
              ref={catRef}
              source={require('@/assets/animations/home-cat.json')}
              loop={false}
              resizeMode="cover"
              style={styles.catLottie}
              onAnimationFinish={onCatFinish}
            />
          </View>
        </View>

        <View ref={searchRef} style={styles.searchSlot} onLayout={alignLeaf}>
          <PressScale
            style={styles.search}
            onPress={() => router.push('/search')}
            accessibilityLabel="Search shops and services"
            pressedScale={0.98}
          >
            <Ionicons name="search" size={18} color={colors.muted} />
            <Text style={styles.searchPlaceholder}>Search salons, nails, wellness...</Text>
            <Ionicons name="options-outline" size={18} color={colors.accent} />
          </PressScale>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Explore services</Text>
          <Pressable onPress={() => router.push('/search')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.sectionLink}>See all</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.exploreRow}
        >
          {EXPLORE_ROW.map((id) => {
            const tile = HOME_SERVICE_TILES.find((item) => item.id === id);
            if (!tile) return null;
            return (
              <PressScale
                key={id}
                style={styles.exploreItem}
                onPress={() => onTilePress(tile.id, tile.serviceName)}
                haptic
                accessibilityLabel={EXPLORE_LABEL[id]}
              >
                <View style={styles.exploreShadow}>
                  {tile.image ? (
                    <Image source={tile.image} style={styles.exploreImage} contentFit="cover" />
                  ) : (
                    <View style={[styles.exploreImage, { backgroundColor: colors.sand }]} />
                  )}
                </View>
                <Text style={styles.exploreLabel}>{EXPLORE_LABEL[id]}</Text>
              </PressScale>
            );
          })}
        </ScrollView>

        {todayVisit ? (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>My Visits</Text>
              <Pressable onPress={() => router.push('/visits')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.sectionLink}>View all</Text>
              </Pressable>
            </View>
            <TodayVisitHero
              booking={todayVisit}
              onPress={() =>
                router.push({
                  pathname: '/booking/[id]',
                  params: { id: todayVisit.id, from: 'home' }
                })
              }
              onStartReview={() =>
                router.push({
                  pathname: '/booking/[id]',
                  params: { id: todayVisit.id, from: 'home' }
                })
              }
              onDismissReview={() => dismissReview(todayVisit.id)}
            />
          </>
        ) : null}

        <View
          style={styles.promo}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            if (next > 0 && next !== promoW) setPromoW(next);
          }}
        >
          <ScrollView
            ref={promoRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              if (promoW <= 0) return;
              let next = Math.round(event.nativeEvent.contentOffset.x / promoW);
              if (next >= HOME_PROMOS.length) {
                next = 0;
                promoRef.current?.scrollTo({ x: 0, animated: false });
              }
              promoIndex.current = next;
              setPromoPage(next);
            }}
          >
            {[...HOME_PROMOS, HOME_PROMOS[0]].map((slide, index) => (
              <Pressable
                key={`${slide.id}-${index}`}
                style={[styles.promoSlide, promoW > 0 ? { width: promoW } : null]}
                onPress={() => router.push('/(tabs)/explore')}
                accessibilityRole="button"
                accessibilityLabel={`${slide.title} for ${slide.accent} Explore nearby`}
              >
                <CoverImage source={slide.image} style={styles.promoImage} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(23,38,60,0.55)', 'rgba(23,38,60,0.05)', 'rgba(23,38,60,0)']}
                  locations={[0, 0.4, 0.58]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.promoCopy} pointerEvents="none">
                  <Text style={styles.promoTitle}>
                    {slide.title}
                    {'\n'}for <Text style={styles.promoTitleAccent}>{slide.accent}</Text>
                  </Text>
                  <Text style={styles.promoSub}>{slide.sub}</Text>
                  <View style={styles.promoBtn}>
                    <Text style={styles.promoBtnText}>Explore nearby</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.white} />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.promoDots} pointerEvents="none">
            {HOME_PROMOS.map((slide, index) => (
              <View
                key={slide.id}
                style={[styles.promoDot, index === promoPage ? styles.promoDotOn : null]}
              />
            ))}
          </View>
        </View>

        <HomeServiceRails />
        <View style={styles.emptyFoot}>
          <LottieView
            source={require('@/assets/animations/home-empty-cat.json')}
            autoPlay
            loop
            style={styles.emptyCat}
          />
          <Text style={styles.emptyTitle}>woah so empty!</Text>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

function homeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    sticky: {
      zIndex: 2,
      backgroundColor: colors.canvas,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: 4,
      shadowColor: '#17263C',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 14,
      shadowOpacity: 0
    },
    leafBand: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 0,
      overflow: 'hidden',
      borderBottomLeftRadius: 32,
      borderBottomRightRadius: 32
    },
    leafImage: { width: '100%', height: '100%', opacity: 0.3 },
    scroll: { flex: 1, zIndex: 1 },
    content: { flexGrow: 1, paddingHorizontal: spacing.md, paddingTop: 16, paddingBottom: 72 },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md
    },
    brandCopy: { flex: 1, minWidth: 0, gap: 6 },
    bell: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line
    },
    bellDot: {
      position: 'absolute',
      top: 10,
      right: 11,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent
    },
    location: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      maxWidth: '100%'
    },
    locationText: { ...typography.heading, color: colors.ink, flexShrink: 1, fontSize: 15 },
    locationSub: { ...typography.caption, color: colors.muted, marginLeft: 18, marginTop: 2 },
    headline: {
      zIndex: 1,
      marginTop: spacing.sm,
      fontFamily: fontFamily.bold,
      fontSize: 32,
      lineHeight: 38,
      letterSpacing: -0.6,
      color: colors.ink
    },
    headlineAccent: { color: colors.accent },
    catPeek: {
      position: 'absolute',
      right: 8,
      bottom: -10,
      width: 168,
      height: 310,
      overflow: 'hidden',
      zIndex: 2
    },
    catLottie: {
      position: 'absolute',
      right: -6,
      bottom: 0,
      width: 168,
      height: 299
    },
    searchSlot: { marginTop: 0, zIndex: 3 },
    search: {
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      height: 48,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      gap: spacing.sm
    },
    searchPlaceholder: {
      flex: 1,
      color: colors.muted,
      fontSize: 15,
      fontFamily: fontFamily.regular
    },
    sectionRow: {
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      lineHeight: 22,
      color: colors.ink
    },
    sectionLink: {
      fontFamily: fontFamily.semibold,
      fontSize: 14,
      color: colors.accent
    },
    exploreRow: { gap: 14, paddingRight: spacing.md, paddingVertical: 6 },
    exploreItem: { width: 72, alignItems: 'center', gap: 8 },
    exploreShadow: {
      width: 72,
      height: 92,
      borderRadius: 16,
      backgroundColor: colors.surface,
      shadowColor: '#17263C',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 5
    },
    exploreImage: { width: 72, height: 92, borderRadius: 16 },
    exploreLabel: {
      fontFamily: fontFamily.medium,
      fontSize: 12,
      lineHeight: 16,
      color: colors.ink,
      textAlign: 'center'
    },
    promo: {
      marginTop: spacing.lg,
      height: 200,
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: '#1C1410'
    },
    promoSlide: { height: 200 },
    promoImage: {
      width: '100%',
      height: 200
    },
    promoDots: {
      position: 'absolute',
      right: 14,
      bottom: 14,
      flexDirection: 'row',
      gap: 6
    },
    promoDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.45)'
    },
    promoDotOn: { backgroundColor: colors.white, width: 14 },
    promoCopy: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: '62%',
      justifyContent: 'flex-end',
      padding: spacing.md,
      gap: 8
    },
    promoTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 26,
      lineHeight: 30,
      letterSpacing: -0.4,
      color: colors.white
    },
    promoTitleAccent: { color: '#FFB1A6' },
    promoSub: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      lineHeight: 18,
      color: 'rgba(255,255,255,0.9)',
      maxWidth: 240
    },
    promoBtn: {
      alignSelf: 'flex-start',
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 8
    },
    promoBtnText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.white },
    emptyFoot: {
      marginTop: 'auto',
      alignItems: 'center',
      paddingTop: spacing.lg
    },
    emptyCat: { width: 260, height: 151, marginBottom: -50 },
    emptyTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 32,
      lineHeight: 36,
      letterSpacing: -0.6,
      color: colors.ink,
      textAlign: 'center'
    }
  });
}
