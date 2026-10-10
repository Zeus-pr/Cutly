import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '@/components/BackButton';
import { HoursEditor } from '@/components/HoursEditor';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import { amenities, catalogueForKinds, productBrandSuggestions, shopKinds, type CatalogueService, type ShopKindId } from '@/constants/catalogue';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { readCurrentPlace, type PlaceHit } from '@/services/device-location';
import { partnerApi } from '@/services/partner';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { defaultHourDrafts, draftsToApiDays, type HourDayDraft } from '@/utils/hoursDraft';

const steps = ['Name', 'Location', 'Shop type', 'Services', 'Brands', 'Chairs', 'Workers', 'Hours', 'Features', 'Photos'] as const;
const ease = Easing.bezier(0.22, 1, 0.36, 1);

export default function PartnerSetup() {
  const colors = useColors();
  const styles = useThemedStyles(setupStyles);
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const progress = useSharedValue(1 / steps.length);
  const [fonts] = useFonts({
    PoppinsExtraBold: require('@/assets/fonts/Poppins-ExtraBold.ttf')
  });
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [name, setName] = useState('');
  const [place, setPlace] = useState<PlaceHit | null>(null);
  const [manual, setManual] = useState('');
  const [kinds, setKinds] = useState<ShopKindId[]>([]);
  const [picked, setPicked] = useState<CatalogueService[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [customBrand, setCustomBrand] = useState('');
  const [chairs, setChairs] = useState(2);
  const [workers, setWorkers] = useState(2);
  const [hourDrafts, setHourDrafts] = useState<HourDayDraft[]>(defaultHourDrafts);
  const [hoursTouched, setHoursTouched] = useState(false);
  const [chosenAmenities, setChosenAmenities] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(false);

  const menu = catalogueForKinds(kinds);

  useEffect(() => {
    progress.value = withTiming((step + 1) / steps.length, {
      duration: reduceMotion ? 0 : 320,
      easing: ease
    });
  }, [step, reduceMotion, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  function toggleKind(id: ShopKindId) {
    void Haptics.selectionAsync();
    setKinds((current) => {
      const next = current.includes(id) ? current.filter((k) => k !== id) : [...current, id];
      setPicked((services) => {
        if (!next.length) return [];
        const allowed = new Set(catalogueForKinds(next).map((s) => s.name));
        return services.filter((s) => allowed.has(s.name));
      });
      return next;
    });
  }

  function toggleBrand(name: string) {
    void Haptics.selectionAsync();
    setBrands((current) => (current.includes(name) ? current.filter((b) => b !== name) : [...current, name]));
  }

  function addCustomBrand() {
    const name = customBrand.trim();
    if (name.length < 2) return setError('Enter a brand name.');
    if (brands.some((b) => b.toLowerCase() === name.toLowerCase())) {
      setCustomBrand('');
      return;
    }
    setError('');
    setBrands((current) => [...current, name].slice(0, 24));
    setCustomBrand('');
    void Haptics.selectionAsync();
  }

  function toggleService(service: CatalogueService) {
    void Haptics.selectionAsync();
    setPicked((current) =>
      current.some((item) => item.name === service.name)
        ? current.filter((item) => item.name !== service.name)
        : [...current, { ...service }]
    );
  }

  function updateService(serviceName: string, patch: Partial<CatalogueService>) {
    setPicked((current) => current.map((item) => (item.name === serviceName ? { ...item, ...patch } : item)));
  }

  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setError('');
    setStep(next);
    void Haptics.selectionAsync();
  }

  async function locate() {
    setError('');
    const next = await readCurrentPlace({ forceFresh: true });
    if (next === 'denied' || next === 'unavailable') {
      setError('Allow location, or type the area below.');
      return;
    }
    setPlace(next);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function pickPhotos() {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo access to add shop pictures.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.35,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 5
    });
    if (result.canceled) return;
    const urls = result.assets.slice(0, 5).flatMap((asset) => (asset.base64 ? [`data:image/jpeg;base64,${asset.base64}`] : []));
    if (!urls.length) {
      setError('Could not read those photos.');
      return;
    }
    setPhotos(urls);
  }

  async function finish() {
    if (!kinds.length) return setError('Choose at least one shop type.');
    if (picked.length === 0) return setError('Choose at least one service.');
    const address = place?.address || manual.trim();
    const city = place?.city || address;
    setBusy(true);
    setError('');
    setSaved(false);
    setDone(true);
    try {
      await partnerApi.setup({
        name: name.trim(),
        address,
        city,
        latitude: place?.latitude ?? 23.2324,
        longitude: place?.longitude ?? 87.8615,
        kinds,
        kind: kinds[0],
        productBrands: brands,
        services: picked,
        chairCount: chairs,
        workersPresent: Math.min(workers, chairs)
      });
      if (hoursTouched) {
        const days = draftsToApiDays(hourDrafts);
        if (days.length) await partnerApi.setHours(days);
      }
      if (chosenAmenities.length) await partnerApi.amenities(chosenAmenities);
      if (photos.length) await partnerApi.photos(photos);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    } catch (err) {
      setDone(false);
      setSaved(false);
      setError(err instanceof Error ? err.message : 'Could not save the shop.');
      setBusy(false);
    }
  }

  async function next() {
    setError('');
    if (step === 0 && name.trim().length < 2) return setError('Enter the shop name.');
    if (step === 1 && !place && manual.trim().length < 3) return setError('Add the shop location.');
    if (step === 2 && kinds.length === 0) return setError('Pick at least one shop type.');
    if (step === 3 && picked.length === 0) return setError('Choose at least one service.');
    if (step === 5 && chairs < 1) return setError('A shop needs at least one seat.');
    if (step === 7) {
      const days = draftsToApiDays(hourDrafts);
      if (!days.length) return setError('Keep at least one open day, or Skip for default hours.');
      setHoursTouched(true);
      go(8);
      return;
    }
    if (step < 6) {
      if (step === 5) setWorkers((count) => Math.min(count, chairs));
      go(step + 1);
      return;
    }
    if (step === 6 || step === 8) {
      go(step + 1);
      return;
    }
    if (step === 9) await finish();
  }

  function skip() {
    if (step === 4) {
      setBrands([]);
      go(5);
      return;
    }
    if (step === 7) {
      setHoursTouched(false);
      setHourDrafts(defaultHourDrafts());
      go(8);
      return;
    }
    if (step === 8) {
      go(9);
      return;
    }
    if (step === 9) void finish();
  }

  const canSkip = step === 4 || step >= 7;

  const entering = reduceMotion
    ? FadeIn.duration(180)
    : direction > 0
      ? SlideInRight.duration(340).easing(ease)
      : SlideInLeft.duration(340).easing(ease);
  const exiting = reduceMotion
    ? FadeOut.duration(140)
    : direction > 0
      ? SlideOutLeft.duration(280).easing(ease)
      : SlideOutRight.duration(280).easing(ease);

  const primaryLabel = busy
    ? 'Saving…'
    : step === 9
      ? photos.length
        ? 'Finish'
        : 'Finish without photos'
      : 'Continue';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.progressLabel}>
          {step + 1} / {steps.length}
        </Text>
        <Text style={styles.progressStep}>{steps[step]}</Text>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </View>

      <View style={[styles.stage, { width }]}>
        <Animated.View key={step} entering={entering} exiting={exiting} style={styles.slide}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {step === 0 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>What is the shop called?</Text>
                <Text style={styles.body}>This name shows on the customer map and booking screen.</Text>
                <TextInput value={name} onChangeText={setName} placeholder="Shop name" placeholderTextColor={colors.muted} style={styles.input} autoFocus />
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Where is the shop?</Text>
                <Text style={styles.body}>Use GPS if you’re there now, or type the area.</Text>
                <Pressable style={styles.locate} onPress={locate}>
                  <Ionicons name="locate" size={20} color={colors.white} />
                  <Text style={styles.locateText}>Use current location</Text>
                </Pressable>
                {place ? (
                  <View style={styles.placeCard}>
                    <Text style={styles.placeLabel}>Selected</Text>
                    <Text style={styles.placeText}>{place.address}</Text>
                  </View>
                ) : null}
                <TextInput value={manual} onChangeText={setManual} placeholder="Or type the area" placeholderTextColor={colors.muted} style={styles.input} />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>What kind of shop are you?</Text>
                <Text style={styles.body}>Pick all that apply — Salon, Spa, Nails, Tattoo, Piercing. We’ll show matching services next.</Text>
                <View style={styles.kindList}>
                  {shopKinds.map((item) => {
                    const on = kinds.includes(item.id);
                    return (
                      <Pressable key={item.id} style={[styles.kindCard, on && styles.kindCardOn]} onPress={() => toggleKind(item.id)}>
                        <View style={styles.featureRow}>
                          <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.kindTitle, on && styles.kindTitleOn]}>{item.label}</Text>
                            <Text style={[styles.kindHint, on && styles.kindHintOn]}>{item.hint}</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {step === 3 && kinds.length ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Which services do you offer?</Text>
                <Text style={styles.body}>
                  Menu for {kinds.map((id) => shopKinds.find((k) => k.id === id)?.label).filter(Boolean).join(', ')}. Tap to keep, then set time and price.
                </Text>
                {menu.map((service) => {
                  const chosen = picked.find((item) => item.name === service.name);
                  return (
                    <View key={service.name} style={[styles.service, chosen && styles.serviceOn]}>
                      <Pressable style={styles.serviceTop} onPress={() => toggleService(service)}>
                        <View style={[styles.check, chosen && styles.checkOn]}>{chosen ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                        <Text style={styles.serviceName}>{service.name}</Text>
                      </Pressable>
                      {chosen ? (
                        <View style={styles.priceRow}>
                          <View style={styles.priceField}>
                            <Text style={styles.fieldLabel}>Duration</Text>
                            <View style={styles.priceInputWrap}>
                              <TextInput
                                value={String(chosen.durationMinutes)}
                                keyboardType="number-pad"
                                onChangeText={(value) => updateService(service.name, { durationMinutes: Number(value) || 10 })}
                                style={styles.priceInput}
                              />
                              <Text style={styles.unit}>min</Text>
                            </View>
                          </View>
                          <View style={styles.priceField}>
                            <Text style={styles.fieldLabel}>Price</Text>
                            <View style={styles.priceInputWrap}>
                              <Text style={styles.unit}>₹</Text>
                              <TextInput
                                value={String(Math.round(chosen.pricePaise / 100))}
                                keyboardType="number-pad"
                                onChangeText={(value) => updateService(service.name, { pricePaise: (Number(value) || 0) * 100 })}
                                style={styles.priceInput}
                              />
                            </View>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : null}

            {step === 4 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Which product brands do you use?</Text>
                <Text style={styles.body}>Optional. Customers may filter by products. Tap common brands or add your own.</Text>
                <View style={styles.brandWrap}>
                  {productBrandSuggestions.map((brandName) => {
                    const on = brands.includes(brandName);
                    return (
                      <Pressable key={brandName} style={[styles.brandChip, on && styles.brandChipOn]} onPress={() => toggleBrand(brandName)}>
                        <Text style={[styles.brandChipText, on && styles.brandChipTextOn]}>{brandName}</Text>
                      </Pressable>
                    );
                  })}
                  {brands
                    .filter((b) => !(productBrandSuggestions as readonly string[]).includes(b))
                    .map((brandName) => (
                      <Pressable key={brandName} style={[styles.brandChip, styles.brandChipOn]} onPress={() => toggleBrand(brandName)}>
                        <Text style={[styles.brandChipText, styles.brandChipTextOn]}>{brandName} ×</Text>
                      </Pressable>
                    ))}
                </View>
                <View style={styles.customBrandRow}>
                  <TextInput
                    value={customBrand}
                    onChangeText={setCustomBrand}
                    placeholder="Add custom brand"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, styles.customBrandInput]}
                    onSubmitEditing={addCustomBrand}
                    returnKeyType="done"
                  />
                  <Pressable style={styles.addBrandBtn} onPress={addCustomBrand}>
                    <Text style={styles.addBrandText}>Add</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {step === 5 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>How many seats?</Text>
                <Text style={styles.body}>Physical seats. Change this only when you add or remove a seat.</Text>
                <Counter value={chairs} onChange={setChairs} min={1} />
              </>
            ) : null}

            {step === 6 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Workers in today?</Text>
                <Text style={styles.body}>How many of the {chairs} seats are staffed right now. Change it any day from Floor.</Text>
                <Counter value={workers} onChange={(value) => setWorkers(Math.min(chairs, value))} min={1} />
              </>
            ) : null}

            {step === 7 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>When are you open?</Text>
                <Text style={styles.body}>
                  IST times. Skip to use 10:00–21:00 every day. Turn a day off to close.
                </Text>
                <HoursEditor
                  value={hourDrafts}
                  onChange={(nextHours) => {
                    setHoursTouched(true);
                    setHourDrafts(nextHours);
                  }}
                />
              </>
            ) : null}

            {step === 8 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Any shop features?</Text>
                <Text style={styles.body}>Optional. Customers use these as filters. Skip if you want to add them later.</Text>
                <View style={styles.kindList}>
                  {amenities.map((item) => {
                    const on = chosenAmenities.includes(item);
                    return (
                      <Pressable
                        key={item}
                        style={[styles.kindCard, on && styles.kindCardOn]}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setChosenAmenities((current) => (on ? current.filter((value) => value !== item) : [...current, item]));
                        }}
                      >
                        <View style={styles.featureRow}>
                          <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                          <Text style={[styles.kindTitle, on && styles.kindTitleOn]}>{item}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {step === 9 ? (
              <>
                <Text style={[styles.title, fonts && { fontFamily: 'PoppinsExtraBold' }]}>Add shop photos?</Text>
                <Text style={styles.body}>Optional. Up to 5. The first one becomes the cover. Skip if you’ll do this later.</Text>
                <Pressable style={styles.locate} onPress={pickPhotos}>
                  <Ionicons name="images-outline" size={20} color={colors.white} />
                  <Text style={styles.locateText}>{photos.length ? `${photos.length} selected · Change` : 'Choose photos'}</Text>
                </Pressable>
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        {step > 0 ? (
          <BackButton onPress={() => go(step - 1)} />
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.footerActions}>
          {canSkip ? (
            <Pressable onPress={skip} disabled={busy}>
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={() => void next()} disabled={busy}>
            <Text style={styles.buttonText}>{primaryLabel}</Text>
          </Pressable>
        </View>
      </View>

      <SuccessOverlay
        visible={done}
        ready={saved}
        label="Shop ready"
        onDone={() => {
          setBusy(false);
          router.replace('/partner/(tabs)');
        }}
      />
    </SafeAreaView>
  );
}

function Counter({ value, onChange, min }: { value: number; onChange: (value: number) => void; min: number }) {
  const styles = useThemedStyles(setupStyles);
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function bump(next: number) {
    onChange(next);
    void Haptics.selectionAsync();
    if (reduceMotion) return;
    scale.value = 0.92;
    scale.value = withTiming(1, { duration: 180, easing: ease });
  }

  return (
    <View style={styles.counter}>
      <Pressable onPress={() => bump(Math.max(min, value - 1))} style={styles.step}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Animated.Text style={[styles.count, numberStyle]}>{value}</Animated.Text>
      <Pressable onPress={() => bump(value + 1)} style={styles.step}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

function setupStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 8 },
    progressLabel: {
      ...typography.caption,
      color: colors.accent,
      fontWeight: '700',
      letterSpacing: 1.2,
      textTransform: 'uppercase'
    },
    progressStep: { ...typography.caption, color: colors.muted },
    track: { height: 3, backgroundColor: colors.line, borderRadius: radii.pill, overflow: 'hidden', marginTop: 4 },
    fill: { height: 3, backgroundColor: colors.accent, borderRadius: radii.pill },
    stage: { flex: 1, overflow: 'hidden' },
    slide: { flex: 1 },
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 140, gap: spacing.md },
    title: { ...typography.display, color: colors.ink, fontSize: 30, lineHeight: 36, letterSpacing: -0.7 },
    body: { ...typography.body, color: colors.muted, marginBottom: spacing.sm },
    input: {
      backgroundColor: colors.surface,
      color: colors.ink,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 16,
      fontSize: 17,
      letterSpacing: -0.2
    },
    locate: {
      alignSelf: 'stretch',
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      minHeight: 54,
      paddingHorizontal: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10
    },
    locateText: { color: colors.white, fontWeight: '700', fontSize: 16 },
    placeCard: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: 4 },
    placeLabel: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 0.6 },
    placeText: { ...typography.body, color: colors.ink },
    kindList: { gap: spacing.sm },
    brandWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    brandChip: {
      backgroundColor: colors.surface,
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1.5,
      borderColor: colors.line
    },
    brandChipOn: { borderColor: colors.accent, backgroundColor: `${colors.accent}18` },
    brandChipText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
    brandChipTextOn: { color: colors.accentDark },
    customBrandRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    customBrandInput: { flex: 1, marginBottom: 0 },
    addBrandBtn: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingHorizontal: 18,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center'
    },
    addBrandText: { color: colors.white, fontWeight: '700', fontSize: 15 },
    kindCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderWidth: 1.5,
      borderColor: 'transparent'
    },
    kindCardOn: { borderColor: colors.accent, backgroundColor: colors.canvas },
    kindTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
    kindTitleOn: { color: colors.ink },
    kindHint: { marginTop: 4, color: colors.muted, fontSize: 14 },
    kindHintOn: { color: colors.muted },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 10 },
    chipOn: { backgroundColor: colors.accent },
    chipText: { color: colors.ink, fontWeight: '600', fontSize: 14 },
    chipTextOn: { color: colors.white },
    service: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
    serviceOn: { backgroundColor: colors.canvas, borderWidth: 1.5, borderColor: colors.accent },
    serviceTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    check: {
      width: 24,
      height: 24,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkMark: { color: colors.white, fontSize: 13, fontWeight: '700' },
    serviceName: { ...typography.heading, color: colors.ink, flex: 1, fontSize: 17 },
    priceRow: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 34 },
    priceField: { flex: 1, gap: 6 },
    fieldLabel: { ...typography.caption, color: colors.muted, fontWeight: '600' },
    priceInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      minHeight: 52,
      gap: 6
    },
    priceInput: { flex: 1, color: colors.ink, fontSize: 18, fontWeight: '600', paddingVertical: 12 },
    unit: { color: colors.muted, fontWeight: '600', fontSize: 15 },
    counter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      marginTop: spacing.lg,
      paddingVertical: spacing.lg
    },
    step: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center'
    },
    stepText: { fontSize: 28, color: colors.ink, fontWeight: '500', marginTop: -2 },
    count: { fontSize: 56, fontWeight: '700', color: colors.ink, minWidth: 72, textAlign: 'center', letterSpacing: -1.5 },
    error: { color: colors.danger, marginTop: spacing.sm },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      paddingTop: spacing.sm
    },
    backBtn: {
      height: 54,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface
    },
    backSpacer: { width: 88 },
    backText: { color: colors.ink, fontWeight: '600', fontSize: 15 },
    footerActions: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md },
    skip: { color: colors.muted, fontWeight: '600', fontSize: 15, paddingHorizontal: 8 },
    button: {
      flexGrow: 1,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg
    },
    buttonBusy: { opacity: 0.7 },
    buttonText: { color: colors.white, fontWeight: '700', fontSize: 16, letterSpacing: -0.2 }
  });
}
