/** Client-side hold countdown helpers (mirrors backend/src/holds.ts). */

export const HOLD_MINUTES = 8;

export function holdSecondsLeft(expiresAtIso: string, now = new Date()): number {
  const expires = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, Math.floor((expires - now.getTime()) / 1000));
}

export function formatHoldCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
