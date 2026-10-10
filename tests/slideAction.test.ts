import { describe, expect, it } from 'vitest';
import {
  SLIDE_COMPLETE_THRESHOLD,
  shouldCompleteSlide,
  slideFillFromTranslation,
  slideMaxTravel
} from '../utils/slideAction';

describe('slide-to-action math', () => {
  it('computes travel room from track width', () => {
    expect(slideMaxTravel(280)).toBe(280 - 44 - 8);
    expect(slideMaxTravel(10)).toBe(1);
  });

  it('clamps fill between 0 and 1', () => {
    expect(slideFillFromTranslation(-20, 280)).toBe(0);
    expect(slideFillFromTranslation(0, 280)).toBe(0);
    expect(slideFillFromTranslation(9999, 280)).toBe(1);
    const mid = slideFillFromTranslation(114, 280);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('completes only past threshold', () => {
    expect(shouldCompleteSlide(SLIDE_COMPLETE_THRESHOLD - 0.01)).toBe(false);
    expect(shouldCompleteSlide(SLIDE_COMPLETE_THRESHOLD)).toBe(true);
    expect(shouldCompleteSlide(1)).toBe(true);
  });
});
