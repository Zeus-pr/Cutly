/** Statuses shown on partner History (decided / live / past — not open requests). */
export const PARTNER_HISTORY_STATUSES = [
  'CONFIRMED',
  'ARRIVED',
  'IN_SERVICE',
  'COMPLETED',
  'EXPIRED',
  'REJECTED',
  'CANCELLED',
  'NO_SHOW'
] as const;

export type PartnerHistoryStatus = (typeof PARTNER_HISTORY_STATUSES)[number];

export function isPartnerHistoryStatus(status: string): status is PartnerHistoryStatus {
  return (PARTNER_HISTORY_STATUSES as readonly string[]).includes(status);
}

export function partnerHistoryStatusLabel(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'Accepted';
    case 'ARRIVED':
      return 'Arrived';
    case 'IN_SERVICE':
      return 'In service';
    case 'COMPLETED':
      return 'Completed';
    case 'EXPIRED':
      return 'Appointment missed';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    case 'NO_SHOW':
      return 'No-show';
    default:
      return status.replace(/_/g, ' ');
  }
}
