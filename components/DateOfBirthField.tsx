import { useMemo, useState, type ComponentType } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '@/components/PressScale';
import { fontFamily } from '@/constants/fonts';
import { radii, spacing, type Palette } from '@/constants/theme';
import { useThemeStore, useThemedStyles } from '@/store/useThemeStore';
import { canUseNativeTimePicker } from '@/utils/canUseNativeTimePicker';
import {
  defaultDobDraft,
  dobPickerBounds,
  formatDobLabel,
  isoFromLocalDate,
  localDateFromIso
} from '@/utils/dateOfBirth';

type DateTimePickerEvent = {
  type: 'set' | 'dismissed' | 'neutralButtonPressed';
  nativeEvent: { timestamp?: number; utcOffset?: number };
};

type NativePickerProps = {
  value: Date;
  mode?: 'date' | 'time' | 'datetime' | 'countdown';
  display?: 'default' | 'spinner' | 'clock' | 'calendar' | 'inline';
  minimumDate?: Date;
  maximumDate?: Date;
  themeVariant?: 'light' | 'dark';
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
  style?: object;
};

type Props = {
  value: string;
  onChange: (iso: string) => void;
};

function loadNativePicker(): ComponentType<NativePickerProps> | null {
  if (!canUseNativeTimePicker()) return null;
  try {
    // Lazy require — static import crashes when the native picker is missing from the binary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-community/datetimepicker') as {
      default: ComponentType<NativePickerProps>;
    };
    return mod.default;
  } catch {
    return null;
  }
}

/** System date picker: Android dialog, iOS wheel. */
export function DateOfBirthField({ value, onChange }: Props) {
  const dark = useThemeStore((state) => state.dark);
  const styles = useThemedStyles(fieldStyles);
  const NativePicker = useMemo(() => loadNativePicker(), []);
  const bounds = useMemo(() => dobPickerBounds(), []);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => localDateFromIso(value) || defaultDobDraft());
  const [missing, setMissing] = useState(false);

  function openPicker() {
    if (!NativePicker) {
      setMissing(true);
      return;
    }
    setDraft(localDateFromIso(value) || defaultDobDraft());
    setOpen(true);
  }

  function apply(date: Date) {
    onChange(isoFromLocalDate(date));
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

  const label = value ? formatDobLabel(value) : 'Select date of birth';

  return (
    <View>
      <PressScale style={styles.select} onPress={openPicker} haptic accessibilityLabel={`Date of birth ${label}`}>
        <Text style={[styles.selectText, !value && styles.placeholder]}>{label}</Text>
      </PressScale>
      {missing ? <Text style={styles.missing}>The date picker needs the latest app build.</Text> : null}

      {NativePicker && open && Platform.OS === 'android' ? (
        <NativePicker
          value={draft}
          mode="date"
          display="default"
          minimumDate={bounds.minimumDate}
          maximumDate={bounds.maximumDate}
          onChange={onNativeChange}
        />
      ) : null}

      {NativePicker && Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
            <View style={styles.sheet}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Date of birth</Text>
                <PressScale
                  onPress={() => {
                    apply(draft);
                    setOpen(false);
                  }}
                  style={styles.doneBtn}
                  haptic
                >
                  <Text style={styles.doneText}>Done</Text>
                </PressScale>
              </View>
              <NativePicker
                value={draft}
                mode="date"
                display="spinner"
                minimumDate={bounds.minimumDate}
                maximumDate={bounds.maximumDate}
                themeVariant={dark ? 'dark' : 'light'}
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
    select: {
      height: 54,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      justifyContent: 'center'
    },
    selectText: { fontFamily: fontFamily.medium, fontSize: 16, color: colors.ink },
    placeholder: { color: colors.muted },
    missing: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.danger, marginTop: 6 },
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
    sheetTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.ink },
    doneBtn: {
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingHorizontal: 16,
      paddingVertical: 8
    },
    doneText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.white },
    spinner: { alignSelf: 'stretch', height: 216 }
  });
}
