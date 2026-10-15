/**
 * T3 end-to-end against a real Postgres. Skipped unless T3_TEST_DATABASE_URL points at a
 * throwaway database with all migrations applied (`prisma migrate deploy`). Never point it
 * at a shared or production database: it inserts and deletes rows.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL = process.env.T3_TEST_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite('T3 delete account (database)', () => {
  let base = '';
  let server: Server;
  let prisma: import('@prisma/client').PrismaClient;
  let signToken: typeof import('../backend/src/auth').signToken;
  let runAccountPurge: typeof import('../backend/src/accountPurge').runAccountPurge;
  let adminApp: import('express').Express;
  const tag = `t3${Date.now().toString(36)}`;
  const phone = `+9198${String(Date.now()).slice(-8)}`;
  const partnerPhone = `+9197${String(Date.now()).slice(-8)}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    process.env.JWT_SECRET = 'test-jwt-secret-for-t3';
    process.env.PHONE_HASH_KEY = 'test-phone-hash-key-0123456789';
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
    ({ signToken } = await import('../backend/src/auth'));
    ({ runAccountPurge } = await import('../backend/src/accountPurge'));
    const mod = await import('../backend/src/server');
    adminApp = mod.adminApp;
    server = mod.app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await prisma?.$disconnect();
  });

  async function call(method: string, path: string, opts: { token?: string; reauth?: string; body?: unknown } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.reauth ? { 'x-reauth-token': opts.reauth } : {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  async function seedShop(suffix: string, ownerPartnerId?: string) {
    const shop = await prisma.shop.create({
      data: { name: `Shop ${suffix}`, address: 'A', city: 'C', latitude: 1, longitude: 1, setupDone: true, ownerPartnerId }
    });
    const barber = await prisma.barber.create({ data: { shopId: shop.id, name: 'Ravi' } });
    return { shop, barber };
  }

  let n = 0;
  async function seedBooking(userId: string, shopId: string, barberId: string, status: any, startsAt: Date) {
    n += 1;
    return prisma.booking.create({
      data: {
        userId,
        shopId,
        barberId,
        status,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        totalPaise: 50000,
        advancePaise: 10000,
        bookingCode: `${tag}-${n}`,
        idempotencyKey: `${tag}-idem-${n}`
      }
    });
  }

  it('customer: reauth → soft delete → restore → expiry → purge', async () => {
    const user = await prisma.user.create({
      data: { phone, email: `${tag}@example.com`, name: 'Asha Rao', passwordHash: await bcrypt.hash('password123', 4), pushToken: 'ExponentPushToken[x]' }
    });
    const token = signToken({ id: user.id, email: user.email, phone: user.phone, name: user.name }, 'customer', 0);
    const { shop, barber } = await seedShop('c');
    const done = await seedBooking(user.id, shop.id, barber.id, 'COMPLETED', new Date(Date.now() - 2 * 86_400_000));
    await prisma.bookingPayment.create({ data: { bookingId: done.id, provider: 'razorpay', amountPaise: 10000, status: 'CAPTURED' } });
    await prisma.review.create({ data: { userId: user.id, shopId: shop.id, barberId: barber.id, bookingId: done.id, rating: 5, barberRating: 5, text: 'Great' } });
    const upcoming = await seedBooking(user.id, shop.id, barber.id, 'CONFIRMED', new Date(Date.now() + 2 * 86_400_000));
    await prisma.favouriteShop.create({ data: { userId: user.id, shopId: shop.id } });
    await prisma.notification.create({ data: { userId: user.id, type: 't', title: 't', body: 'b' } });

    // No reauth → 401 REAUTH_REQUIRED (old app builds too).
    const noReauth = await call('DELETE', '/api/auth/account', { token });
    expect(noReauth).toMatchObject({ status: 401, body: { code: 'REAUTH_REQUIRED' } });

    const bad = await call('POST', '/api/auth/reauth', { token, body: { password: 'nope' } });
    expect(bad.status).toBe(401);
    const re = await call('POST', '/api/auth/reauth', { token, body: { password: 'password123' } });
    expect(re.status).toBe(200);
    const reauth = re.body.data.reauthToken as string;

    const del = await call('DELETE', '/api/auth/account', { token, reauth });
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ deleted: true, cancelledBookings: 1 });

    // Reused reauth token and old session are dead.
    expect((await call('GET', '/api/auth/me', { token })).status).toBe(401);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ tokenVersion: 1, pushToken: null, deletedAt: null, phone, name: 'Asha Rao' });
    expect(row.deletionRequestedAt).not.toBeNull();

    // History kept; upcoming cancelled (refund marking follows policy).
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: done.id } })).status).toBe('COMPLETED');
    expect(await prisma.bookingPayment.count({ where: { bookingId: done.id } })).toBe(1);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: upcoming.id } })).status).toBe('CANCELLED');
    // Grace: favourites/notifications still there; review shows Former customer.
    expect(await prisma.favouriteShop.count({ where: { userId: user.id } })).toBe(1);
    const reviews = await call('GET', `/api/shops/${shop.id}/reviews`);
    expect(reviews.body.data[0].customerName).toBe('Former customer');

    // Re-signup during grace → 409; sign-in restores.
    const signup = await call('POST', '/api/auth/signup', { body: { email: `${tag}@example.com`, password: 'password123', phone } });
    expect(signup).toMatchObject({ status: 409, body: { code: 'ACCOUNT_PENDING_DELETION' } });
    const login = await call('POST', '/api/auth/login', { body: { email: `${tag}@example.com`, password: 'password123' } });
    expect(login.status).toBe(200);
    expect((await call('GET', '/api/auth/me', { token: login.body.data.token })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletionRequestedAt).toBeNull();

    // Delete again, then jump past the deadline: sign-in fails before purge runs.
    const re2 = await call('POST', '/api/auth/reauth', { token: login.body.data.token, body: { password: 'password123' } });
    expect((await call('DELETE', '/api/auth/account', { token: login.body.data.token, reauth: re2.body.data.reauthToken })).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: new Date(Date.now() - 15 * 86_400_000) } });
    const late = await call('POST', '/api/auth/login', { body: { email: `${tag}@example.com`, password: 'password123' } });
    expect(late.status).toBe(400);

    const first = await runAccountPurge();
    expect(first.skipped).toBe(false);
    expect(first.users).toBeGreaterThanOrEqual(1);
    const purged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(purged).toMatchObject({ name: null, phone: null, email: null, passwordHash: null, googleSub: null, emailVerified: false });
    expect(purged.deletedAt).not.toBeNull();
    expect(await prisma.favouriteShop.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.review.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.bookingPayment.count({ where: { bookingId: done.id } })).toBe(1);
    expect(await prisma.deletedIdentity.count({ where: { reason: 'customer_deleted' } })).toBeGreaterThanOrEqual(1);

    // Idempotent re-run; and the phone can sign up again as a new account.
    const again = await runAccountPurge();
    expect(again.users).toBe(0);
    const fresh = await call('POST', '/api/auth/signup', { body: { email: `${tag}@example.com`, password: 'password123', phone } });
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.user.id).not.toBe(user.id);
  });

  it('customer: visit in progress → 409', async () => {
    const user = await prisma.user.create({ data: { phone: `+9196${String(Date.now()).slice(-8)}`, passwordHash: await bcrypt.hash('password123', 4) } });
    const token = signToken({ id: user.id, email: null, phone: user.phone, name: null }, 'customer', 0);
    const { shop, barber } = await seedShop('v');
    await seedBooking(user.id, shop.id, barber.id, 'IN_SERVICE', new Date());
    const re = await call('POST', '/api/auth/reauth', { token, body: { password: 'password123' } });
    const del = await call('DELETE', '/api/auth/account', { token, reauth: re.body.data.reauthToken });
    expect(del).toMatchObject({ status: 409, body: { code: 'VISIT_IN_PROGRESS' } });
    // The failed delete rolled back: no deletion recorded.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).deletionRequestedAt).toBeNull();
  });

  it('partner: 409 UPCOMING_BOOKINGS, then close → 410 SHOP_CLOSED → restore as PAUSED', async () => {
    const email = `${tag}-p@example.com`;
    const partner = await prisma.partner.create({ data: { email, phone: partnerPhone, passwordHash: await bcrypt.hash('password123', 4) } });
    const token = signToken({ id: partner.id, email, phone: partnerPhone, name: null }, 'partner', 0);
    const { shop, barber } = await seedShop('p', partner.id);
    const customer = await prisma.user.create({ data: { phone: `+9195${String(Date.now()).slice(-8)}` } });
    const booking = await seedBooking(customer.id, shop.id, barber.id, 'CONFIRMED', new Date(Date.now() + 86_400_000));
    await prisma.shop.update({ where: { id: shop.id }, data: { phone: '+919811111111', city: 'Bardhaman' } });
    await prisma.shopImage.create({ data: { shopId: shop.id, url: 'data:image/png;base64,AAAA' } });
    const lead = await prisma.partnerLead.create({ data: { phone: partnerPhone, shopName: 'Shop p' } });
    const past = await seedBooking(customer.id, shop.id, barber.id, 'COMPLETED', new Date(Date.now() - 86_400_000));
    await prisma.review.create({ data: { userId: customer.id, shopId: shop.id, barberId: barber.id, bookingId: past.id, rating: 4, barberRating: 4, text: 'Kept text' } });

    const re = await call('POST', '/api/partner/reauth', { token, body: { password: 'password123' } });
    const blocked = await call('DELETE', '/api/partner/account', { token, reauth: re.body.data.reauthToken });
    expect(blocked).toMatchObject({ status: 409, body: { code: 'UPCOMING_BOOKINGS' } });
    expect(blocked.body.bookings[0]).toMatchObject({ id: booking.id, bookingCode: booking.bookingCode });
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe('ACTIVE');

    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } });
    const re2 = await call('POST', '/api/partner/reauth', { token, body: { password: 'password123' } });
    const del = await call('DELETE', '/api/partner/account', { token, reauth: re2.body.data.reauthToken });
    expect(del.status).toBe(200);
    expect(await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).toMatchObject({ status: 'CLOSED', isActive: false, deletedAt: null });
    expect(await prisma.booking.count({ where: { shopId: shop.id } })).toBe(2);
    expect((await call('GET', `/api/shops/${shop.id}`)).body).toMatchObject({ code: 'SHOP_CLOSED' });
    expect((await call('GET', `/api/shops/${shop.id}`)).status).toBe(410);
    expect((await call('GET', '/api/partner/shop', { token })).status).toBe(401);

    const login = await call('POST', '/api/partner/login', { body: { email, password: 'password123' } });
    expect(login.status).toBe(200);
    expect(await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).toMatchObject({ status: 'PAUSED', isActive: false });

    // Past the deadline → purge blanks partner and the shop's public phone, keeps the shop.
    const re3 = await call('POST', '/api/partner/reauth', { token: login.body.data.token, body: { password: 'password123' } });
    expect((await call('DELETE', '/api/partner/account', { token: login.body.data.token, reauth: re3.body.data.reauthToken })).status).toBe(200);
    await prisma.partner.update({ where: { id: partner.id }, data: { deletionRequestedAt: new Date(Date.now() - 15 * 86_400_000) } });
    await runAccountPurge();
    expect(await prisma.partner.findUniqueOrThrow({ where: { id: partner.id } })).toMatchObject({ email: null, phone: null, passwordHash: null });
    const closed = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
    expect(closed).toMatchObject({ status: 'CLOSED', phone: null, name: 'Closed shop', city: 'Bardhaman' });
    expect(closed.deletedAt).not.toBeNull();
    expect(await prisma.shopImage.count({ where: { shopId: shop.id } })).toBe(0);
    expect((await prisma.barber.findUniqueOrThrow({ where: { id: barber.id } })).name).toBe('Former staff');
    expect((await prisma.partnerLead.findUniqueOrThrow({ where: { id: lead.id } })).phone).toBe('');
    // Review text kept, but not listed publicly.
    expect((await prisma.review.findUniqueOrThrow({ where: { bookingId: past.id } })).text).toBe('Kept text');
    expect((await call('GET', `/api/shops/${shop.id}/reviews`)).status).toBe(410);
  });

  it('customer delete ignores stale past bookings (review item 2)', async () => {
    const user = await prisma.user.create({ data: { phone: `+9194${String(Date.now()).slice(-8)}`, passwordHash: await bcrypt.hash('password123', 4) } });
    const token = signToken({ id: user.id, email: null, phone: user.phone, name: null }, 'customer', 0);
    const { shop, barber } = await seedShop('s');
    const weeksAgo = new Date(Date.now() - 21 * 86_400_000);
    const staleVisit = await seedBooking(user.id, shop.id, barber.id, 'ARRIVED', weeksAgo);
    const staleConfirmed = await seedBooking(user.id, shop.id, barber.id, 'CONFIRMED', new Date(weeksAgo.getTime() + 3_600_000));
    const staleHeld = await seedBooking(user.id, shop.id, barber.id, 'HELD', new Date(weeksAgo.getTime() + 7_200_000));
    const future = await seedBooking(user.id, shop.id, barber.id, 'CONFIRMED', new Date(Date.now() + 86_400_000));
    const re = await call('POST', '/api/auth/reauth', { token, body: { password: 'password123' } });
    const del = await call('DELETE', '/api/auth/account', { token, reauth: re.body.data.reauthToken });
    expect(del.status).toBe(200);
    expect(del.body.data.cancelledBookings).toBe(1);
    const status = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(staleVisit.id)).toBe('ARRIVED');
    expect(await status(staleConfirmed.id)).toBe('CONFIRMED');
    expect(await status(staleHeld.id)).toBe('HELD');
    expect(await status(future.id)).toBe('CANCELLED');
  });

  it('a recent in-chair visit still blocks', async () => {
    const user = await prisma.user.create({ data: { phone: `+9193${String(Date.now()).slice(-8)}`, passwordHash: await bcrypt.hash('password123', 4) } });
    const token = signToken({ id: user.id, email: null, phone: user.phone, name: null }, 'customer', 0);
    const { shop, barber } = await seedShop('r');
    await seedBooking(user.id, shop.id, barber.id, 'ARRIVED', new Date(Date.now() - 2 * 3_600_000));
    const re = await call('POST', '/api/auth/reauth', { token, body: { password: 'password123' } });
    expect(await call('DELETE', '/api/auth/account', { token, reauth: re.body.data.reauthToken })).toMatchObject({
      status: 409,
      body: { code: 'VISIT_IN_PROGRESS' }
    });
  });

  it('purge lock: skips while held, and frees itself when the holder rolls back (review item 1)', async () => {
    const { PURGE_LOCK_KEY } = await import('../backend/src/accountPurge');
    let release!: () => void;
    let held!: () => void;
    const isHeld = new Promise<void>((r) => (held = r));
    const holder = prisma
      .$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${PURGE_LOCK_KEY}) AS ok`;
        expect(lock.ok).toBe(true);
        held();
        await new Promise<void>((r) => (release = r));
        throw new Error('simulated timeout / rollback');
      }, { timeout: 20_000 })
      .catch(() => 'rolled back');
    await isHeld;
    expect((await runAccountPurge()).skipped).toBe(true);
    release();
    expect(await holder).toBe('rolled back');
    expect((await runAccountPurge()).skipped).toBe(false);
  }, 15_000);

  it('a lock holder that exceeds its transaction timeout does not leave the lock stuck', async () => {
    const { PURGE_LOCK_KEY } = await import('../backend/src/accountPurge');
    const timedOut = await prisma
      .$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${PURGE_LOCK_KEY}) AS ok`;
        expect(lock.ok).toBe(true);
        expect((await runAccountPurge()).skipped).toBe(true);
        await new Promise((r) => setTimeout(r, 1500));
        await tx.$queryRaw`SELECT 1`;
      }, { timeout: 300 })
      .then(() => 'committed', () => 'timed out');
    expect(timedOut).toBe('timed out');
    expect((await runAccountPurge()).skipped).toBe(false);
  }, 15_000);

  it('partner sign-up during grace → 409 ACCOUNT_PENDING_DELETION (review wording)', async () => {
    const { partnerSignUp } = await import('../backend/src/partner');
    const email = `${tag}-g@example.com`;
    await prisma.partner.create({ data: { email, deletionRequestedAt: new Date() } });
    await expect(partnerSignUp(email, 'password123')).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_PENDING_DELETION' });
  });

  it('adminApp is importable and answers without a listener', async () => {
    const s = adminApp.listen(0, '127.0.0.1');
    await new Promise((r) => s.once('listening', r));
    const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/admin/ping`);
    s.close();
    expect([401, 503]).toContain(res.status);
  });
});
