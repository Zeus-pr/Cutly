import { StyleSheet, Text, View } from 'react-native';
import { CutlyLogo } from '@/components/CutlyLogo';
import { fontFamily } from '@/constants/fonts';
import { lightColors, radii, spacing } from '@/constants/theme';

type Props = {
  compact?: boolean;
  /** Partner Home: CutLy lockup + “Partner” underlabel. */
  partner?: boolean;
};

/** Home corner mark — real `cutly-logo.png` (not Clash text for CutLy). */
export function CutlyWordmark({ compact = false, partner = false }: Props) {
  if (!partner) {
    return <CutlyLogo width={compact ? 96 : 112} rounded={compact ? 8 : 10} />;
  }

  return (
    <View
      style={[styles.partnerChip, compact && styles.partnerChipCompact]}
      accessibilityRole="header"
      accessibilityLabel="CutLy Partner"
    >
      <CutlyLogo width={compact ? 88 : 100} rounded={0} clear markOnly />
      <Text style={[styles.partnerLabel, compact && styles.partnerLabelCompact]} allowFontScaling={false}>
        Partner
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  partnerChip: {
    alignSelf: 'flex-start',
    backgroundColor: lightColors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: 6,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 2
  },
  partnerChipCompact: {
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 6
  },
  partnerLabel: {
    fontFamily: fontFamily.semibold,
    color: lightColors.white,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    includeFontPadding: false
  },
  partnerLabelCompact: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 1
  }
});
