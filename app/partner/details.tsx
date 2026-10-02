import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import { amenities } from '@/constants/catalogue';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { partnerApi } from '@/services/partner';
import { useThemedStyles } from '@/store/useThemeStore';

export default function PartnerDetails() {
  const styles = useThemedStyles(detailStyles);
  const [chosen, setChosen] = useState<string[]>([]);
  const [photos, setPhotos] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    partnerApi
      .dashboard()
      .then((board) => {
        if (!board.shop) return;
        setChosen(board.shop.amenities);
        setPhotos(board.shop.photos.length);
      })
      .catch(() => undefined);
  }, []);

  function toggle(item: string) {
    void Haptics.selectionAsync();
    setChosen((current) => (current.includes(item) ? current.filter((value) => value !== item) : [...current, item]));
  }

  async function addPhotos() {
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
    setBusy(true);
    setSaved(false);
    setDone(true);
    try {
      const shop = await partnerApi.photos(urls);
      setPhotos(shop.photos.length);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    } catch (err) {
      setDone(false);
      setError(err instanceof Error ? err.message : 'Could not save photos.');
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    setDone(true);
    try {
      await partnerApi.amenities(chosen);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    } catch (err) {
      setDone(false);
      setError(err instanceof Error ? err.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Features and photos</Text>
        <Text style={styles.body}>Customers use features as filters. Add up to 5 photos — first is the cover. {photos} saved so far.</Text>
        <Pressable style={styles.secondary} onPress={() => void addPhotos()} disabled={busy}>
          <Text style={styles.secondaryText}>Add photos</Text>
        </Pressable>
        <View style={styles.row}>
          {amenities.map((item) => {
            const on = chosen.includes(item);
            return (
              <Pressable key={item} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(item)}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={() => void save()} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save features'}</Text>
        </Pressable>
      </ScrollView>
      <SuccessOverlay
        visible={done}
        ready={saved}
        label="Saved"
        onDone={() => {
          setBusy(false);
          setDone(false);
          setSaved(false);
        }}
      />
    </SafeAreaView>
  );
}

function detailStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    back: { color: colors.ink, fontWeight: '600', padding: spacing.lg, paddingBottom: 0 },
    content: { padding: spacing.lg, gap: spacing.md },
    title: { ...typography.title, color: colors.ink },
    body: { ...typography.body, color: colors.muted },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 10 },
    chipOn: { backgroundColor: colors.accent },
    chipText: { color: colors.ink, fontWeight: '600' },
    chipTextOn: { color: colors.white },
    button: { backgroundColor: colors.accent, borderRadius: radii.pill, height: 54, alignItems: 'center', justifyContent: 'center' },
    buttonBusy: { opacity: 0.7 },
    buttonText: { color: colors.white, fontWeight: '700' },
    secondary: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.pill,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center'
    },
    secondaryText: { color: colors.ink, fontWeight: '700' },
    error: { color: colors.danger }
  });
}
