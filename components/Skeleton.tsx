import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { radii, spacing, type Palette } from '@/constants/theme';
import { useColors, useThemedStyles } from '@/store/useThemeStore';

type BoneProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Soft pulse bone — opacity shimmer; static when Reduce Motion is on. */
export function SkeletonBone({ width = '100%', height = 14, radius = radii.sm, style }: BoneProps) {
  const colors = useColors();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const base = {
    width: width as number | `${number}%`,
    height,
    borderRadius: radius,
    backgroundColor: colors.sand
  } as const;

  if (reduceMotion) {
    return <View style={[base, style]} />;
  }

  return (
    <MotiView
      from={{ opacity: 0.45 }}
      animate={{ opacity: 1 }}
      transition={{
        type: 'timing',
        duration: 900,
        loop: true,
        repeatReverse: true
      }}
      style={[base, style]}
    />
  );
}

export function SkeletonStack({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: spacing.sm }, style]}>{children}</View>;
}

/** Shop list card placeholder (Home / Explore / Search). */
export function ShopCardSkeleton() {
  const styles = useThemedStyles(shopSkeletonStyles);
  return (
    <View style={styles.card} accessibilityLabel="Loading shop">
      <SkeletonBone height={168} radius={0} style={styles.media} />
      <View style={styles.body}>
        <SkeletonBone width="62%" height={18} />
        <SkeletonBone width="48%" height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

export function ShopListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <ShopCardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Visits / partner history / request row. */
export function ListRowSkeleton() {
  const styles = useThemedStyles(rowSkeletonStyles);
  return (
    <View style={styles.card} accessibilityLabel="Loading row">
      <View style={styles.top}>
        <SkeletonBone width="55%" height={16} />
        <SkeletonBone width={72} height={14} radius={radii.pill} />
      </View>
      <SkeletonBone width="70%" height={12} style={{ marginTop: 10 }} />
      <SkeletonBone width="40%" height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

export function ListRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <ListRowSkeleton key={i} />
      ))}
    </View>
  );
}

/** Booking day slot chips. */
export function SlotGridSkeleton({ count = 8 }: { count?: number }) {
  const styles = useThemedStyles(slotSkeletonStyles);
  return (
    <View style={styles.wrap} accessibilityLabel="Loading slots">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBone key={i} width={76} height={40} radius={radii.md} />
      ))}
    </View>
  );
}

/** Partner Home dashboard blocks. */
export function PartnerDashboardSkeleton() {
  const styles = useThemedStyles(dashSkeletonStyles);
  return (
    <View style={styles.wrap} accessibilityLabel="Loading dashboard">
      <SkeletonBone width="40%" height={14} />
      <SkeletonBone width="70%" height={28} style={{ marginTop: 8 }} />
      <SkeletonBone width="85%" height={12} style={{ marginTop: 8 }} />
      <SkeletonBone height={88} radius={radii.lg} style={{ marginTop: spacing.lg }} />
      <View style={styles.grid}>
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBone key={i} height={72} radius={radii.md} style={styles.metric} />
        ))}
      </View>
      <SkeletonBone height={160} radius={radii.lg} style={{ marginTop: spacing.md }} />
    </View>
  );
}

/** Booking details / shop detail shell. */
export function DetailScreenSkeleton() {
  const styles = useThemedStyles(detailSkeletonStyles);
  return (
    <View style={styles.wrap} accessibilityLabel="Loading details">
      <SkeletonBone width="55%" height={24} />
      <SkeletonBone width="35%" height={14} style={{ marginTop: 10 }} />
      <SkeletonBone width="75%" height={14} style={{ marginTop: 8 }} />
      <SkeletonBone height={96} radius={radii.lg} style={{ marginTop: spacing.lg }} />
      <SkeletonBone height={160} radius={radii.lg} style={{ marginTop: spacing.md }} />
      <SkeletonBone height={48} radius={radii.pill} style={{ marginTop: spacing.lg }} />
      <SkeletonBone height={48} radius={radii.pill} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

/** Hours editor placeholder. */
export function HoursEditorSkeleton() {
  return (
    <View style={{ gap: spacing.sm }} accessibilityLabel="Loading hours">
      {Array.from({ length: 7 }, (_, i) => (
        <SkeletonBone key={i} height={52} radius={radii.md} />
      ))}
    </View>
  );
}

function shopSkeletonStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
      marginBottom: spacing.md
    },
    media: { width: '100%' },
    body: { padding: spacing.md }
  });
}

function rowSkeletonStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      marginBottom: spacing.md
    },
    top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }
  });
}

function slotSkeletonStyles(_colors: Palette) {
  return StyleSheet.create({
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm }
  });
}

function dashSkeletonStyles(_colors: Palette) {
  return StyleSheet.create({
    wrap: { paddingTop: spacing.sm },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
    metric: { width: '47%', flexGrow: 1 }
  });
}

function detailSkeletonStyles(_colors: Palette) {
  return StyleSheet.create({
    wrap: { padding: spacing.md, paddingTop: spacing.lg }
  });
}
