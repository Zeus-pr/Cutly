import { describe, expect, it } from 'vitest';
import {
  isPartnerHistoryStatus,
  PARTNER_HISTORY_STATUSES,
  partnerHistoryStatusLabel
} from '../backend/src/partnerHistory';

describe('partner history statuses', () => {
  it('includes accepted (CONFIRMED) and floor progress', () => {
    expect(PARTNER_HISTORY_STATUSES).toContain('CONFIRMED');
    expect(PARTNER_HISTORY_STATUSES).toContain('ARRIVED');
    expect(PARTNER_HISTORY_STATUSES).toContain('IN_SERVICE');
    expect(PARTNER_HISTORY_STATUSES).toContain('COMPLETED');
  });

  it('excludes open request / unpaid states', () => {
    expect(isPartnerHistoryStatus('AWAITING_SHOP')).toBe(false);
    expect(isPartnerHistoryStatus('PAYMENT_PENDING')).toBe(false);
    expect(isPartnerHistoryStatus('FAILED')).toBe(false);
  });

  it('labels accepted bookings clearly', () => {
    expect(partnerHistoryStatusLabel('CONFIRMED')).toBe('Accepted');
    expect(partnerHistoryStatusLabel('REJECTED')).toBe('Rejected');
    expect(partnerHistoryStatusLabel('EXPIRED')).toBe('Appointment missed');
  });
});
