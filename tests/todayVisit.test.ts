import { describe, expect, it } from 'vitest';
import type { Booking } from '../types/domain';
import {
  pickTodayVisit,
  todayVisitBg,
  todayVisitPhase,
  todayVisitShowsPin,
  todayVisitTitle,
  VISIT_TILE_GOLD,
  VISIT_TILE_NAVY,
  VISIT_TILE_TEAL
} from '../utils/todayVisit';

function booking(partial: Partial<Booking> & Pick<Booking, 'id' | 'status' | 'startsAt'>): Booking {
  return {
    shop: { id: 's1', name: 'Shop', imageUrl: '', address: '' },
    service: { id: 'svc', name: 'Haircut', durationMinutes: 30, pricePaise: 30000 },
    barber: { id: 'b1', name: 'Staff', rating: null },
    endsAt: partial.startsAt,
    totalPaise: 30000,
    advancePaise: 9000,
    bookingCode: 'C1',
    verifyPin: '1234',
    ...partial
  };
}

describe('pickTodayVisit', () => {
  it('returns null when no live today bookings', () => {
    const now = new Date('2026-10-07T10:00:00+05:30');
    expect(
      pickTodayVisit(
        [
          booking({
            id: '1',
            status: 'AWAITING_SHOP',
            startsAt: '2026-10-07T14:00:00+05:30'
          }),
          booking({
            id: '2',
            status: 'CONFIRMED',
            startsAt: '2026-10-08T14:00:00+05:30'
          })
        ],
        now
      )
    ).toBeNull();
  });

  it('prefers soonest upcoming today start', () => {
    const now = new Date('2026-10-07T10:00:00+05:30');
    const pick = pickTodayVisit(
      [
        booking({ id: 'later', status: 'CONFIRMED', startsAt: '2026-10-07T16:00:00+05:30' }),
        booking({ id: 'soon', status: 'CONFIRMED', startsAt: '2026-10-07T12:00:00+05:30' }),
        booking({ id: 'past', status: 'CONFIRMED', startsAt: '2026-10-07T08:00:00+05:30' })
      ],
      now
    );
    expect(pick?.id).toBe('soon');
  });

  it('prefers IN_SERVICE over confirmed', () => {
    const now = new Date('2026-10-07T18:00:00+05:30');
    const pick = pickTodayVisit(
      [
        booking({ id: 'c', status: 'CONFIRMED', startsAt: '2026-10-07T19:00:00+05:30' }),
        booking({ id: 's', status: 'IN_SERVICE', startsAt: '2026-10-07T12:00:00+05:30' })
      ],
      now
    );
    expect(pick?.id).toBe('s');
  });

  it('falls back to completed needing review', () => {
    const now = new Date('2026-10-07T20:00:00+05:30');
    const pick = pickTodayVisit(
      [
        booking({
          id: 'done',
          status: 'COMPLETED',
          startsAt: '2026-10-07T12:00:00+05:30',
          endsAt: '2026-10-07T12:30:00+05:30',
          canReview: true,
          hasReview: false
        })
      ],
      now
    );
    expect(pick?.id).toBe('done');
  });

  it('skips completed when review dismissed', () => {
    const now = new Date('2026-10-07T20:00:00+05:30');
    const pick = pickTodayVisit(
      [
        booking({
          id: 'done',
          status: 'COMPLETED',
          startsAt: '2026-10-07T12:00:00+05:30',
          canReview: true,
          hasReview: false
        })
      ],
      now,
      { dismissedReviewIds: ['done'] }
    );
    expect(pick).toBeNull();
  });
});

describe('todayVisit copy + colors', () => {
  it('titles, pin, phase colors', () => {
    expect(todayVisitTitle('CONFIRMED')).toBe('Upcoming visits');
    expect(todayVisitTitle('IN_SERVICE')).toBe('Service started');
    expect(todayVisitTitle('COMPLETED')).toBe('Service completed!');
    expect(todayVisitShowsPin('CONFIRMED')).toBe(true);
    expect(todayVisitShowsPin('IN_SERVICE')).toBe(false);
    expect(todayVisitPhase('ARRIVED')).toBe('upcoming');
    expect(todayVisitPhase('IN_SERVICE')).toBe('started');
    expect(todayVisitPhase('COMPLETED')).toBe('completed');
    expect(todayVisitBg('upcoming')).toBe(VISIT_TILE_TEAL);
    expect(todayVisitBg('started')).toBe(VISIT_TILE_GOLD);
    expect(todayVisitBg('completed')).toBe(VISIT_TILE_NAVY);
  });
});
