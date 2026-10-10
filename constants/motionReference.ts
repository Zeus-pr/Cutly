/**
 * Moti + Reanimated — modern motion reference for CUTLY.
 * Prefer these springs over React Native Paper’s Material transitions.
 * Product controls still use PressScale; Moti for enter/exit / layout.
 *
 * @example
 * import { MotiView } from 'moti';
 * <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={cutlySpring} />
 */
export const cutlySpring = {
  type: 'spring' as const,
  damping: 18,
  stiffness: 220,
  mass: 0.85
};

/** Slightly softer for sheets / large panels. */
export const cutlySheetSpring = {
  type: 'spring' as const,
  damping: 22,
  stiffness: 180,
  mass: 1
};

/** Stagger children (ms between items). */
export const cutlyStaggerMs = 45;
