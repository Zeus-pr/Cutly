import { appConfirm } from '@/store/useDialogStore';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CutlyWordmark } from '@/components/CutlyWordmark';
import { HomeServiceTileCard } from '@/components/HomeServiceTileCard';
import { PatternWavesHero } from '@/components/PatternWavesHero';
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
import { givenName, useSessionStore } from '@/store/useSessionStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { isStaleSavedPin } from '@/utils/placeTrust';
import { pickTodayVisit, todayVisitPhase } from '@/utils/todayVisit';

export default function Home() {
  return (
    <TabSceneEnter>
      <HomeBody />
    </TabSceneEnter>
  );
}

function HomeBody() {
  const colors = useColors();
  const styles = useThemedStyles(homeStyles);
  const city = useSessionStore((state) => state.city);
  const accessToken = useSessionStore((state) => state.accessToken);
  const customer = givenName(useSessionStore((state) => state.name));
  const active = usePlaceStore((state) => state.active);
  const placeTitle = active?.area || city || DEFAULT_PLACE.area;
  const placeLine = active?.address && active.address !== placeTitle ? active.address : null;
  const initial = (customer || 'U').slice(0, 1).toUpperCase();

  const dismissedReviewIds = useHomeVisitPromptStore((s) => s.dismissedReviewIds);
  const hydrateDismiss = useHomeVisitPromptStore((s) => s.hydrate);
  const dismissReviewPrompt = useHomeVisitPromptStore((s) => s.dismissReviewPrompt);

  useEffect(() => {
    void hydrateDismiss();
  }, [hydrateDismiss]);

  const { data: bookings = [], refetch } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.bookings(),
    enabled: Boolean(accessToken),
    // Live flip upcoming → started → completed without pull-to-refresh.
    refetchInterval: accessToken ? 4000 : false,
    refetchOnWindowFocus: true
  });
  const todayVisit = pickTodayVisit(bookings, new Date(), { dismissedReviewIds });
  const phase = todayVisit ? todayVisitPhase(todayVisit.status) : null;

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
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <CutlyWordmark />
          <PressScale
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            style={styles.avatar}
            haptic
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </PressScale>
        </View>

        <Pressable
          style={styles.location}
          onPress={() => usePlaceStore.getState().openSheet()}
          accessibilityRole="button"
          accessibilityLabel={`Location, ${placeTitle}`}
        >
          <Ionicons name="location" size={15} color={colors.accent} />
          <Text style={styles.locationText} numberOfLines={1}>
            {placeTitle}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.muted} />
        </Pressable>
        {placeLine ? (
          <Text style={styles.locationSub} numberOfLines={1}>
            {placeLine}
          </Text>
        ) : null}

        <PressScale
          style={styles.search}
          onPress={() => router.push('/search')}
          accessibilityLabel="Search shops and services"
          pressedScale={0.98}
        >
          <Ionicons name="search" size={18} color={colors.accent} />
          <Text style={styles.searchPlaceholder}>Search for a place or service</Text>
        </PressScale>

        <PressScale
          style={styles.visitsCard}
          onPress={() => router.push('/visits')}
          accessibilityRole="button"
          accessibilityLabel="My Visits"
          pressedScale={0.98}
        >
          <View style={styles.visitsIcon}>
            <Ionicons name="calendar-outline" size={20} color={colors.accent} />
          </View>
          <Text style={styles.visitsText}>My Visits</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </PressScale>

        <View style={styles.hero}>
          {todayVisit && phase === 'completed' ? (
            <TodayVisitHero
              booking={todayVisit}
              onStartReview={() =>
                router.push({
                  pathname: '/booking/rate',
                  params: {
                    bookingId: todayVisit.id,
                    shopName: todayVisit.shop.name,
                    barberName: todayVisit.barber.name,
                    shopOnly: '1'
                  }
                })
              }
              onDismissReview={() => dismissReviewPrompt(todayVisit.id)}
            />
          ) : todayVisit ? (
            <PressScale
              onPress={() =>
                router.push({
                  pathname: '/booking/[id]',
                  params: { id: todayVisit.id, from: 'home' }
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Open today’s visit"
              pressedScale={0.98}
              haptic
            >
              <TodayVisitHero booking={todayVisit} />
            </PressScale>
          ) : (
            <PatternWavesHero height={168} />
          )}
        </View>

        <View style={styles.servicesHead}>
          <View style={styles.servicesRule} />
          <Text style={styles.servicesTitle}>SERVICES FOR YOU</Text>
          <View style={styles.servicesRule} />
        </View>

        <View style={styles.tileGrid}>
          {HOME_SERVICE_TILES.map((tile, index) => (
            <HomeServiceTileCard
              key={tile.id}
              tile={tile}
              index={index}
              onPress={() => onTilePress(tile.id, tile.serviceName)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function homeStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    content: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 120 },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.sand,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line
    },
    avatarText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.ink
    },
    location: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
    locationText: { ...typography.heading, color: colors.ink, flexShrink: 1, fontSize: 15 },
    locationSub: { ...typography.caption, color: colors.muted, marginLeft: 19, marginTop: 2 },
    search: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      height: 48,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
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
    visitsCard: {
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.accent,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm
    },
    visitsIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: 'rgba(240,107,85,0.12)',
      alignItems: 'center',
      justifyContent: 'center'
    },
    visitsText: {
      flex: 1,
      fontFamily: fontFamily.semibold,
      fontSize: 16,
      color: colors.ink
    },
    hero: { marginTop: spacing.md },
    servicesHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.lg,
      marginBottom: spacing.md
    },
    servicesRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
    servicesTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.4,
      color: colors.ink
    },
    tileGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between'
    }
  });
}
