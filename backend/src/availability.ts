export type Window = { start: Date; end: Date };
export type AvailabilityInput = {
  shop: Window;
  barber: Window;
  breaks?: Window[];
  leave?: Window[];
  bookings?: Window[];
  holds?: Window[];
  walkIns?: Window[];
  durationMinutes: number;
  bufferMinutes?: number;
  intervalMinutes?: number;
};

const overlaps = (a: Window, b: Window) => a.start < b.end && b.start < a.end;

/** Extend a visit window by turnover minutes (CJ-11). */
export function withBuffer(window: Window, bufferMinutes = 0): Window {
  const extra = Math.max(0, bufferMinutes) * 60000;
  if (!extra) return window;
  return { start: window.start, end: new Date(window.end.getTime() + extra) };
}

export function mapBuffered(
  rows: { start: Date; end: Date }[],
  bufferMinutes = 0
): Window[] {
  return rows.map((row) => withBuffer({ start: row.start, end: row.end }, bufferMinutes));
}

/**
 * Slot search uses duration+buffer so starts are spaced for turnover.
 * Returned slot.end is service end only (start + duration) for hold/book storage.
 * Default step is 15 minutes so late closing hours (e.g. 11:59) still yield
 * bookable starts after the last :00/:30 — plus an explicit last-fit start before close.
 */
export function calculateSlots(input: AvailabilityInput): Window[] {
  const step = (input.intervalMinutes ?? 15) * 60000;
  const serviceMs = input.durationMinutes * 60000;
  const occupyMs = serviceMs + Math.max(0, input.bufferMinutes || 0) * 60000;
  const blocked = [
    ...(input.breaks || []),
    ...(input.leave || []),
    ...(input.bookings || []),
    ...(input.holds || []),
    ...(input.walkIns || [])
  ];
  const byStart = new Map<number, Window>();

  function consider(cursor: number) {
    if (cursor + occupyMs > input.barber.end.getTime()) return;
    if (cursor < input.barber.start.getTime()) return;
    const service = { start: new Date(cursor), end: new Date(cursor + serviceMs) };
    const occupy = { start: service.start, end: new Date(cursor + occupyMs) };
    if (!overlaps(occupy, input.shop)) return;
    if (blocked.some((window) => overlaps(occupy, window))) return;
    byStart.set(cursor, service);
  }

  for (let cursor = input.barber.start.getTime(); cursor + occupyMs <= input.barber.end.getTime(); cursor += step) {
    consider(cursor);
  }
  // Last start that still finishes (service+buffer) by closing time — uses full shop hours.
  consider(input.barber.end.getTime() - occupyMs);

  return [...byStart.entries()].sort((a, b) => a[0] - b[0]).map(([, slot]) => slot);
}

/** True when the slot start is still in the future (CJ-06). */
export function isFutureStart(startsAt: Date, now = new Date()): boolean {
  return startsAt.getTime() > now.getTime();
}

export function filterFutureSlots(slots: Window[], now = new Date()): Window[] {
  return slots.filter((slot) => isFutureStart(slot.start, now));
}

export function assertFutureStart(startsAt: Date, now = new Date()): void {
  if (!isFutureStart(startsAt, now)) {
    throw new Error('That time has already passed. Pick a later slot.');
  }
}
