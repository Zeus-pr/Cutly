/** Convert between API `HH:mm` (24h) and 12-hour clock fields. */

export type AmPm = 'AM' | 'PM';

export type Clock12 = {
  hour12: number;
  minute: number;
  period: AmPm;
};

/** Parse `HH:mm` or `H:mm` → 12h parts. Falls back to 10:00 AM. */
export function parseHHmmTo12(value: string): Clock12 {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  let hour24 = 10;
  let minute = 0;
  if (match) {
    hour24 = Math.min(23, Math.max(0, Number(match[1])));
    minute = Math.min(59, Math.max(0, Number(match[2])));
  }
  const period: AmPm = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, period };
}

/** Build `HH:mm` (24h) from 12h parts. */
export function format12ToHHmm(hour12: number, minute: number, period: AmPm): string {
  const h12 = Math.min(12, Math.max(1, Math.round(hour12) || 12));
  const m = Math.min(59, Math.max(0, Math.round(minute) || 0));
  let hour24 = h12 % 12;
  if (period === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Display label e.g. "9:00 AM", "8:30 PM". */
export function formatHHmmLabel(value: string): string {
  const { hour12, minute, period } = parseHHmmTo12(value);
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

/** Minutes since midnight from `HH:mm`. */
export function minutesFromHHmm(value: string): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  const hh = Math.min(23, Math.max(0, Number(match[1])));
  const mm = Math.min(59, Math.max(0, Number(match[2])));
  return hh * 60 + mm;
}

/** Closing must be strictly after opening (same calendar day; no overnight). */
export function isCloseAfterOpen(opensAt: string, closesAt: string): boolean {
  return minutesFromHHmm(closesAt) > minutesFromHHmm(opensAt);
}

/** Date used only to feed native time picker. */
export function dateFromHHmm(value: string, base = new Date()): Date {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  const hh = match ? Math.min(23, Number(match[1])) : 10;
  const mm = match ? Math.min(59, Number(match[2])) : 0;
  const next = new Date(base);
  next.setHours(hh, mm, 0, 0);
  return next;
}

export function hhmmFromDate(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Positive int string capped for service minutes / buffer. */
export function sanitizeMinuteCount(raw: string, max: number): string {
  const digits = raw.replace(/\D/g, '').slice(0, String(max).length);
  if (!digits) return '';
  const n = Number(digits);
  if (n > max) return String(max);
  return digits;
}
