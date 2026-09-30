import { describe, expect, it } from 'vitest';
import { calculateSlots } from '../backend/src/availability';
const d = (time: string) => new Date(`2026-09-30T${time}:00+05:30`);
describe('availability engine', () => { it('excludes bookings and breaks while respecting barber hours', () => { const slots = calculateSlots({ shop: { start: d('10:00'), end: d('18:00') }, barber: { start: d('10:00'), end: d('18:00') }, bookings: [{ start: d('12:00'), end: d('12:30') }], breaks: [{ start: d('13:30'), end: d('14:15') }], durationMinutes: 30 }); const times = slots.map((s) => s.start.toISOString()); expect(times).not.toContain(d('12:00').toISOString()); expect(times).not.toContain(d('13:30').toISOString()); expect(slots.at(-1)?.end.toISOString()).toBe(d('18:00').toISOString()); }); });
