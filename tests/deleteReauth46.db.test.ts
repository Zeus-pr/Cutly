/**
 * #46 backend gaps for the app's delete/re-auth flow. Real Postgres; skipped unless
 * T3_TEST_DATABASE_URL points at a throwaway database (never shared or production).
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_URL = process.env.T3_TEST_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite('#46 delete re-auth API (database)', () => {
  let base = '';
  let server: Server;
  let prisma: import('@prisma/client').PrismaClient;
  let signToken: typeof import('../backend/src/auth').signToken;
  const tag = `i46${Date.now().toString(36)}`;
  let seq = 0;
  const uniquePhone = () => `+9190${String(Date.now() + ++seq).slice(-8)}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    process.env.JWT_SECRET = 'test-jwt-secret-for-46';
    process.env.PHONE_HASH_KEY = 'test-phone-hash-key-0123456789';
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
    ({ signToken } = await import('../backend/src/auth'));
    const mod = await import('../backend/src/server');
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
    return { status: res.status, headers: res.headers, body: (await res.json()) as any };
  }

  async function customer(data: Record<string, unknown> = {}) {
    const user = await prisma.user.create({ data: { phone: uniquePhone(), passwordHash: await bcrypt.hash('password123', 4), ...data } });
    return { user, token: signToken({ id: user.id, email: user.email, phone: user.phone, name: null }, 'customer', user.tokenVersion) };
  }

  it('wrong password → 401 REAUTH_FAILED with attemptsRemaining counting down; then 429 RATE_LIMITED + Retry-After', async () => {
    const { token } = await customer();
    const left: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/api/auth/reauth', { token, body: { password: 'nope' } });
      expect(r).toMatchObject({ status: 401, body: { code: 'REAUTH_FAILED' } });
      left.push(r.body.attemptsRemaining);
    }
    expect(left).toEqual([4, 3, 2, 1, 0]);
    const limited = await call('POST', '/api/auth/reauth', { token, body: { password: 'password123' } });
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited.body.retryAfterSec).toBeGreaterThan(0);
    expect(Number(limited.headers.get('retry-after'))).toBe(limited.body.retryAfterSec);
    expect(limited.body.error).not.toMatch(/\d{3,}s/);
  });

  it('/auth/me reports hasPassword and authMethods', async () => {
    const { token } = await customer({ googleSub: `g-${tag}` });
    const me = await call('GET', '/api/auth/me', { token });
    expect(me.body.data).toMatchObject({ hasPassword: true, googleLinked: true, authMethods: ['phone', 'password', 'google'] });
    const otpOnly = await prisma.user.create({ data: { phone: uniquePhone() } });
    const t2 = signToken({ id: otpOnly.id, email: null, phone: otpOnly.phone, name: null }, 'customer', 0);
    expect((await call('GET', '/api/auth/me', { token: t2 })).body.data).toMatchObject({ hasPassword: false, authMethods: ['phone'] });
  });

  it('login inside the grace window returns restored: true once; a normal login returns false', async () => {
    const email = `${tag}-r@example.com`;
    await customer({ email, deletionRequestedAt: new Date(Date.now() - 86_400_000) });
    const first = await call('POST', '/api/auth/login', { body: { email, password: 'password123' } });
    expect(first.status).toBe(200);
    expect(first.body.data.restored).toBe(true);
    const second = await call('POST', '/api/auth/login', { body: { email, password: 'password123' } });
    expect(second.body.data.restored).toBe(false);
  });

  it('partner login inside grace returns restored: true and the shop PAUSED', async () => {
    const email = `${tag}-pr@example.com`;
    const partner = await prisma.partner.create({
      data: { email, passwordHash: await bcrypt.hash('password123', 4), deletionRequestedAt: new Date(Date.now() - 86_400_000) }
    });
    await prisma.shop.create({ data: { name: 'P3', address: 'a', city: 'c', latitude: 1, longitude: 1, setupDone: true, ownerPartnerId: partner.id, status: 'CLOSED', isActive: false } });
    const r = await call('POST', '/api/partner/login', { body: { email, password: 'password123' } });
    expect(r.status).toBe(200);
    expect(r.body.data.restored).toBe(true);
    expect((await prisma.shop.findUniqueOrThrow({ where: { ownerPartnerId: partner.id } })).status).toBe('PAUSED');
    expect((await call('POST', '/api/partner/login', { body: { email, password: 'password123' } })).body.data.restored).toBe(false);
    // Turning bookings back on reopens the PAUSED shop.
    const t = signToken({ id: partner.id, email, phone: null, name: null }, 'partner', partner.tokenVersion);
    const open = await call('PATCH', '/api/partner/accepting', { token: t, body: { mode: 'open' } });
    expect(open.status).toBe(200);
    expect(open.body.data.status).toBe('ACTIVE');
    expect((await prisma.shop.findUniqueOrThrow({ where: { ownerPartnerId: partner.id } })).isActive).toBe(true);
  });

  it('partner 409 UPCOMING_BOOKINGS rows carry customerName and serviceNames', async () => {
    const email = `${tag}-p409@example.com`;
    const partner = await prisma.partner.create({ data: { email, passwordHash: await bcrypt.hash('password123', 4) } });
    const token = signToken({ id: partner.id, email, phone: null, name: null }, 'partner', 0);
    const shop = await prisma.shop.create({ data: { name: 'P2', address: 'a', city: 'c', latitude: 1, longitude: 1, setupDone: true, ownerPartnerId: partner.id } });
    const barber = await prisma.barber.create({ data: { shopId: shop.id, name: 'Ravi' } });
    const service = await prisma.service.create({ data: { name: `Haircut ${tag}`, durationMinutes: 30 } });
    const { user } = await customer({ name: 'Asha' });
    const startsAt = new Date(Date.now() + 86_400_000);
    await prisma.booking.create({
      data: {
        userId: user.id, shopId: shop.id, barberId: barber.id, status: 'CONFIRMED', startsAt,
        endsAt: new Date(startsAt.getTime() + 1_800_000), totalPaise: 20000, advancePaise: 0,
        bookingCode: `${tag}-p2`, idempotencyKey: `${tag}-p2`,
        services: { create: [{ serviceId: service.id, pricePaise: 20000, durationMinutes: 30 }] }
      }
    });
    const re = await call('POST', '/api/partner/reauth', { token, body: { password: 'password123' } });
    const r = await call('DELETE', '/api/partner/account', { token, reauth: re.body.data.reauthToken });
    expect(r).toMatchObject({ status: 409, body: { code: 'UPCOMING_BOOKINGS' } });
    expect(r.body.bookings[0]).toMatchObject({ bookingCode: `${tag}-p2`, customerName: 'Asha', serviceNames: [`Haircut ${tag}`], status: 'CONFIRMED' });
  });

  it('DELETE /api/partner/account is rate limited per session (429 RATE_LIMITED)', async () => {
    const email = `${tag}-prl@example.com`;
    const partner = await prisma.partner.create({ data: { email } });
    const token = signToken({ id: partner.id, email, phone: null, name: null }, 'partner', 0);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call('DELETE', '/api/partner/account', { token, reauth: 'bogus' })).status);
    expect(statuses.slice(0, 5)).not.toContain(429);
    const last = await call('DELETE', '/api/partner/account', { token, reauth: 'bogus' });
    expect(last).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } });
  });

  it('re-auth OTP send has its own limit and never takes a phone from the body', async () => {
    const noPhone = await prisma.user.create({ data: { email: `${tag}-np@example.com`, passwordHash: 'x' } });
    const t = signToken({ id: noPhone.id, email: noPhone.email, phone: null, name: null }, 'customer', 0);
    expect(await call('POST', '/api/auth/reauth/otp/send', { token: t, body: { phone: '+919999999999' } })).toMatchObject({
      status: 400, body: { code: 'REAUTH_NO_PHONE' }
    });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await call('POST', '/api/auth/reauth/otp/send', { token: t })).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2); // 5 per session (the first call above counted)
    // Unrelated to the login send bucket: login /otp/send is not exhausted.
    expect((await call('POST', '/api/auth/otp/send', { body: { phone: 'bad' } })).status).toBe(400);
  });
});
