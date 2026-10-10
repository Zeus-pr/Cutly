import { describe, expect, it } from 'vitest';
import {
  assertFutureStart,
  calculateSlots,
  filterFutureSlots,
  isFutureStart
} from '../backend/src/availability';

const d = (time: string) => new Date(`2026-09-30T${time}:00+05:30`);

describe('availability engine', () => {
  it('excludes bookings and breaks while respecting barber hours', () => {
    const slots = calculateSlots({
      shop: { start: d('10:00'), end: d('18:00') },
      barber: { start: d('10:00'), end: d('18:00') },
      bookings: [{ start: d('12:00'), end: d('12:30') }],
      breaks: [{ start: d('13:30'), end: d('14:15') }],
      durationMinutes: 30
    });
    const times = slots.map((s) => s.start.toISOString());
    expect(times).not.toContain(d('12:00').toISOString());
    expect(times).not.toContain(d('13:30').toISOString());
    expect(slots.at(-1)?.end.toISOString()).toBe(d('18:00').toISOString());
  });
});

describe('holds block slots (CJ-03)', () => {
  it('excludes an active hold window', () => {
    const slots = calculateSlots({
      shop: { start: d('10:00'), end: d('18:00') },
      barber: { start: d('10:00'), end: d('18:00') },
      holds: [{ start: d('11:00'), end: d('11:30') }],
      durationMinutes: 30
    });
    const times = slots.map((s) => s.start.toISOString());
    expect(times).not.toContain(d('11:00').toISOString());
    expect(times).toContain(d('10:30').toISOString());
  });
});

describe('walk-ins block timeline (CJ-23)', () => {
  it('excludes an active walk-in window', () => {
    const slots = calculateSlots({
      shop: { start: d('10:00'), end: d('18:00') },
      barber: { start: d('10:00'), end: d('18:00') },
      walkIns: [{ start: d('15:00'), end: d('15:45') }],
      durationMinutes: 30
    });
    const times = slots.map((s) => s.start.toISOString());
    expect(times).not.toContain(d('15:00').toISOString());
    expect(times).not.toContain(d('15:30').toISOString());
    expect(times).toContain(d('14:30').toISOString());
  });
});

describe('breaks and leave (CJ-20)', () => {
  it('excludes break and leave windows', () => {
    const slots = calculateSlots({
      shop: { start: d('10:00'), end: d('16:00') },
      barber: { start: d('10:00'), end: d('16:00') },
      breaks: [{ start: d('12:00'), end: d('12:30') }],
      leave: [{ start: d('14:00'), end: d('16:00') }],
      durationMinutes: 30
    });
    const times = slots.map((s) => s.start.toISOString());
    expect(times).not.toContain(d('12:00').toISOString());
    expect(times).not.toContain(d('14:00').toISOString());
    expect(times).toContain(d('11:30').toISOString());
  });
});

describe('buffer / turnover (CJ-11)', () => {
  it('spaces slot starts by duration + buffer while returning service end only', () => {
    const slots = calculateSlots({
      shop: { start: d('10:00'), end: d('12:00') },
      barber: { start: d('10:00'), end: d('12:00') },
      // Existing visit already expanded with its turnover (as customer.ts does)
      bookings: [{ start: d('10:00'), end: d('10:40') }],
      durationMinutes: 30,
      bufferMinutes: 10
    });
    const times = slots.map((s) => s.start.toISOString());
    // Busy until 10:40 → next grid start 11:00; service end stays 11:30
    expect(times).not.toContain(d('10:00').toISOString());
    expect(times).not.toContain(d('10:30').toISOString());
    expect(times).toContain(d('11:00').toISOString());
    const eleven = slots.find((s) => s.start.getTime() === d('11:00').getTime());
    expect(eleven?.end.toISOString()).toBe(d('11:30').toISOString());
  });

  it('adds a last-fit start so closing time updates reach customers', () => {
    const slots = calculateSlots({
      shop: { start: d('22:00'), end: d('23:59') },
      barber: { start: d('22:00'), end: d('23:59') },
      durationMinutes: 20,
      bufferMinutes: 10
    });
    const times = slots.map((s) => s.start.toISOString());
    // 15-min grid + last start 23:29 (23:59 − 30m occupy)
    expect(times).toContain(d('23:00').toISOString());
    expect(times).toContain(d('23:15').toISOString());
    expect(times).toContain(d('23:29').toISOString());
    expect(times).not.toContain(d('23:30').toISOString());
  });
});

describe('past start times (CJ-06)', () => {
  const now = d('14:00');

  it('keeps only future slot starts', () => {
    const slots = [
      { start: d('13:30'), end: d('14:00') },
      { start: d('14:00'), end: d('14:30') },
      { start: d('14:30'), end: d('15:00') }
    ];
    const future = filterFutureSlots(slots, now);
    expect(future.map((s) => s.start.toISOString())).toEqual([d('14:30').toISOString()]);
  });

  it('treats exact now as past (not bookable)', () => {
    expect(isFutureStart(d('14:00'), now)).toBe(false);
    expect(isFutureStart(d('14:01'), now)).toBe(true);
  });

  it('rejects booking a past start', () => {
    expect(() => assertFutureStart(d('13:00'), now)).toThrow(/already passed/);
    expect(() => assertFutureStart(d('15:00'), now)).not.toThrow();
  });
});

