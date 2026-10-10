const IST = 'Asia/Kolkata';

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST
  }).format(new Date(iso));

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: IST
  }).format(new Date(iso));

export const formatDateLong = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: IST
  }).format(new Date(iso));

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST
  }).format(new Date(iso));

/** YYYY-MM-DD for the calendar day in Asia/Kolkata. */
export function todayKeyIST(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(now);
}

export function addDaysKeyIST(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T12:00:00+05:30`);
  base.setTime(base.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(base);
}

export type BookingDay = {
  key: string;
  weekday: string;
  day: string;
  month: string;
  isToday: boolean;
};

/** Next `count` calendar days in IST, starting today (booking window default: 7). */
export function bookingDayOptions(count = 7, now = new Date()): BookingDay[] {
  const start = todayKeyIST(now);
  return Array.from({ length: count }, (_, i) => {
    const key = addDaysKeyIST(start, i);
    const at = new Date(`${key}T12:00:00+05:30`);
    return {
      key,
      weekday: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: IST }).format(at),
      day: new Intl.DateTimeFormat('en-IN', { day: 'numeric', timeZone: IST }).format(at),
      month: new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: IST }).format(at),
      isToday: i === 0
    };
  });
}

/** True when an ISO slot start is still bookable (CJ-06). */
export function isFutureStart(iso: string, now = new Date()): boolean {
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && at > now.getTime();
}

export function formatDayHeading(dateKey: string, now = new Date()): string {
  const at = new Date(`${dateKey}T12:00:00+05:30`);
  const today = todayKeyIST(now);
  const label = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: IST
  }).format(at);
  if (dateKey === today) return `Today · ${label}`;
  if (dateKey === addDaysKeyIST(today, 1)) return `Tomorrow · ${label}`;
  return label;
}

/** Checkout banner — “Today | 6 Oct, Tuesday, 2026”. */
export function formatDayBanner(dateKey: string, now = new Date()): string {
  const at = new Date(`${dateKey}T12:00:00+05:30`);
  const today = todayKeyIST(now);
  const body = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST
  }).format(at);
  if (dateKey === today) return `Today | ${body}`;
  if (dateKey === addDaysKeyIST(today, 1)) return `Tomorrow | ${body}`;
  return body;
}
