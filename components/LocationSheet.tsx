import { useEffect, useLayoutEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { distanceKm, readCurrentPlace, searchPlaces, type PlaceHit } from '@/services/device-location';
import { usePlaceStore, type SavedPlace } from '@/store/usePlaceStore';
import { useSessionStore } from '@/store/useSessionStore';

const labels = ['Home', 'Work', 'Other'] as const;
const sheetEase = Easing.bezier(0.32, 0.72, 0, 1);

function iconFor(label: string): keyof typeof Ionicons.glyphMap {
  if (label === 'Home') return 'home';
  if (label === 'Work') return 'briefcase';
  return 'location';
}

export function LocationSheet() {
  const colors = useColors();
  const styles = useThemedStyles(sheetStyles);
  const open = usePlaceStore((state) => state.sheetOpen);
  const closeSheet = usePlaceStore((state) => state.closeSheet);
  const saved = usePlaceStore((state) => state.saved);
  const active = usePlaceStore((state) => state.active);
  const phone = useSessionStore((state) => state.phone);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState<(typeof labels)[number]>('Home');
  const [here, setHere] = useState<PlaceHit | null>(null);
  const [hereStatus, setHereStatus] = useState<'idle' | 'loading' | 'denied' | 'unavailable'>('idle');
  const [gps, setGps] = useState<PlaceHit | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setAdding(false);
    setHereStatus('loading');
    void readCurrentPlace().then((place) => {
      if (!usePlaceStore.getState().sheetOpen) return;
      if (place === 'denied') {
        setHereStatus('denied');
        return;
      }
      if (place === 'unavailable') {
        setHereStatus('unavailable');
        return;
      }
      setHere(place);
      setGps(place);
      setHereStatus('idle');
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 280, easing: sheetEase });
  }, [open, progress, reduceMotion]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void searchPlaces(text).then((hits) => {
        setResults(hits);
        setSearching(false);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  function dismiss() {
    if (reduceMotion) {
      closeSheet();
      return;
    }
    progress.value = withTiming(0, { duration: 220, easing: sheetEase }, (finished) => {
      if (finished) scheduleOnRN(closeSheet);
    });
  }

  function choose(place: PlaceHit, savedId?: string | null) {
    void Haptics.selectionAsync();
    usePlaceStore.getState().select({ ...place, savedId: savedId ?? null });
  }

  function useHere() {
    if (here) {
      choose(here);
      return;
    }
    setHereStatus('loading');
    void readCurrentPlace().then((place) => {
      if (place === 'denied' || place === 'unavailable') {
        setHereStatus(place);
        return;
      }
      setHere(place);
      setGps(place);
      choose(place);
    });
  }

  function keep(place: PlaceHit) {
    void Haptics.selectionAsync();
    usePlaceStore.getState().save({ ...place, label });
  }

  function confirmRemove(place: SavedPlace) {
    Alert.alert(`Remove ${place.label}?`, place.address, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => usePlaceStore.getState().remove(place.id) }
    ]);
  }

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 640 }]
  }));

  const hereLine = hereStatus === 'loading'
    ? 'Finding your area…'
    : hereStatus === 'denied'
      ? 'Location permission is off'
      : hereStatus === 'unavailable'
        ? 'GPS is unavailable. Search instead.'
        : here?.address;

  return (
    <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.fill} onPress={dismiss} accessibilityLabel="Close location picker" />
        </Animated.View>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.header}>
            <Text style={styles.title}>{adding ? 'Add new address' : 'Select location'}</Text>
            <Pressable style={styles.close} onPress={adding ? () => setAdding(false) : dismiss} accessibilityLabel="Close">
              <Ionicons name={adding ? 'arrow-back' : 'close'} size={20} color={colors.ink} />
            </Pressable>
          </View>
          {adding ? (
            <View style={styles.chips}>
              {labels.map((item) => {
                const selected = label === item;
                return (
                  <Pressable key={item} onPress={() => setLabel(item)} style={[styles.chip, selected && styles.chipOn]}>
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for area, street name..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              returnKeyType="search"
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
            {query.trim().length >= 3 ? (
              <View>
                {searching ? <Text style={styles.note}>Searching…</Text> : null}
                {!searching && results.length === 0 ? <Text style={styles.note}>No matches for that search.</Text> : null}
                {results.map((place) => (
                  <Pressable key={`${place.latitude}-${place.longitude}`} style={styles.row} onPress={() => (adding ? keep(place) : choose(place))}>
                    <View style={styles.rowIcon}>
                      <Ionicons name="location-outline" size={18} color={colors.limeDark} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{place.area}</Text>
                      <Text style={styles.rowBody} numberOfLines={2}>{place.address}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <>
                {!adding ? (
                  <>
                    <Pressable style={styles.row} onPress={useHere}>
                      <View style={styles.rowIcon}>
                        <Ionicons name="locate" size={18} color={colors.limeDark} />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.currentTitle}>Use your current location</Text>
                        {hereLine ? <Text style={styles.rowBody}>{hereLine}</Text> : null}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Pressable>
                    <Pressable style={styles.row} onPress={() => setAdding(true)}>
                      <View style={styles.rowIcon}>
                        <Ionicons name="add" size={20} color={colors.limeDark} />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.currentTitle}>Add new address</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </Pressable>
                    <Text style={styles.section}>Your saved locations</Text>
                    {saved.length === 0 ? <Text style={styles.note}>Save Home or Work so you can jump back to it.</Text> : null}
                    {saved.map((place) => (
                      <SavedCard
                        key={place.id}
                        place={place}
                        phone={phone}
                        selected={active?.savedId === place.id}
                        gps={gps}
                        onOpen={() => choose(place, place.id)}
                        onShare={() => void Share.share({ message: `${place.label}\n${place.address}` })}
                        onMore={() => confirmRemove(place)}
                      />
                    ))}
                  </>
                ) : (
                  <Text style={styles.note}>Search for a street, then tap it to save as {label}.</Text>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SavedCard({
  place,
  phone,
  selected,
  gps,
  onOpen,
  onShare,
  onMore
}: {
  place: SavedPlace;
  phone: string | null;
  selected: boolean;
  gps: PlaceHit | null;
  onOpen: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const colors = useColors();
  const styles = useThemedStyles(sheetStyles);
  const km = gps ? distanceKm(gps, place) : null;
  const here = km !== null && km < 0.25;
  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={styles.cardIcon}>
        <Ionicons name={iconFor(place.label)} size={22} color={colors.limeDark} />
        {here ? <Text style={styles.here}>You're here</Text> : km !== null ? <Text style={styles.km}>{km.toFixed(1)} km</Text> : null}
        {selected ? <View style={styles.check}><Ionicons name="checkmark" size={12} color={colors.white} /></View> : null}
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{place.label}</Text>
          {selected ? <Text style={styles.used}>Frequently used</Text> : null}
        </View>
        <Text style={styles.cardAddress} numberOfLines={2}>{place.address}</Text>
        {phone ? <Text style={styles.phone}>Phone number: {phone}</Text> : null}
        <Pressable onPress={onMore} hitSlop={8} accessibilityLabel={`More options for ${place.label}`}>
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.muted} />
        </Pressable>
      </View>
      <Pressable onPress={onShare} hitSlop={8} accessibilityLabel={`Share ${place.label}`}>
        <Ionicons name="share-outline" size={18} color={colors.ink} />
      </Pressable>
    </Pressable>
  );
}

function sheetStyles(colors: Palette) {
  return StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,17,16,0.45)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md
  },
  title: { ...typography.title, color: colors.ink, fontSize: 20 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  chipOn: { backgroundColor: 'rgba(14,201,165,0.16)', borderColor: colors.accent },
  chipText: { ...typography.body, color: colors.ink },
  chipTextOn: { color: colors.limeDark, fontWeight: '600' },
  search: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    height: 48,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center'
  },
  input: { flex: 1, marginLeft: spacing.sm, color: colors.ink, fontSize: 16 },
  list: { padding: spacing.md, paddingBottom: spacing.xl, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: spacing.md },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,201,165,0.12)'
  },
  rowCopy: { flex: 1 },
  currentTitle: { ...typography.heading, color: colors.limeDark },
  rowTitle: { ...typography.heading, color: colors.ink },
  rowBody: { ...typography.caption, color: colors.muted, marginTop: 2 },
  section: { ...typography.body, color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm },
  note: { ...typography.body, color: colors.muted, paddingVertical: spacing.md },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm
  },
  cardIcon: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: 'rgba(14,201,165,0.16)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  here: {
    position: 'absolute',
    bottom: 6,
    fontSize: 9,
    fontWeight: '700',
    color: colors.white,
    backgroundColor: colors.limeDark,
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1
  },
  km: { position: 'absolute', bottom: 6, fontSize: 10, fontWeight: '700', color: colors.limeDark },
  check: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.limeDark,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardCopy: { flex: 1, gap: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { ...typography.heading, color: colors.ink },
  used: {
    ...typography.caption,
    color: colors.limeDark,
    backgroundColor: 'rgba(14,201,165,0.16)',
    overflow: 'hidden',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11
  },
  cardAddress: { ...typography.caption, color: colors.muted },
  phone: { ...typography.caption, color: colors.ink, marginTop: 2, marginBottom: 4 }
});
}
