import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, PermissionsAndroid, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { placeFromGeocode } from '@/services/device-location';
import { usePlaceStore } from '@/store/usePlaceStore';
import { useSessionStore } from '@/store/useSessionStore';

const pointers = [
  { icon: 'time-outline' as const, title: 'Real-time availability', body: 'See open slots as they happen' },
  { icon: 'storefront-outline' as const, title: 'Trusted barber shops', body: 'Rated shops near you' },
  { icon: 'shield-checkmark-outline' as const, title: 'Easy & secure booking', body: 'Hold a slot and pay a small advance' }
];

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

export default function Welcome() {
  const colors = useColors();
  const styles = useThemedStyles(welcomeStyles);
  const pager = useRef<ScrollView>(null);
  const left = useRef(false);
  const [page, setPage] = useState(0);
  const [manual, setManual] = useState(false);
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const { width } = useWindowDimensions();
  const [pageHeight, setPageHeight] = useState(0);
  const [loaded] = useFonts({
    PoppinsExtraBold: require('@/assets/fonts/Poppins-ExtraBold.ttf'),
    PoppinsMedium: require('@/assets/fonts/Poppins-Medium.ttf')
  });

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  function finish(nextCity?: string) {
    if (left.current) return;
    left.current = true;
    if (nextCity?.trim()) useSessionStore.getState().setCity(nextCity);
    useSessionStore.getState().passIntro();
    router.replace('/auth');
  }

  function go(next: number) {
    setPage(next);
    pager.current?.scrollTo({ x: next * width, animated: !reduceMotion });
  }

  async function allowLocation() {
    if (busy || left.current) return;
    setBusy(true);
    const deadline = setTimeout(() => finish(), 4000);
    try {
      const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
      let granted = await PermissionsAndroid.check(fine);
      if (!granted) {
        const result = await PermissionsAndroid.request(fine);
        granted = result === PermissionsAndroid.RESULTS.GRANTED;
      }
      if (!granted) {
        clearTimeout(deadline);
        finish();
        return;
      }
      const last = await within(Location.getLastKnownPositionAsync(), 800);
      const position = last ?? await within(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
        2000
      );
      clearTimeout(deadline);
      if (!position) {
        finish();
        return;
      }
      const places = await within(Location.reverseGeocodeAsync(position.coords), 1500);
      const first = places?.[0];
      if (first) {
        const hit = placeFromGeocode(first, position.coords);
        usePlaceStore.getState().select(hit);
        finish(hit.city);
        return;
      }
      finish();
    } catch {
      clearTimeout(deadline);
      finish();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.orbTop} />
      <View style={styles.orbBottom} />
      {page > 0 && page < 3 ? (
        <Pressable style={styles.skip} onPress={() => go(3)}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      ) : null}

      <View style={styles.pager} onLayout={(event) => setPageHeight(event.nativeEvent.layout.height)}>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        style={{ height: pageHeight }}
        onMomentumScrollEnd={(event) => {
          if (!width) return;
          setPage(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
      >
        <View style={[styles.page, { width, height: pageHeight }]}>
          <Text style={[styles.logo, loaded && styles.logoFont]}>CutLy</Text>
          <Text style={[styles.tagline, loaded && styles.taglineFont]}>GROOMING MADE EASY</Text>
          <Text style={styles.pitch}>Find a barber.{'\n'}Book instantly.</Text>
        </View>

        <View style={[styles.page, styles.pageStart, { width, height: pageHeight }]}>
          <Text style={styles.headline}>Look Sharp{'\n'}Every Day</Text>
          <Text style={styles.sub}>Find trusted barber shops near you and book in seconds.</Text>
        </View>

        <View style={[styles.page, styles.pageStart, { width, height: pageHeight }]}>
          <Text style={styles.headline}>Look Sharp{'\n'}Every Day</Text>
          <Text style={styles.sub}>Find trusted barber shops near you and book in seconds.</Text>
          <View style={styles.points}>
            {pointers.map((item) => (
              <View key={item.title} style={styles.point}>
                <View style={styles.pointIcon}>
                  <Ionicons name={item.icon} size={20} color={colors.accent} />
                </View>
                <View style={styles.pointCopy}>
                  <Text style={styles.pointTitle}>{item.title}</Text>
                  <Text style={styles.pointBody}>{item.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.page, { width, height: pageHeight }]}>
          <View style={styles.pin}>
            <Ionicons name="location" size={36} color={colors.accent} />
          </View>
          <Text style={styles.headlineCenter}>Allow location access</Text>
          <Text style={styles.subCenter}>Find nearby barber shops and see live availability.</Text>
          {manual ? (
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City name"
              placeholderTextColor={colors.muted}
              style={styles.cityInput}
              autoFocus
            />
          ) : null}
        </View>
      </ScrollView>
      </View>

      <View style={styles.footer}>
        {page > 0 ? (
          <View style={styles.dots}>
            {[1, 2, 3].map((dot) => (
              <View key={dot} style={[styles.dot, page === dot && styles.dotOn]} />
            ))}
          </View>
        ) : <View style={styles.dots} />}
        {page === 0 ? (
          <Pressable style={styles.glass} onPress={() => go(1)}>
            <Text style={styles.glassText}>Get Started</Text>
          </Pressable>
        ) : null}
        {page === 1 || page === 2 ? (
          <Pressable style={styles.glass} onPress={() => go(page + 1)}>
            <Text style={styles.glassText}>Next</Text>
          </Pressable>
        ) : null}
        {page === 3 && !manual ? (
          <>
            <Pressable style={styles.glass} disabled={busy} onPress={() => void allowLocation()}>
              <Text style={styles.glassText}>{busy ? 'Checking…' : 'Allow Location'}</Text>
            </Pressable>
            <Pressable onPress={() => setManual(true)}>
              <Text style={styles.manual}>Enter Location Manually</Text>
            </Pressable>
          </>
        ) : null}
        {page === 3 && manual ? (
          <Pressable style={styles.glass} onPress={() => finish(city)}>
            <Text style={styles.glassText}>Continue</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function welcomeStyles(colors: Palette) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  orbTop: {
    position: 'absolute',
    top: -30,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(14,201,165,0.22)'
  },
  orbBottom: {
    position: 'absolute',
    right: -50,
    bottom: 180,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(14,201,165,0.16)'
  },
  skip: { position: 'absolute', top: 64, right: spacing.lg, zIndex: 2 },
  skipText: { ...typography.body, color: colors.muted },
  pager: { flex: 1 },
  page: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  pageStart: { alignItems: 'flex-start', justifyContent: 'center' },
  logo: { fontSize: 64, color: colors.ink, letterSpacing: -1 },
  logoFont: { fontFamily: 'PoppinsExtraBold' },
  tagline: { marginTop: 8, fontSize: 13, letterSpacing: 3, color: colors.ink },
  taglineFont: { fontFamily: 'PoppinsMedium' },
  pitch: { ...typography.title, color: colors.ink, textAlign: 'center', marginTop: spacing.xl },
  headline: { ...typography.display, color: colors.ink },
  headlineCenter: { ...typography.title, color: colors.ink, textAlign: 'center', marginTop: spacing.lg },
  sub: { ...typography.body, color: colors.muted, marginTop: spacing.md },
  subCenter: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  points: { marginTop: spacing.xl, gap: spacing.lg, alignSelf: 'stretch' },
  point: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pointIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(14,201,165,0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pointCopy: { flex: 1 },
  pointTitle: { ...typography.heading, color: colors.ink },
  pointBody: { ...typography.caption, color: colors.muted, marginTop: 2 },
  pin: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(14,201,165,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cityInput: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 16
  },
  footer: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  dots: { height: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.accent, width: 18 },
  glass: {
    height: 54,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(14,201,165,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EC9A5',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5
  },
  glassText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  manual: { textAlign: 'center', color: colors.ink, ...typography.body }
});
}
