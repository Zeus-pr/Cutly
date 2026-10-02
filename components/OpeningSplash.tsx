import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Svg, { Circle, G, Path } from 'react-native-svg';

const teal = '#0EC9A5';
const overshoot = Easing.bezier(0.34, 1.3, 0.64, 1);
const snip = Easing.bezier(0.34, 1.2, 0.64, 1);
const easeOut = Easing.out(Easing.ease);
const exitEase = Easing.bezier(0.4, 0, 0.2, 1);
const letters = ['C', 'u', 't', 'L', 'y'];

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function OpeningSplash({ onReveal, onDone }: { onReveal?: () => void; onDone: () => void }) {
  const [loaded] = useFonts({
    PoppinsExtraBold: require('@/assets/fonts/Poppins-ExtraBold.ttf'),
    PoppinsMedium: require('@/assets/fonts/Poppins-Medium.ttf')
  });
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.55)).current;
  const topBlade = useRef(new Animated.Value(-18)).current;
  const bottomBlade = useRef(new Animated.Value(18)).current;
  const ringAOpacity = useRef(new Animated.Value(0)).current;
  const ringBOpacity = useRef(new Animated.Value(0)).current;
  const lettersMotion = useRef(letters.map(() => ({
    opacity: new Animated.Value(0),
    y: new Animated.Value(14),
    scale: new Animated.Value(0.85)
  }))).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const tagY = useRef(new Animated.Value(8)).current;
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const rootScale = useRef(new Animated.Value(1)).current;

  const revealRef = useRef(onReveal);
  const doneRef = useRef(onDone);
  revealRef.current = onReveal;
  doneRef.current = onDone;

  useEffect(() => {
    const driver = { useNativeDriver: false as const };
    const letterAnims = lettersMotion.map((motion, index) =>
      Animated.sequence([
        Animated.delay(720 + index * 70),
        Animated.parallel([
          Animated.timing(motion.opacity, { toValue: 1, duration: 360, easing: overshoot, ...driver }),
          Animated.timing(motion.y, { toValue: -3, duration: 360, easing: overshoot, ...driver }),
          Animated.timing(motion.scale, { toValue: 1.03, duration: 360, easing: overshoot, ...driver })
        ]),
        Animated.parallel([
          Animated.timing(motion.y, { toValue: 1, duration: 120, easing: overshoot, ...driver }),
          Animated.timing(motion.scale, { toValue: 0.99, duration: 120, easing: overshoot, ...driver })
        ]),
        Animated.parallel([
          Animated.timing(motion.y, { toValue: 0, duration: 120, easing: overshoot, ...driver }),
          Animated.timing(motion.scale, { toValue: 1, duration: 120, easing: overshoot, ...driver })
        ])
      ])
    );
    const snipBlade = (value: Animated.Value, frames: number[]) =>
      Animated.sequence([
        Animated.delay(550),
        Animated.timing(value, { toValue: frames[0], duration: 350, easing: snip, ...driver }),
        Animated.timing(value, { toValue: frames[1], duration: 175, easing: snip, ...driver }),
        Animated.timing(value, { toValue: 0, duration: 175, easing: snip, ...driver })
      ]);
    Animated.parallel([
      Animated.sequence([
        Animated.delay(100),
        Animated.parallel([
          Animated.timing(iconOpacity, { toValue: 1, duration: 480, easing: overshoot, ...driver }),
          Animated.timing(iconScale, { toValue: 1.05, duration: 480, easing: overshoot, ...driver })
        ]),
        Animated.timing(iconScale, { toValue: 0.97, duration: 160, easing: overshoot, ...driver }),
        Animated.timing(iconScale, { toValue: 1, duration: 160, easing: overshoot, ...driver })
      ]),
      snipBlade(topBlade, [5, -2]),
      snipBlade(bottomBlade, [-5, 2]),
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(ringAOpacity, { toValue: 1, duration: 700, easing: easeOut, ...driver })
      ]),
      Animated.sequence([
        Animated.delay(480),
        Animated.timing(ringBOpacity, { toValue: 1, duration: 700, easing: easeOut, ...driver })
      ]),
      ...letterAnims,
      Animated.sequence([
        Animated.delay(1550),
        Animated.parallel([
          Animated.timing(tagOpacity, { toValue: 1, duration: 700, easing: easeOut, ...driver }),
          Animated.timing(tagY, { toValue: 0, duration: 700, easing: easeOut, ...driver })
        ])
      ]),
      Animated.sequence([
        Animated.delay(2800),
        Animated.parallel([
          Animated.timing(rootOpacity, { toValue: 0, duration: 700, easing: exitEase, ...driver }),
          Animated.timing(rootScale, { toValue: 1.08, duration: 700, easing: exitEase, ...driver })
        ])
      ])
    ]).start();

    const reveal = setTimeout(() => revealRef.current?.(), 2800);
    const done = setTimeout(() => doneRef.current(), 3500);
    return () => {
      clearTimeout(reveal);
      clearTimeout(done);
    };
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[styles.root, { opacity: rootOpacity, transform: [{ scale: rootScale }] }]}>
      <StatusBar style="light" />
      <Animated.View style={[styles.icon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}>
        <Svg viewBox="0 0 120 80" width={86} height={58} fill="none">
          <AnimatedG originX={65} originY={40} rotation={topBlade}>
            <Path d="M 65 40 C 50 36 30 26 6 14" stroke="#ffffff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Path d="M 65 40 L 80 27" stroke="#ffffff" strokeWidth={4.5} strokeLinecap="round" fill="none" />
            <AnimatedCircle cx={93} cy={20} r={13} stroke="rgba(255,255,255,0.6)" strokeWidth={4} fill="none" opacity={ringAOpacity} />
          </AnimatedG>
          <AnimatedG originX={65} originY={40} rotation={bottomBlade}>
            <Path d="M 65 40 C 50 44 30 54 6 66" stroke="#ffffff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <Path d="M 65 40 L 80 53" stroke="#ffffff" strokeWidth={4.5} strokeLinecap="round" fill="none" />
            <AnimatedCircle cx={93} cy={60} r={13} stroke="rgba(255,255,255,0.6)" strokeWidth={4} fill="none" opacity={ringBOpacity} />
          </AnimatedG>
          <Circle cx={65} cy={40} r={4.5} fill="rgba(255,255,255,0.9)" />
        </Svg>
      </Animated.View>
      <View style={styles.wordWrap}>
        <View style={styles.word}>
          {letters.map((char, index) => {
            const motion = lettersMotion[index];
            return (
              <Animated.Text
                key={char + index}
                style={{
                  color: '#FFFFFF',
                  fontFamily: loaded ? 'PoppinsExtraBold' : undefined,
                  fontSize: 70,
                  lineHeight: 77,
                  opacity: motion.opacity,
                  transform: [{ translateY: motion.y }, { scale: motion.scale }]
                }}
              >
                {char}
              </Animated.Text>
            );
          })}
        </View>
        <Animated.View style={{ flexDirection: 'row', opacity: tagOpacity, transform: [{ translateY: tagY }] }}>
          {'GROOMING MADE EASY'.split('').map((char, index) => (
            <Text key={`${char}-${index}`} style={styles.tagline}>{char === ' ' ? ' ' : char}</Text>
          ))}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    backgroundColor: teal,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28
  },
  icon: {
    width: 134,
    height: 134,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden'
  },
  wordWrap: { alignItems: 'center', gap: 10, paddingHorizontal: 28 },
  word: { flexDirection: 'row', alignItems: 'flex-end' },
  tagline: {
    fontFamily: 'PoppinsMedium',
    fontSize: 13,
    marginHorizontal: 1.3,
    color: 'rgba(255,255,255,0.55)'
  }
});
