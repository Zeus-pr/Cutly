/** Partner History filter buckets (CJ / PS history polish). */
export type HistoryFilter = 'all' | 'accepted' | 'rejected' | 'missed' | 'cancelled';

export const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'missed', label: 'Missed' },
  { id: 'cancelled', label: 'Cancelled' }
];

const ACCEPTED = new Set(['CONFIRMED', 'ARRIVED', 'IN_SERVICE', 'COMPLETED']);
const MISSED = new Set(['EXPIRED', 'NO_SHOW']);

export function historyItemMatchesFilter(status: string, filter: HistoryFilter) {
  if (filter === 'all') return true;
  if (filter === 'accepted') return ACCEPTED.has(status);
  if (filter === 'rejected') return status === 'REJECTED';
  if (filter === 'missed') return MISSED.has(status);
  if (filter === 'cancelled') return status === 'CANCELLED';
  return true;
}
