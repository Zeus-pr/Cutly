/** 30% advance in paise — server is source of truth (CJ-02). */
export function advancePaiseFromTotal(totalPaise: number): number {
  if (!Number.isFinite(totalPaise) || totalPaise <= 0) return 0;
  return Math.round(totalPaise * 0.3);
}

/** Stable booking idempotency key (CJ-12). `serviceIdsKey` = sorted ids joined by `+`. */
export function bookingIdempotencyKey(input: {
  userId: string;
  shopId: string;
  serviceId: string;
  barberId: string;
  startsAtIso: string;
}): string {
  return `book_${input.userId}_${input.shopId}_${input.serviceId}_${input.barberId}_${input.startsAtIso}`;
}

/** Bind a client-supplied key to the authenticated user (CJ-13). */
export function bindClientIdempotencyKey(userId: string, clientKey: string): string {
  const trimmed = clientKey.trim();
  if (trimmed.startsWith(`book_${userId}_`)) return trimmed;
  return `book_${userId}_${trimmed}`;
}

/** Free `idempotencyKey` after cancel/reject/expire so the same slot can be booked again (CJ-14). */
export function archivedIdempotencyKey(bookingId: string): string {
  return `archived_${bookingId}`;
}
