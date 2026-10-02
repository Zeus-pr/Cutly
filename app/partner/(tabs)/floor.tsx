import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SuccessOverlay } from '@/components/SuccessOverlay';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { partnerApi } from '@/services/partner';
import { useThemedStyles } from '@/store/useThemeStore';

export default function PartnerFloor() {
  const styles = useThemedStyles(floorStyles);
  const [chairCount, setChairCount] = useState(1);
  const [chairs, setChairs] = useState(1);
  const [workers, setWorkers] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      partnerApi
        .dashboard()
        .then((board) => {
          if (!live || !board.shop) return;
          setChairCount(board.shop.chairCount);
          setChairs(board.shop.today.chairsInUse);
          setWorkers(board.shop.today.workersPresent);
        })
        .catch((err) => {
          if (live) setError(err instanceof Error ? err.message : 'Could not load the floor.');
        });
      return () => {
        live = false;
      };
    }, [])
  );

  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    setDone(true);
    try {
      await partnerApi.floor(Math.min(workers, chairs), chairs);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    } catch (err) {
      setDone(false);
      setError(err instanceof Error ? err.message : 'Could not save.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.kicker}>Today</Text>
      <Text style={styles.title}>Modify floor</Text>
      <Text style={styles.body}>Open slots use the smaller number. Confirmed bookings stay if you lower it.</Text>
      <Text style={styles.label}>Chairs in use, of {chairCount}</Text>
      <Stepper
        value={chairs}
        max={chairCount}
        onChange={(value) => {
          setChairs(value);
          setWorkers((count) => Math.min(count, value));
        }}
      />
      <Text style={styles.label}>Workers in today</Text>
      <Stepper value={workers} max={chairs} onChange={setWorkers} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={() => void save()} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save for today'}</Text>
      </Pressable>
      <SuccessOverlay
        visible={done}
        ready={saved}
        label="Floor updated"
        onDone={() => {
          setBusy(false);
          setDone(false);
          setSaved(false);
        }}
      />
    </SafeAreaView>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (value: number) => void }) {
  const styles = useThemedStyles(floorStyles);
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.step}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(Math.max(0, value - 1));
        }}
      >
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={styles.count}>{value}</Text>
      <Pressable
        style={styles.step}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange(Math.min(max, value + 1));
        }}
      >
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

function floorStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas, padding: spacing.lg, gap: spacing.md },
    kicker: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    title: { ...typography.title, color: colors.ink, fontSize: 28, letterSpacing: -0.5 },
    body: { ...typography.body, color: colors.muted },
    label: { ...typography.heading, color: colors.ink, marginTop: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    step: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center'
    },
    stepText: { fontSize: 28, color: colors.ink },
    count: { fontSize: 44, fontWeight: '700', color: colors.ink, minWidth: 48, textAlign: 'center', letterSpacing: -1 },
    button: {
      marginTop: 'auto',
      marginBottom: 100,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center'
    },
    buttonBusy: { opacity: 0.7 },
    buttonText: { color: colors.white, fontWeight: '700', fontSize: 16 },
    error: { color: colors.danger }
  });
}
