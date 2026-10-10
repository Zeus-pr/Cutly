import { Switch, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '@/components/PressScale';
import { Time12Field } from '@/components/Time12Field';
import { radii, spacing, typography, type Palette } from '@/constants/theme';
import { appAlert } from '@/store/useDialogStore';
import { useColors, useThemedStyles } from '@/store/useThemeStore';
import { isCloseAfterOpen } from '@/utils/clock12';
import {
  WEEKDAY_LABELS,
  defaultHourDrafts,
  type HourDayDraft
} from '@/utils/hoursDraft';

export {
  WEEKDAY_LABELS,
  defaultHourDrafts,
  draftsFromApiDays,
  draftsToApiDays,
  type HourDayDraft
} from '@/utils/hoursDraft';

type Props = {
  value: HourDayDraft[];
  onChange: (next: HourDayDraft[]) => void;
};

export function HoursEditor({ value, onChange }: Props) {
  const colors = useColors();
  const styles = useThemedStyles(hourStyles);

  function patch(weekday: number, next: Partial<HourDayDraft>) {
    const current = value.find((row) => row.weekday === weekday);
    if (!current) return;
    const merged = { ...current, ...next };
    if (merged.open && !isCloseAfterOpen(merged.opensAt, merged.closesAt)) {
      appAlert('Closing must be later', 'Pick a close time after open — e.g. 9:00 AM to 8:30 PM.');
      return;
    }
    onChange(value.map((row) => (row.weekday === weekday ? merged : row)));
  }

  return (
    <View style={styles.list}>
      {value.map((row) => (
        <View key={row.weekday} style={[styles.row, !row.open && styles.rowClosed]}>
          <View style={styles.head}>
            <Text style={styles.day}>{WEEKDAY_LABELS[row.weekday]}</Text>
            <Switch
              value={row.open}
              onValueChange={(open) => patch(row.weekday, { open })}
              trackColor={{ false: colors.sand, true: colors.accent }}
              thumbColor={colors.white}
              accessibilityLabel={`${WEEKDAY_LABELS[row.weekday]} open`}
            />
          </View>
          {row.open ? (
            <View style={styles.times}>
              <Time12Field
                label="Opens"
                value={row.opensAt}
                onChange={(opensAt) => patch(row.weekday, { opensAt })}
              />
              <Time12Field
                label="Closes"
                value={row.closesAt}
                onChange={(closesAt) => patch(row.weekday, { closesAt })}
              />
            </View>
          ) : (
            <Text style={styles.closed}>Closed</Text>
          )}
        </View>
      ))}
      <PressScale
        onPress={() => onChange(defaultHourDrafts())}
        style={styles.reset}
        accessibilityRole="button"
        accessibilityLabel="Reset to default hours"
      >
        <Text style={styles.resetText}>Reset to 10:00 AM – 9:00 PM every day</Text>
      </PressScale>
    </View>
  );
}

function hourStyles(colors: Palette) {
  return StyleSheet.create({
    list: { gap: spacing.sm },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      gap: spacing.sm
    },
    rowClosed: { backgroundColor: colors.sand },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    day: { ...typography.heading, color: colors.ink },
    times: { gap: spacing.sm },
    closed: { ...typography.caption, color: colors.muted },
    reset: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
    resetText: { ...typography.caption, fontWeight: '700', color: colors.accent }
  });
}
