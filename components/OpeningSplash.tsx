import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import layout from '@/constants/splashFieldLayout.json';
import { splashFieldSources } from '@/constants/splashFieldAssets';
import { lightColors } from '@/constants/theme';

/** Color System 02 — Figma Make opening export (Request animation source). */
const CORAL = lightColors.accent;
const INK = lightColors.ink;
const CREAM = lightColors.canvas;
const SCROLL_EASE = Easing.bezier(0.12, 0.82, 0.24, 1);
const EXIT_EASE = Easing.bezier(0.4, 0, 0.2, 1);
const LETTERS = ['C', 'u', 't', 'L', 'y'] as const;

const DESIGN_W = layout.designWidth;
const DESIGN_H = 1280;
const FIELD_H = layout.designHeight;
const ICON = 56;
const SCROLL_DISTANCE = 980;
const TIMELINE_MS = 900;
/** Only cells that can appear during the 980px scroll — cuts RAM vs full 168. */
const MAX_CELL_TOP = SCROLL_DISTANCE + DESIGN_H;

export function OpeningSplash({ onReveal, onDone }: { onReveal?: () => void; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / DESIGN_W, height / DESIGN_H);
  const offsetX = (width - DESIGN_W * scale) / 2;
  const offsetY = (height - DESIGN_H * scale) / 2;

  const [loaded] = useFonts({
    PoppinsExtraBold: require('@/assets/fonts/Poppins-ExtraBold.ttf'),
    PoppinsMedium: require('@/assets/fonts/Poppins-Medium.ttf')
  });
  const [reduceMotion, setReduceMotion] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const brandPulse = useRef(new Animated.Value(0.45)).current;
  const pulseOpacity = useRef(new Animated.Value(0)).current;
  const pulseX = useRef(new Animated.Value(-33)).current;
  const lettersMotion = useRef(
    LETTERS.map(() => ({
      opacity: new Animated.Value(1),
      y: new Animated.Value(0),
      scale: new Animated.Value(1)
    }))
  ).current;
  const tagOpacity = useRef(new Animated.Value(1)).current;
  const tagY = useRef(new Animated.Value(0)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const rootScale = useRef(new Animated.Value(1)).current;

  const revealRef = useRef(onReveal);
  const doneRef = useRef(onDone);
  revealRef.current = onReveal;
  doneRef.current = onDone;

  const cells = useMemo(
    () => layout.cells.filter((cell) => cell.t < MAX_CELL_TOP && splashFieldSources[cell.f]),
    []
  );

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    const driver = { useNativeDriver: true as const };
    let cancelled = false;
    const scrollTo = -SCROLL_DISTANCE * scale;

    const finish = () => {
      if (cancelled) return;
      revealRef.current?.();
      doneRef.current();
    };

    if (reduceMotion) {
      brandPulse.setValue(1);
      statusOpacity.setValue(1);
      scrollY.setValue(scrollTo);
      const t = setTimeout(finish, 500);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    // Soft entrance on brand (already visible — no blank coral hold).
    lettersMotion.forEach((motion, index) => {
      motion.opacity.setValue(0);
      motion.y.setValue(14);
      motion.scale.setValue(0.9);
    });
    tagOpacity.setValue(0);
    tagY.setValue(8);

    const letterAnims = lettersMotion.map((motion, index) =>
      Animated.sequence([
        Animated.delay(80 + index * 45),
        Animated.parallel([
          Animated.timing(motion.opacity, { toValue: 1, duration: 360, easing: SCROLL_EASE, ...driver }),
          Animated.timing(motion.y, { toValue: 0, duration: 360, easing: SCROLL_EASE, ...driver }),
          Animated.timing(motion.scale, { toValue: 1, duration: 360, easing: SCROLL_EASE, ...driver })
        ])
      ])
    );

    const intro = Animated.parallel([
      Animated.timing(scrollY, {
        toValue: scrollTo,
        duration: TIMELINE_MS,
        easing: SCROLL_EASE,
        ...driver
      }),
      Animated.sequence([
        Animated.timing(brandPulse, {
          toValue: 1,
          duration: TIMELINE_MS * 0.375,
          easing: Easing.inOut(Easing.ease),
          ...driver
        }),
        Animated.timing(brandPulse, {
          toValue: 0.75,
          duration: TIMELINE_MS * 0.3,
          easing: Easing.inOut(Easing.ease),
          ...driver
        }),
        Animated.timing(brandPulse, {
          toValue: 0.45,
          duration: TIMELINE_MS * 0.325,
          easing: Easing.inOut(Easing.ease),
          ...driver
        })
      ]),
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: TIMELINE_MS * 0.0625,
          easing: Easing.inOut(Easing.ease),
          ...driver
        }),
        Animated.delay(TIMELINE_MS * 0.7875),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: TIMELINE_MS * 0.0875,
          easing: Easing.inOut(Easing.ease),
          ...driver
        })
      ]),
      Animated.sequence([
        Animated.delay(TIMELINE_MS * 0.0625),
        Animated.timing(pulseX, {
          toValue: 45,
          duration: TIMELINE_MS * 0.7875,
          easing: Easing.linear,
          ...driver
        })
      ]),
      ...letterAnims,
      Animated.sequence([
        Animated.delay(420),
        Animated.parallel([
          Animated.timing(tagOpacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.ease), ...driver }),
          Animated.timing(tagY, { toValue: 0, duration: 420, easing: Easing.out(Easing.ease), ...driver })
        ])
      ]),
      Animated.sequence([
        Animated.delay(560),
        Animated.timing(statusOpacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.ease), ...driver })
      ])
    ]);

    intro.start(({ finished }) => {
      if (!finished || cancelled) return;
      Animated.parallel([
        Animated.timing(rootOpacity, { toValue: 0, duration: 420, easing: EXIT_EASE, ...driver }),
        Animated.timing(rootScale, { toValue: 1.04, duration: 420, easing: EXIT_EASE, ...driver })
      ]).start(() => {
        if (!cancelled) finish();
      });
    });

    const failsafe = setTimeout(finish, TIMELINE_MS + 500);

    return () => {
      cancelled = true;
      intro.stop();
      clearTimeout(failsafe);
    };
  }, [reduceMotion, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.root, { opacity: rootOpacity, transform: [{ scale: rootScale }] }]}
    >
      <StatusBar style="light" />

      <Animated.View
        style={[
          styles.iconField,
          {
            left: offsetX,
            top: offsetY,
            width: DESIGN_W * scale,
            height: FIELD_H * scale,
            transform: [{ translateY: scrollY }]
          }
        ]}
      >
        {cells.map((cell) => (
          <Image
            key={`${cell.f}-${cell.l}-${cell.t}`}
            source={splashFieldSources[cell.f]}
            style={{
              position: 'absolute',
              left: cell.l * scale,
              top: cell.t * scale,
              width: ICON * scale,
              height: ICON * scale,
              opacity: 0.82
            }}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={cell.f}
          />
        ))}
      </Animated.View>

      {/* Soft logo clear-zone: fade in → solid → fade out (symmetric). */}
      <LinearGradient
        colors={['rgba(240,107,85,0)', CORAL]}
        style={[
          styles.maskFade,
          {
            left: offsetX,
            top: offsetY + 420 * scale,
            width: DESIGN_W * scale,
            height: 120 * scale
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.logoMask,
          {
            left: offsetX,
            top: offsetY + 540 * scale,
            width: DESIGN_W * scale,
            height: 200 * scale
          }
        ]}
      />
      <LinearGradient
        colors={[CORAL, 'rgba(240,107,85,0)']}
        style={[
          styles.maskFade,
          {
            left: offsetX,
            top: offsetY + 740 * scale,
            width: DESIGN_W * scale,
            height: 120 * scale
          }
        ]}
      />

      <View style={styles.center}>
        <Animated.View style={[styles.brandAccent, { opacity: brandPulse, transform: [{ scale }] }]} />
        <View style={styles.word}>
          {LETTERS.map((char, index) => {
            const motion = lettersMotion[index];
            return (
              <Animated.Text
                key={char + index}
                style={{
                  color: CREAM,
                  fontFamily: loaded ? 'PoppinsExtraBold' : undefined,
                  fontSize: 83 * scale,
                  lineHeight: 94 * scale,
                  fontWeight: loaded ? undefined : '800',
                  opacity: motion.opacity,
                  transform: [{ translateY: motion.y }, { scale: motion.scale }]
                }}
              >
                {char}
              </Animated.Text>
            );
          })}
        </View>
        <Animated.View style={[styles.divider, { opacity: brandPulse, transform: [{ scaleX: scale }] }]} />
        <Animated.Text
          style={[
            styles.tagline,
            {
              fontFamily: loaded ? 'PoppinsMedium' : undefined,
              fontSize: 12 * scale,
              letterSpacing: 3.2 * scale,
              opacity: tagOpacity,
              transform: [{ translateY: tagY }]
            }
          ]}
        >
          GROOMING MADE EASY
        </Animated.Text>
      </View>

      <View style={[styles.footer, { bottom: 72 * scale }]}>
        <View style={[styles.track, { width: 128 * scale, height: 3 * scale }]}>
          <Animated.View style={[styles.trackFill, { opacity: brandPulse }]} />
          <Animated.View
            style={[
              styles.pulse,
              {
                width: 50 * scale,
                height: 2 * scale,
                opacity: pulseOpacity,
                transform: [{ translateX: pulseX }]
              }
            ]}
          />
        </View>
        <Animated.Text style={[styles.status, { opacity: statusOpacity, fontSize: 13 * scale }]}>
          Preparing your experience
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    backgroundColor: CORAL,
    overflow: 'hidden'
  },
  iconField: {
    position: 'absolute'
  },
  logoMask: {
    position: 'absolute',
    backgroundColor: CORAL,
    zIndex: 1
  },
  maskFade: {
    position: 'absolute',
    zIndex: 1
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    gap: 10
  },
  brandAccent: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.10)'
  },
  word: { flexDirection: 'row', alignItems: 'flex-end' },
  divider: {
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    marginTop: 8
  },
  tagline: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.72)'
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 14,
    zIndex: 2
  },
  track: {
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    justifyContent: 'center'
  },
  trackFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.45)'
  },
  pulse: {
    position: 'absolute',
    left: '26%',
    borderRadius: 2,
    backgroundColor: '#FFFFFF'
  },
  status: {
    fontWeight: '500',
    color: INK,
    opacity: 0.85
  }
});
