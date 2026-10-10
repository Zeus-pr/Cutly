/** Friendly mapping for Postgres exclusion / unique races (CJ-04). */

export const SLOT_TAKEN_MESSAGE = 'That slot was just taken. Pick another time.';
export const HOLD_TAKEN_MESSAGE = 'Someone else is holding that slot. Try another time.';

export function isSlotRaceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  if (err.code === 'P2002' || err.code === 'P2034') return true;
  const message = String(err.message || '');
  return (
    message.includes('23P01') ||
    message.includes('exclusion') ||
    message.includes('booking_barber_no_overlap') ||
    message.includes('hold_barber_no_overlap') ||
    message.includes('walk_in_barber_no_overlap') ||
    message.includes('could not serialize') ||
    message.includes('SerializationFailure')
  );
}

export function throwIfSlotRace(error: unknown, kind: 'booking' | 'hold' | 'walk-in' = 'booking'): never {
  if (isSlotRaceError(error)) {
    throw new Error(kind === 'hold' ? HOLD_TAKEN_MESSAGE : SLOT_TAKEN_MESSAGE);
  }
  throw error;
}
