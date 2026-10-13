import { describe, expect, it } from 'vitest';
import type { BookingStatus } from '@prisma/client';
import {
  assertPartnerTransition,
  canPartnerTransition,
  canTransition,
  setBookingStatusIfCurrent
} from '../backend/src/bookingState';
import { AppError, toClientError } from '../backend/src/httpError';

const ALL: BookingStatus[] = [
  'HELD', 'PAYMENT_PENDING', 'AWAITING_SHOP', 'CONFIRMED', 'ARRIVED', 'IN_SERVICE',
  'COMPLETED', 'EXPIRED', 'FAILED', 'CANCELLED', 'REJECTED', 'NO_SHOW'
];
const ALLOWED = new Set(['CONFIRMED>NO_SHOW', 'ARRIVED>NO_SHOW', 'IN_SERVICE>COMPLETED']);

function statusOf(fn: () => unknown) {
  try {
    fn();
    return 200;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return toClientError(e).status;
  }
}

describe('T6 partner floor allowlist', () => {
  it('allows exactly the three partner moves', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(canPartnerTransition(from, to)).toBe(ALLOWED.has(`${from}>${to}`));
      }
    }
  });

  it('returns 400 for targets partners can never set and 409 for wrong current state', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const code = statusOf(() => assertPartnerTransition(from, to));
        if (ALLOWED.has(`${from}>${to}`)) expect(code).toBe(200);
        else if (to === 'NO_SHOW' || to === 'COMPLETED') expect(code).toBe(409);
        else expect(code).toBe(400);
      }
    }
  });

  it('never yields 500 for unknown values like REFUNDED / AVAILABLE', () => {
    for (const bad of ['REFUNDED', 'AVAILABLE', 'IN_SERVICE', 'ARRIVED']) {
      expect(statusOf(() => assertPartnerTransition('CONFIRMED', bad as BookingStatus))).toBe(400);
    }
  });

  it('no longer has CANCELLED -> REFUNDED in the booking state machine', () => {
    expect(canTransition('CANCELLED', 'REFUNDED' as BookingStatus)).toBe(false);
  });
});

describe('setBookingStatusIfCurrent (race guard)', () => {
  function fakeDb(initial: BookingStatus) {
    let status = initial;
    const calls: unknown[] = [];
    return {
      calls,
      get status() {
        return status;
      },
      booking: {
        async updateMany(args: { where: { id: string; status: BookingStatus }; data: { status: BookingStatus } }) {
          calls.push(args);
          if (args.where.id === 'b1' && args.where.status === status) {
            status = args.data.status;
            return { count: 1 };
          }
          return { count: 0 };
        }
      }
    };
  }

  it('updates only when the booking is still in the expected status', async () => {
    const db = fakeDb('IN_SERVICE');
    await setBookingStatusIfCurrent(db, 'b1', 'IN_SERVICE', 'COMPLETED');
    expect(db.status).toBe('COMPLETED');
    expect(db.calls[0]).toEqual({ where: { id: 'b1', status: 'IN_SERVICE' }, data: { status: 'COMPLETED' } });
  });

  it('second of two concurrent requests gets 409 and does not overwrite', async () => {
    const db = fakeDb('CONFIRMED');
    const results = await Promise.allSettled([
      setBookingStatusIfCurrent(db, 'b1', 'CONFIRMED', 'NO_SHOW'),
      setBookingStatusIfCurrent(db, 'b1', 'CONFIRMED', 'NO_SHOW')
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(toClientError(rejected.reason).status).toBe(409);
    expect(db.status).toBe('NO_SHOW');
  });

  it('409 when the expiry job moved the booking first', async () => {
    const db = fakeDb('EXPIRED');
    await expect(setBookingStatusIfCurrent(db, 'b1', 'CONFIRMED', 'NO_SHOW')).rejects.toMatchObject({ status: 409 });
    expect(db.status).toBe('EXPIRED');
  });
});
