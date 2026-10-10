import { useMemo, useState, type ComponentType } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '@/components/PressScale';
import { Time12WheelSheet } from '@/components/Time12WheelSheet';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { canUseNativeTimePicker } from '@/utils/canUseNativeTimePicker';
import { dateFromHHmm, formatHHmmLabel, hhmmFromDate } from '@/utils/clock12';

type DateTimePickerEvent = {
  type: 'set' | 'dismissed' | 'neutralButtonPressed';
  nativeEvent: { timestamp?: number; utcOffset?: number };
};

type NativePickerProps = {
  value: Date;
  mode?: 'date' | 'time' | 'datetime' | 'countdown';
  display?: 'default' | 'spinner' | 'clock' | 'calendar';
  is24Hour?: boolean;
  themeVariant?: 'light' | 'dark';
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
  style?: object;
};

type Props = {
  label: string;
  /** Stored as 24h `HH:mm` for the API. */
  value: string;
  onChange: (hhmm: string) => void;
};

function loadNativePicker(): ComponentType<NativePickerProps> | null {
  if (!canUseNativeTimePicker()) return null;
  try {
    // Lazy require — static import crashes when RNCDatePicker is missing from the APK.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-community/datetimepicker') as {
      default: ComponentType<NativePickerProps>;
    };
    return mod.default;
  } catch {
    return null;
  }
}

/**
 * Native time popup when linked — iOS spinner / Android dialog.
 * Falls back to in-app adjust sheet on dev clients missing RNCTimePicker (rebuild with `expo run:android`).
 */
export function Time12Field({ label, value, onChange }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(fieldStyles);
  const NativePicker = useMemo(() => loadNativePicker(), []);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => dateFromHHmm(value));

  function openPicker() {
    setDraft(dateFromHHmm(value));
    setOpen(true);
  }

  function apply(date: Date) {
    onChange(hhmmFromDate(date));
  }

  function onNativeChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setOpen(false);
      if (event.type === 'dismissed' || !selected) return;
      apply(selected);
      return;
    }
    if (selected) setDraft(selected);
  }

  function confirmIos() {
    apply(draft);
    setOpen(false);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <PressScale
        onPress={openPicker}
        style={styles.chip}
        haptic
        accessibilityRole="button"
        accessibilityLabel={`${label} ${formatHHmmLabel(value)}`}
      >
        <Text style={styles.chipText}>{formatHHmmLabel(value)}</Text>
        <Text style={styles.chipHint}>Change</Text>
      </PressScale>

      {!NativePicker ? (
        <Time12WheelSheet
          visible={open}
          label={label}
          value={value}
          onConfirm={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}

      {NativePicker && open && Platform.OS === 'android' ? (
        <NativePicker
          value={draft}
          mode="time"
          display="default"
          is24Hour={false}
          onChange={onNativeChange}
        />
      ) : null}

      {NativePicker && Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>{label}</Text>
                <PressScale onPress={confirmIos} style={styles.doneBtn} haptic>
                  <Text style={styles.doneText}>Done</Text>
                </PressScale>
              </View>
              <NativePicker
                value={draft}
                mode="time"
                display="spinner"
                themeVariant="light"
                onChange={onNativeChange}
                style={styles.spinner}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function fieldStyles(colors: Palette) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    label: { ...typography.caption, color: colors.muted, fontWeight: '600' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.canvas,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: spacing.md,
      paddingVertical: 14
    },
    chipText: { ...typography.heading, color: colors.ink, fontSize: 18 },
    chipHint: { ...typography.caption, color: colors.accent, fontWeight: '700' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end'
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingBottom: spacing.xl,
      paddingTop: spacing.md
    },
    sheetHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm
    },
    sheetTitle: { ...typography.heading, color: colors.ink, fontSize: 18 },
    doneBtn: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingHorizontal: 16,
      paddingVertical: 8
    },
    doneText: { ...typography.caption, color: colors.white, fontWeight: '800' },
    spinner: { alignSelf: 'stretch', height: 216 }
  });
}
