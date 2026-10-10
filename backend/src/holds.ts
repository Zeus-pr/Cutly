/** Active slot hold TTL (CJ-03). */
export const HOLD_MINUTES = 8;

export function holdExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + HOLD_MINUTES * 60_000);
}

export function isHoldAlive(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() > now.getTime();
}

/** Remaining whole seconds until expiry (0 if expired). */
export function holdSecondsLeft(expiresAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

export function formatHoldCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
