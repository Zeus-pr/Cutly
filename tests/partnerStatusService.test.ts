import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

/** In-memory stand-in for the Prisma tables updatePartnerBookingStatus / PIN start touch. */
const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const store = {
    partner: [] as Row[],
    shop: [] as Row[],
    booking: [] as Row[],
    bookingPayment: [] as Row[],
    failPaymentWrite: false,
    /** Runs right after a booking is read, to simulate a concurrent writer. */
    afterBookingRead: null as null | (() => void)
  };
  const clone = <T>(v: T): T => structuredClone(v);
  const match = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  const withIncludes = (s: typeof store, b: Row) => ({
    ...clone(b),
    user: { name: 'Asha', phone: null },
    barber: { id: 'barber1', name: 'Ravi' },
    services: [{ serviceId: 'svc1', service: { name: 'Haircut' } }],
    payment: clone(s.bookingPayment.find((p) => p.bookingId === b.id) || null)
  });
  function client(s: typeof store) {
    return {
      partner: { findUnique: async ({ where }: any) => clone(s.partner.find((r) => match(r, where)) || null) },
      shop: { findUnique: async ({ where }: any) => clone(s.shop.find((r) => match(r, where)) || null) },
      booking: {
        findFirst: async ({ where }: any) => {
          const b = s.booking.find((r) => match(r, where));
          const out = b ? withIncludes(s, b) : null;
          const hook = store.afterBookingRead;
          store.afterBookingRead = null;
          hook?.();
          return out;
        },
        findMany: async () => [],
        findUniqueOrThrow: async ({ where }: any) => {
          const b = s.booking.find((r) => r.id === where.id);
          if (!b) throw new Error('not found');
          return withIncludes(s, b);
        },
        updateMany: async ({ where, data }: any) => {
          const rows = s.booking.filter((r) => match(r, where));
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        }
      },
      bookingPayment: {
        update: async ({ where, data }: any) => {
          if (store.failPaymentWrite) throw new Error('payment write failed');
          const p = s.bookingPayment.find((r) => r.bookingId === where.bookingId)!;
          Object.assign(p, data);
          return clone(p);
        },
        create: async ({ data }: any) => {
          if (store.failPaymentWrite) throw new Error('payment write failed');
          s.bookingPayment.push(clone(data));
          return clone(data);
        }
      }
    };
  }
  class FakePrismaClient {
    [k: string]: any;
    constructor() {
      Object.assign(this, client(store));
    }
    async $transaction(fn: (tx: any) => Promise<any>) {
      const draft = { ...store, partner: clone(store.partner), shop: clone(store.shop), booking: clone(store.booking), bookingPayment: clone(store.bookingPayment) };
      const out = await fn(client(draft as typeof store)); // throw => draft dropped (rollback)
      store.booking = draft.booking;
      store.bookingPayment = draft.bookingPayment;
      return out;
    }
  }
  return { store, FakePrismaClient };
});

vi.mock('@prisma/client', async (orig) => ({ ...(await orig<typeof import('@prisma/client')>()), PrismaClient: db.FakePrismaClient }));
vi.mock('../backend/src/waitingNotify', () => ({ notifyWaitingStarted: async () => {} }));
vi.mock('../backend/src/push', () => ({ notifyUser: async () => {} }));

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256';
const { updatePartnerBookingStatus, startBookingWithVerifyPin } = await import('../backend/src/partner');
const { toClientError } = await import('../backend/src/httpError');

const token = jwt.sign({ sub: 'p1', aud: 'partner' }, process.env.JWT_SECRET!, { algorithm: 'HS256' });
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

function seed(status: string, opts: { startsAt?: Date; advancePaise?: number; payment?: boolean } = {}) {
  const startsAt = opts.startsAt ?? minutesAgo(30);
  db.store.partner = [{ id: 'p1', email: 'p@x.in', phone: null, name: 'P' }];
  db.store.shop = [{ id: 's1', ownerPartnerId: 'p1', setupDone: true, name: 'Shop' }];
  db.store.booking = [
    {
      id: 'b1', shopId: 's1', userId: 'u1', status, startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      totalPaise: 50_000, advancePaise: opts.advancePaise ?? 10_000, bookingCode: 'CUT1', verifyPin: '1234'
    }
  ];
  db.store.bookingPayment = opts.payment === false ? [] : [
    { bookingId: 'b1', provider: 'razorpay', amountPaise: 10_000, status: 'CAPTURED', shopSettledAt: null }
  ];
  db.store.failPaymentWrite = false;
  db.store.afterBookingRead = null;
}
const statusOf = async (p: Promise<unknown>) => p.then(() => 200, (e) => toClientError(e).status);
const current = () => db.store.booking[0].status;

beforeEach(() => seed('CONFIRMED'));

describe('updatePartnerBookingStatus (service level)', () => {
  it('IN_SERVICE -> COMPLETED settles remaining balance with the status', async () => {
    seed('IN_SERVICE');
    const out = await updatePartnerBookingStatus(token, 'b1', 'COMPLETED');
    expect(out.status).toBe('COMPLETED');
    expect(db.store.bookingPayment[0]).toMatchObject({ amountPaise: 50_000, provider: 'mixed' });
    expect(db.store.bookingPayment[0].shopSettledAt).toBeInstanceOf(Date);
  });

  it('rolls back COMPLETED when balance collection fails', async () => {
    seed('IN_SERVICE');
    db.store.failPaymentWrite = true;
    await expect(updatePartnerBookingStatus(token, 'b1', 'COMPLETED')).rejects.toThrow();
    expect(current()).toBe('IN_SERVICE');
    expect(db.store.bookingPayment[0].amountPaise).toBe(10_000);
    // retry after the fault clears succeeds (not a stuck 409)
    db.store.failPaymentWrite = false;
    await updatePartnerBookingStatus(token, 'b1', 'COMPLETED');
    expect(current()).toBe('COMPLETED');
  });

  it('CONFIRMED -> NO_SHOW after grace', async () => {
    await updatePartnerBookingStatus(token, 'b1', 'NO_SHOW');
    expect(current()).toBe('NO_SHOW');
  });

  it('wrong state returns 409 even before the no-show grace window', async () => {
    seed('IN_SERVICE', { startsAt: minutesAgo(1) });
    expect(await statusOf(updatePartnerBookingStatus(token, 'b1', 'NO_SHOW'))).toBe(409);
    seed('CONFIRMED');
    expect(await statusOf(updatePartnerBookingStatus(token, 'b1', 'COMPLETED'))).toBe(409);
  });

  it('valid no-show before grace still gets the grace message (400)', async () => {
    seed('CONFIRMED', { startsAt: minutesAgo(1) });
    expect(await statusOf(updatePartnerBookingStatus(token, 'b1', 'NO_SHOW'))).toBe(400);
  });

  it('unsupported targets are 400, never 500', async () => {
    for (const bad of ['REFUNDED', 'AVAILABLE', 'IN_SERVICE', 'ARRIVED']) {
      expect(await statusOf(updatePartnerBookingStatus(token, 'b1', bad as never))).toBe(400);
    }
    expect(current()).toBe('CONFIRMED');
  });

  it('409 when the booking changes between read and write', async () => {
    db.store.afterBookingRead = () => (db.store.booking[0].status = 'EXPIRED');
    expect(await statusOf(updatePartnerBookingStatus(token, 'b1', 'NO_SHOW'))).toBe(409);
    expect(current()).toBe('EXPIRED');
  });
});

describe('startBookingWithVerifyPin', () => {
  it('CONFIRMED -> IN_SERVICE with the right PIN', async () => {
    const out = await startBookingWithVerifyPin(token, 'b1', '1234');
    expect(out.status).toBe('IN_SERVICE');
  });

  it('cannot overwrite a NO_SHOW committed after the PIN start read CONFIRMED (409)', async () => {
    db.store.afterBookingRead = () => (db.store.booking[0].status = 'NO_SHOW');
    expect(await statusOf(startBookingWithVerifyPin(token, 'b1', '1234'))).toBe(409);
    expect(current()).toBe('NO_SHOW');
  });

  it('no-show after a PIN start is rejected (409)', async () => {
    await startBookingWithVerifyPin(token, 'b1', '1234');
    expect(await statusOf(updatePartnerBookingStatus(token, 'b1', 'NO_SHOW'))).toBe(409);
    expect(current()).toBe('IN_SERVICE');
  });
});
