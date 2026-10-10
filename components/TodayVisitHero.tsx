import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PatternWavesSurface } from '@/components/PatternWavesSurface';
import { fontFamily } from '@/constants/fonts';
import { radii } from '@/constants/theme';
import type { Booking } from '@/types/domain';
import { formatINR } from '@/utils/money';
import { formatTime } from '@/utils/time';
import {
  todayVisitBg,
  todayVisitPhase,
  todayVisitServiceLabel,
  todayVisitShowsPin,
  todayVisitTitle
} from '@/utils/todayVisit';

const CORAL = '#F06B55';
const TEAL = '#05998C';
const BLACK = '#111111';
const TILE_BG = '#FFFFFF';
const TILE_H = 186;

type Props = {
  booking: Booking;
  height?: number;
  onStartReview?: () => void;
  onDismissReview?: () => void;
};

/** Home hero for today’s visit — teal / gold / purple-navy waves by phase. */
export function TodayVisitHero({ booking, height = TILE_H, onStartReview, onDismissReview }: Props) {
  const phase = todayVisitPhase(booking.status);
  const ink = todayVisitBg(phase);
  const serviceLine = todayVisitServiceLabel(booking);
  const timeLabel = formatTime(booking.startsAt);
  const showPin = todayVisitShowsPin(booking.status) && Boolean(booking.verifyPin);
  const a11y =
    phase === 'completed'
      ? `Service completed at ${booking.shop.name}`
      : phase === 'started'
        ? `Service started at ${booking.shop.name}`
        : `${todayVisitTitle(booking.status)}, ${timeLabel}, ${booking.shop.name}`;

  return (
    <View style={[styles.wrap, { height, backgroundColor: TILE_BG }]} accessibilityLabel={a11y}>
      <PatternWavesSurface bgColor={TILE_BG} dotColor={ink} style={StyleSheet.absoluteFill} />

      {phase === 'completed' ? (
        <View style={styles.centerOverlay} pointerEvents="box-none">
          <Text style={[styles.completedTitle, { color: ink }]} allowFontScaling={false}>
            Service completed!
          </Text>
          <Text style={[styles.completedSub, { color: ink }]} allowFontScaling={false}>
            Tell us how it was
          </Text>
          <Text style={[styles.completedMeta, { color: ink }]} numberOfLines={1} allowFontScaling={false}>
            {booking.shop.name} · {serviceLine}
          </Text>
          <View style={styles.actions} pointerEvents="box-none">
            <Pressable
              style={styles.reviewBtn}
              onPress={onStartReview}
              accessibilityRole="button"
              accessibilityLabel="Review"
            >
              <Text style={styles.reviewBtnText}>Review</Text>
            </Pressable>
            <Pressable
              style={styles.dismissBtn}
              onPress={onDismissReview}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Text style={styles.dismissBtnText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : phase === 'started' ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <Text style={styles.startedEyebrow} allowFontScaling={false}>
            Right now
          </Text>
          <Text style={styles.startedTitle} allowFontScaling={false}>
            Service started
          </Text>
          <Text style={styles.startedShop} numberOfLines={1} allowFontScaling={false}>
            {booking.shop.name}
          </Text>
          <Text style={styles.startedMeta} numberOfLines={2} allowFontScaling={false}>
            {serviceLine} · {formatINR(booking.totalPaise)}
          </Text>
        </View>
      ) : (
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.topRow}>
            <View style={styles.leftCol}>
              <Text style={styles.upTitle} allowFontScaling={false}>
                Upcoming visits
              </Text>
              <Text style={styles.upTime} allowFontScaling={false}>
                {timeLabel}
              </Text>
              <View style={styles.upRule} />
              {showPin ? (
                <View style={styles.pinBlock}>
                  <Text style={styles.upCode} allowFontScaling={false}>
                    {booking.verifyPin}
                  </Text>
                  <Text style={styles.upHint} allowFontScaling={false}>
                    Share this when arrived at the shop
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.rightCol}>
              <Text style={styles.upShop} numberOfLines={2} allowFontScaling={false}>
                {booking.shop.name}
              </Text>
              <Text style={styles.upService} numberOfLines={3} allowFontScaling={false}>
                {serviceLine}
              </Text>
              <Text style={styles.upPrice} allowFontScaling={false}>
                {formatINR(booking.totalPaise)}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(23,38,60,0.12)'
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'flex-start'
  },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  leftCol: {
    flex: 1.05,
    minWidth: 0,
    justifyContent: 'flex-start'
  },
  rightCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-start'
  },
  startedEyebrow: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    lineHeight: 16,
    color: BLACK,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center'
  },
  startedTitle: {
    marginTop: 6,
    fontFamily: fontFamily.bold,
    fontSize: 34,
    lineHeight: 38,
    color: BLACK,
    letterSpacing: -0.8,
    textAlign: 'center'
  },
  startedShop: {
    marginTop: 10,
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 20,
    color: BLACK,
    textAlign: 'center'
  },
  startedMeta: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: BLACK,
    textAlign: 'center',
    maxWidth: '88%'
  },
  completedTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 30,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.4
  },
  completedSub: {
    marginTop: 6,
    fontFamily: fontFamily.medium,
    fontSize: 16,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center'
  },
  completedMeta: {
    marginTop: 8,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    maxWidth: '92%'
  },
  upTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 18,
    color: TEAL
  },
  upTime: {
    marginTop: 8,
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 36,
    color: BLACK,
    letterSpacing: -0.8
  },
  upRule: {
    marginTop: 2,
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: TEAL
  },
  upCode: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 36,
    color: BLACK,
    letterSpacing: -0.4
  },
  upHint: {
    marginTop: 6,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 19,
    color: CORAL,
    maxWidth: 168
  },
  upShop: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    lineHeight: 18,
    color: TEAL,
    textAlign: 'right',
    textTransform: 'uppercase'
  },
  upService: {
    marginTop: 6,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    color: '#8B95A1',
    textAlign: 'right'
  },
  upPrice: {
    marginTop: 8,
    fontFamily: fontFamily.bold,
    fontSize: 16,
    lineHeight: 20,
    color: TEAL,
    textAlign: 'right'
  },
  pinBlock: {
    marginTop: 10
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    maxWidth: 320
  },
  reviewBtn: {
    flex: 1.2,
    backgroundColor: CORAL,
    borderRadius: radii.pill,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reviewBtnText: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: '#FFFFFF'
  },
  dismissBtn: {
    flex: 0.9,
    borderRadius: radii.pill,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(42,39,88,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(42,39,88,0.35)'
  },
  dismissBtnText: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: '#2A2758'
  }
});
