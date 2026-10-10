/** India Standard Time helpers — all booking calendar days use Asia/Kolkata. */

export const IST = 'Asia/Kolkata';

/** YYYY-MM-DD for the calendar day in Asia/Kolkata. */
/** Calendar date `YYYY-MM-DD` in Asia/Kolkata for an instant. */
export function dateKeyIST(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(at);
}

export function todayKeyIST(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(now);
}

/** Shift an IST calendar day key by `days` (may be negative). */
export function addDaysKeyIST(dateKey: string, days: number): string {
  const base = new Date(`${assertDateKeyIST(dateKey)}T12:00:00+05:30`);
  base.setTime(base.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(base);
}

/** Accept only a real YYYY-MM-DD calendar day (interpreted in IST). */
export function assertDateKeyIST(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error('Pick a valid date.');
  }
  const parsed = new Date(`${dateKey}T12:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Pick a valid date.');
  }
  const roundTrip = new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(parsed);
  if (roundTrip !== dateKey) {
    throw new Error('Pick a valid date.');
  }
  return dateKey;
}

/** Inclusive start / exclusive end for an IST calendar day. */
export function dayRangeIST(dateKey: string) {
  const key = assertDateKeyIST(dateKey);
  const start = new Date(`${key}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Instant for `YYYY-MM-DD` + `HH:mm:ss` wall clock in IST. */
export function atIST(dateKey: string, timeHms: string): Date {
  const key = assertDateKeyIST(dateKey);
  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeHms)) {
    throw new Error('Pick a valid time.');
  }
  const at = new Date(`${key}T${timeHms}+05:30`);
  if (Number.isNaN(at.getTime())) throw new Error('Pick a valid time.');
  return at;
}

export function formatIST(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...options }).format(date);
}
