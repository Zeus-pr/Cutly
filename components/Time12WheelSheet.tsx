import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '@/components/PressScale';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import {
  format12ToHHmm,
  formatHHmmLabel,
  parseHHmmTo12,
  type AmPm,
  type Clock12
} from '@/utils/clock12';

type Props = {
  visible: boolean;
  label: string;
  value: string;
  onConfirm: (hhmm: string) => void;
  onClose: () => void;
};

function stepHour(clock: Clock12, delta: number): Clock12 {
  let hour12 = clock.hour12 + delta;
  if (hour12 > 12) hour12 = 1;
  if (hour12 < 1) hour12 = 12;
  return { ...clock, hour12 };
}

function stepMinute(clock: Clock12, delta: number): Clock12 {
  let minute = clock.minute + delta * 5;
  if (minute >= 60) minute = 0;
  if (minute < 0) minute = 55;
  return { ...clock, minute };
}

/** Fallback when native DateTimePicker is not in the dev client (rebuild required). */
export function Time12WheelSheet({ visible, label, value, onConfirm, onClose }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(sheetStyles);
  const [draft, setDraft] = useState(() => parseHHmmTo12(value));

  function syncFromValue() {
    setDraft(parseHHmmTo12(value));
  }

  function confirm() {
    onConfirm(format12ToHHmm(draft.hour12, draft.minute, draft.period));
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={syncFromValue}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={styles.sheet}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.preview}>{formatHHmmLabel(format12ToHHmm(draft.hour12, draft.minute, draft.period))}</Text>
          <Text style={styles.hint}>Native time picker needs a rebuild — using quick adjust (5‑min steps).</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Hour</Text>
            <View style={styles.stepper}>
              <PressScale onPress={() => setDraft((c) => stepHour(c, -1))} style={styles.stepBtn} haptic>
                <Text style={styles.stepGlyph}>−</Text>
              </PressScale>
              <Text style={styles.stepValue}>{draft.hour12}</Text>
              <PressScale onPress={() => setDraft((c) => stepHour(c, 1))} style={styles.stepBtn} haptic>
                <Text style={styles.stepGlyph}>+</Text>
              </PressScale>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Minute</Text>
            <View style={styles.stepper}>
              <PressScale onPress={() => setDraft((c) => stepMinute(c, -1))} style={styles.stepBtn} haptic>
                <Text style={styles.stepGlyph}>−</Text>
              </PressScale>
              <Text style={styles.stepValue}>{String(draft.minute).padStart(2, '0')}</Text>
              <PressScale onPress={() => setDraft((c) => stepMinute(c, 1))} style={styles.stepBtn} haptic>
                <Text style={styles.stepGlyph}>+</Text>
              </PressScale>
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Period</Text>
            <View style={styles.ampm}>
              {(['AM', 'PM'] as AmPm[]).map((period) => (
                <PressScale
                  key={period}
                  onPress={() => setDraft((c) => ({ ...c, period }))}
                  style={[styles.ampmBtn, draft.period === period && styles.ampmBtnOn]}
                  haptic
                >
                  <Text style={[styles.ampmText, draft.period === period && styles.ampmTextOn]}>{period}</Text>
                </PressScale>
              ))}
            </View>
          </View>

          <PressScale onPress={confirm} style={styles.done} haptic>
            <Text style={styles.doneText}>Done</Text>
          </PressScale>
        </View>
      </View>
    </Modal>
  );
}

function sheetStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(23,38,60,0.45)',
      justifyContent: 'flex-end'
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xxl,
      borderWidth: 1,
      borderColor: colors.line
    },
    title: { ...typography.heading, color: colors.ink, fontSize: 18 },
    preview: { ...typography.heading, color: colors.accent, fontSize: 28, marginTop: spacing.sm },
    hint: { ...typography.caption, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md
    },
    rowLabel: { ...typography.caption, color: colors.muted, fontWeight: '700', width: 72 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, justifyContent: 'flex-end' },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.canvas,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    stepGlyph: { ...typography.heading, color: colors.ink, fontSize: 22, lineHeight: 24 },
    stepValue: { ...typography.heading, color: colors.ink, fontSize: 22, minWidth: 48, textAlign: 'center' },
    ampm: { flexDirection: 'row', gap: spacing.sm, flex: 1, justifyContent: 'flex-end' },
    ampmBtn: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.canvas
    },
    ampmBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    ampmText: { ...typography.caption, color: colors.ink, fontWeight: '700' },
    ampmTextOn: { color: colors.white },
    done: {
      marginTop: spacing.md,
      backgroundColor: colors.accent,
      borderRadius: radii.pill,
      paddingVertical: 14,
      alignItems: 'center'
    },
    doneText: { ...typography.heading, color: colors.white, fontSize: 16 }
  });
}
