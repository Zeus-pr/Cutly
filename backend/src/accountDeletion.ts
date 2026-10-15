import { createHmac } from 'node:crypto';
import type { ShopStatus } from '@prisma/client';

/**
 * T3 (#8) account deletion: pure rules + config. No database access here so the
 * rules can be unit-tested. See docs/privacy-account-deletion.md.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

function envFlag(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

/** Restore window after a delete request (Prajesh: 14 days). */
export function graceDays() {
  return envInt('ACCOUNT_DELETION_GRACE_DAYS', 14, 1, 90);
}

/** DeletedIdentity rows are kept this long, then purged (12 months). */
export function deletedIdentityRetentionDays() {
  return envInt('DELETED_IDENTITY_RETENTION_DAYS', 365, 30, 3650);
}

/**
 * Product calls pending with Prajesh. Defaults follow the decisions log (round 2).
 * - formerCustomerDuringGrace: partners/public see "Former customer" (and no phone) from the request.
 * - partnerSelfDelete: partners may delete their own account (only with zero upcoming bookings).
 * - partnerRestoreShopStatus: what a CLOSED shop becomes when the partner restores. Never ACTIVE.
 */
export function deletionFlags() {
  const restore = (process.env.PARTNER_RESTORE_SHOP_STATUS || '').trim().toUpperCase();
  return {
    formerCustomerDuringGrace: envFlag('DELETION_FORMER_CUSTOMER_DURING_GRACE', true),
    partnerSelfDelete: envFlag('PARTNER_SELF_DELETE_ENABLED', true),
    partnerRestoreShopStatus: (restore === 'CLOSED' ? 'CLOSED' : 'PAUSED') as Extract<ShopStatus, 'PAUSED' | 'CLOSED'>
  };
}

/** Deadline = request instant + grace, in UTC instants (an IST-midnight purge run does not matter). */
export function deletionDeadline(requestedAt: Date, days = graceDays()) {
  return new Date(requestedAt.getTime() + days * DAY_MS);
}

export type DeletionState = 'active' | 'pending' | 'expired' | 'purged';

/**
 * - pending: inside the grace window → a normal sign-in restores the account.
 * - expired: past the deadline but not purged yet → treated as purged (generic auth failure).
 * - purged: PII is gone.
 */
export function deletionState(
  row: { deletionRequestedAt?: Date | null; deletedAt?: Date | null },
  now = new Date(),
  days = graceDays()
): DeletionState {
  if (row.deletedAt) return 'purged';
  if (!row.deletionRequestedAt) return 'active';
  return now.getTime() < deletionDeadline(row.deletionRequestedAt, days).getTime() ? 'pending' : 'expired';
}

export function isDeletionRequested(row: { deletionRequestedAt?: Date | null; deletedAt?: Date | null }) {
  return Boolean(row.deletionRequestedAt || row.deletedAt);
}

/** Purge is due for rows whose request is older than this instant. */
export function purgeCutoff(now = new Date(), days = graceDays()) {
  return new Date(now.getTime() - days * DAY_MS);
}

export const FORMER_CUSTOMER = 'Former customer';

type CustomerLike = {
  name: string | null;
  phone?: string | null;
  deletionRequestedAt?: Date | null;
  deletedAt?: Date | null;
};

function hidesCustomer(user: CustomerLike) {
  if (user.deletedAt) return true;
  return Boolean(user.deletionRequestedAt) && deletionFlags().formerCustomerDuringGrace;
}

/** Partner-facing customer name (`fallback` keeps the existing "Customer"/"Guest" wording). */
export function displayCustomerName(user: CustomerLike, fallback = 'Customer') {
  if (hidesCustomer(user)) return FORMER_CUSTOMER;
  return user.name || fallback;
}

/** Public review list shows first name only. */
export function displayReviewerName(user: CustomerLike) {
  if (hidesCustomer(user)) return FORMER_CUSTOMER;
  return (user.name || 'Guest').split(/\s+/)[0] || 'Guest';
}

export function displayCustomerPhone(user: CustomerLike) {
  if (hidesCustomer(user)) return null;
  return user.phone || null;
}

/** Normalise to E.164 before hashing. Bare 10-digit Indian mobiles get +91. */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, '');
  if (trimmed.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function phoneHashKey() {
  const key = process.env.PHONE_HASH_KEY?.trim() || '';
  if (key.length < 16) throw new Error('PHONE_HASH_KEY is not set (need at least 16 characters).');
  return key;
}

/** HMAC-SHA256(PHONE_HASH_KEY, E.164 phone) as hex. Null when the phone cannot be normalised. */
export function phoneHmac(phone: string, key = phoneHashKey()): string | null {
  const e164 = toE164(phone);
  if (!e164) return null;
  return createHmac('sha256', key).update(e164).digest('hex');
}

/** Booking statuses that block a partner delete (with a future or in-progress start). */
export const PARTNER_BLOCKING_STATUSES = ['HELD', 'PAYMENT_PENDING', 'AWAITING_SHOP', 'CONFIRMED', 'ARRIVED', 'IN_SERVICE'] as const;

/** Customer visits that block a customer delete outright ("finish your current visit first"). */
export const CUSTOMER_IN_VISIT_STATUSES = ['ARRIVED', 'IN_SERVICE'] as const;

/**
 * An ARRIVED/IN_SERVICE booking blocks a customer delete only if its slot ended within
 * this window. Older ones are stale (the shop never closed them out) and must not lock
 * the customer out of deleting.
 */
export const IN_VISIT_RECENT_MS = 6 * 60 * 60 * 1000;

/** Customer bookings cancelled when the customer deletes their account (only if endsAt > now). */
export const CUSTOMER_CANCEL_ON_DELETE_STATUSES = ['HELD', 'PAYMENT_PENDING', 'AWAITING_SHOP', 'CONFIRMED'] as const;

/** A booking blocks partner delete when it is in a live status and not over yet. */
export function blocksPartnerDelete(row: { status: string; endsAt: Date }, now = new Date()) {
  if (!(PARTNER_BLOCKING_STATUSES as readonly string[]).includes(row.status)) return false;
  // A visit in the chair blocks even if it overran its slot.
  if (row.status === 'ARRIVED' || row.status === 'IN_SERVICE') return true;
  return row.endsAt.getTime() > now.getTime();
}

/** Shop isActive mirrors status for one release (DBA). */
export function shopStatusData(status: ShopStatus) {
  return { status, isActive: status === 'ACTIVE' };
}
