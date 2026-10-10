import { describe, expect, it } from 'vitest';
import { HOLD_TAKEN_MESSAGE, SLOT_TAKEN_MESSAGE, isSlotRaceError, throwIfSlotRace } from '../backend/src/race';

describe('slot race mapping (CJ-04)', () => {
  it('detects exclusion and serialization failures', () => {
    expect(isSlotRaceError({ code: 'P2002' })).toBe(true);
    expect(isSlotRaceError({ code: 'P2034' })).toBe(true);
    expect(isSlotRaceError({ message: 'conflict on constraint booking_barber_no_overlap' })).toBe(true);
    expect(isSlotRaceError({ message: 'SQLSTATE 23P01' })).toBe(true);
    expect(isSlotRaceError({ message: 'could not serialize access' })).toBe(true);
    expect(isSlotRaceError({ message: 'something else' })).toBe(false);
  });

  it('throws the user-facing slot message', () => {
    expect(() => throwIfSlotRace({ code: 'P2002' }, 'booking')).toThrow(SLOT_TAKEN_MESSAGE);
    expect(() => throwIfSlotRace({ message: 'hold_barber_no_overlap' }, 'hold')).toThrow(HOLD_TAKEN_MESSAGE);
  });
});
