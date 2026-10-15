/**
 * T4 (#9) email verification against a real Postgres. Skipped unless T3_TEST_DATABASE_URL
 * points at a throwaway database (never shared or production).
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TransactionalMail } from '../backend/src/mail';

const DB_URL = process.env.T3_TEST_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite('T4 #9 email verification (database)', () => {
  let base = '';
  let server: Server;
  let prisma: import('@prisma/client').PrismaClient;
  let A: typeof import('../backend/src/auth');
  let E: typeof import('../backend/src/emailAuth');
  let cleanup: typeof import('../backend/src/emailCleanup');
  const tag = `t4${Date.now().toString(36)}`;
  let seq = 0;
  const phone = () => `+9191${String(Date.now() + ++seq).slice(-8)}`;
  const addr = (n: string) => `${tag}-${n}-${++seq}@example.com`;
  let clock = new Date();
  const outbox: TransactionalMail[] = [];
  const deps = () => ({ send: async (m: TransactionalMail) => (outbox.push(m), { sent: true }), now: () => clock });
  const lastCode = (to: string) => {
    const m = [...outbox].reverse().find((x) => x.to === to);
    return m?.text.match(/^(\d{6}) is your CutLy code/)?.[1] ?? null;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    process.env.JWT_SECRET = 'test-jwt-secret-for-t4';
    process.env.PHONE_HASH_KEY = 'test-phone-hash-key-0123456789';
    process.env.EMAIL_CODE_KEY = 'test-email-code-key-0123456789abcdef';
    process.env.SIGNUP_EMAIL_VERIFY = 'on'; // default is off (PR Review #58)
    process.env.EMAIL_HASH_KEY = 'test-email-hash-key-0123456789abcdef';
    process.env.EMAIL_TRANSPORT = 'log';
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
    A = await import('../backend/src/auth');
    E = await import('../backend/src/emailAuth');
    cleanup = await import('../backend/src/emailCleanup');
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
  const tokenFor = (u: { id: string; email: string | null; phone: string | null; tokenVersion: number }) =>
    A.signToken({ id: u.id, email: u.email, phone: u.phone, name: null }, 'customer', u.tokenVersion);
  const squatter = async (email: string, data: Record<string, unknown> = {}) =>
    prisma.user.create({ data: { email, phone: phone(), passwordHash: await bcrypt.hash('squatpass1', 4), ...data } });

  it('two-step signup: no User until the code is proved; then a verified session', async () => {
    clock = new Date();
    const email = addr('happy');
    const start = await E.startEmailSignup({ email: email.toUpperCase(), password: 'password123', phone: phone(), name: 'Happy' }, deps());
    expect(start).toMatchObject({ resendInSec: 60, expiresInSec: 600 });
    expect(start.maskedEmail).toMatch(/^t\*\*\*@example\.com$/);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    const code = lastCode(email)!;
    expect(code).toMatch(/^\d{6}$/);
    const row = await prisma.emailCode.findFirstOrThrow({ where: { pendingSignupId: start.pendingId } });
    expect(row.codeHmac).not.toContain(code);
    const s = await E.verifyEmailSignup(start.pendingId, code, deps());
    expect(s.user).toMatchObject({ email, emailVerified: true, hasPassword: true });
    expect(s.token).toBeTruthy();
    expect(await prisma.pendingSignup.count({ where: { id: start.pendingId } })).toBe(0);
    // single use
    await expect(E.verifyEmailSignup(start.pendingId, code, deps())).rejects.toMatchObject({ status: 410 });
  });

  it('5 wrong codes: 401 CODE_INVALID counting down, then 410 CODE_EXPIRED even for the right code', async () => {
    clock = new Date();
    const email = addr('brute');
    const start = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const code = lastCode(email)!;
    const wrong = code === '000000' ? '111111' : '000000';
    const left: number[] = [];
    for (let i = 0; i < 4; i++) {
      const err = await E.verifyEmailSignup(start.pendingId, wrong, deps()).catch((e) => e);
      expect(err).toMatchObject({ status: 401, code: 'CODE_INVALID' });
      left.push(err.details.attemptsRemaining);
    }
    expect(left).toEqual([4, 3, 2, 1]);
    await expect(E.verifyEmailSignup(start.pendingId, wrong, deps())).rejects.toMatchObject({ status: 410, code: 'CODE_EXPIRED' });
    await expect(E.verifyEmailSignup(start.pendingId, code, deps())).rejects.toMatchObject({ status: 410 });
  });

  it('parallel guesses cannot exceed 5 attempts', async () => {
    clock = new Date();
    const email = addr('parallel');
    const start = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const code = lastCode(email)!;
    const wrong = code === '222222' ? '333333' : '222222';
    await Promise.allSettled(Array.from({ length: 12 }, () => E.verifyEmailSignup(start.pendingId, wrong, deps())));
    const row = await prisma.emailCode.findFirst({ where: { pendingSignupId: start.pendingId } });
    expect(row === null || row.attempts <= 5).toBe(true);
    await expect(E.verifyEmailSignup(start.pendingId, code, deps())).rejects.toMatchObject({ status: 410 });
  });

  it('expiry boundary: 10 min − 1 s works, 10 min + 1 s is 410', async () => {
    const t0 = new Date();
    clock = t0;
    const email = addr('expiry');
    const a = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const codeA = lastCode(email)!;
    clock = new Date(t0.getTime() + 601_000);
    await expect(E.verifyEmailSignup(a.pendingId, codeA, deps())).rejects.toMatchObject({ status: 410, code: 'CODE_EXPIRED' });
    clock = t0;
    const email2 = addr('expiry2');
    const b = await E.startEmailSignup({ email: email2, password: 'password123', phone: phone() }, deps());
    clock = new Date(t0.getTime() + 599_000);
    await expect(E.verifyEmailSignup(b.pendingId, lastCode(email2)!, deps())).resolves.toMatchObject({ user: { email: email2 } });
  });

  it('resend: 60 s cooldown (429 + retryAfterSec), then a new code that invalidates the old one', async () => {
    const t0 = new Date();
    clock = t0;
    const email = addr('resend');
    const start = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const first = lastCode(email)!;
    await expect(E.resendEmailSignup(start.pendingId, deps())).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    clock = new Date(t0.getTime() + 61_000);
    await E.resendEmailSignup(start.pendingId, deps());
    const second = lastCode(email)!;
    if (first !== second) {
      await expect(E.verifyEmailSignup(start.pendingId, first, deps())).rejects.toMatchObject({ status: 401 });
    }
    await expect(E.verifyEmailSignup(start.pendingId, second, deps())).resolves.toMatchObject({ user: { emailVerified: true } });
  });

  it('pending signup expires after 30 min → 410 SIGNUP_EXPIRED on resend', async () => {
    const t0 = new Date();
    clock = t0;
    const start = await E.startEmailSignup({ email: addr('pend'), password: 'password123', phone: phone() }, deps());
    clock = new Date(t0.getTime() + 31 * 60_000);
    await expect(E.resendEmailSignup(start.pendingId, deps())).rejects.toMatchObject({ status: 410, code: 'SIGNUP_EXPIRED' });
  });

  it('no enumeration: a verified owner gets a notice (no code) and the API answers the same', async () => {
    clock = new Date();
    const email = addr('owner');
    await prisma.user.create({ data: { email, emailVerified: true, phone: phone() } });
    const fresh = addr('free');
    const a = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const b = await E.startEmailSignup({ email: fresh, password: 'password123', phone: phone() }, deps());
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect({ ...a, pendingId: 'x', maskedEmail: 'x' }).toEqual({ ...b, pendingId: 'x', maskedEmail: 'x' });
    const notice = [...outbox].reverse().find((m) => m.to === email)!;
    expect(notice.tag).toBe('signup_notice');
    expect(notice.text).not.toMatch(/\d{6}/);
    const errA = await E.verifyEmailSignup(a.pendingId, '123456', deps()).catch((e) => e);
    const errB = await E.verifyEmailSignup(b.pendingId, lastCode(fresh) === '123456' ? '654321' : '123456', deps()).catch((e) => e);
    expect([errA.status, errA.code]).toEqual([errB.status, errB.code]);
  });

  it('HTTP: POST /auth/signup → 202 {pendingId, maskedEmail, resendInSec, expiresInSec}', async () => {
    const r = await call('POST', '/api/auth/signup', { body: { email: addr('http'), password: 'password123', phone: phone() } });
    expect(r.status).toBe(202);
    expect(Object.keys(r.body.data).sort()).toEqual(['expiresInSec', 'maskedEmail', 'pendingId', 'resendInSec']);
    const bad = await call('POST', '/api/auth/signup/verify', { body: { pendingId: r.body.data.pendingId, code: '12345' } });
    expect(bad.status).toBe(400);
  });

  it('pending-deletion holder: signup → 409 ACCOUNT_PENDING_DELETION; never released', async () => {
    const email = addr('pdel');
    const row = await squatter(email, { deletionRequestedAt: new Date() });
    await expect(E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps())).rejects.toMatchObject({
      code: 'ACCOUNT_PENDING_DELETION'
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: row.id } })).email).toBe(email);
  });

  it('§3 signup: a verified signup releases an unverified PASSWORD squatter (keeps phone/password, gets notice)', async () => {
    clock = new Date();
    const email = addr('squat');
    const sq = await squatter(email);
    const start = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const s = await E.verifyEmailSignup(start.pendingId, lastCode(email)!, deps());
    const after = await prisma.user.findUniqueOrThrow({ where: { id: sq.id } });
    expect(after).toMatchObject({ email: null, emailVerified: false, phone: sq.phone, passwordHash: sq.passwordHash, tokenVersion: sq.tokenVersion });
    const audit = await prisma.emailRelease.findFirstOrThrow({ where: { fromUserId: sq.id } });
    expect(audit).toMatchObject({ toUserId: s.user.id, reason: 'signup_verified' });
    expect(audit.emailHmac).not.toContain(tag);
    await new Promise((r) => setTimeout(r, 150));
    expect(await prisma.notification.count({ where: { userId: sq.id, type: 'email_released' } })).toBe(1);
    const me = await call('GET', '/api/auth/me', { token: tokenFor(after) });
    expect(me.body.data).toMatchObject({ email: null, emailVerified: false, emailReleased: true });
  });

  it('PR Review #58 (a): Google on a pre-T4 unverified email → 409 GOOGLE_EMAIL_UNVERIFIED_OWNER; account and email untouched', async () => {
    const email = addr('gsq');
    // The real owner: an old password + phone account that never verified its email.
    const owner = await squatter(email);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const sub = `sub-${tag}-${++seq}`;
    await expect(A.finishGoogleSignIn(sub, email, 'Owner')).rejects.toMatchObject({
      status: 409,
      code: 'GOOGLE_EMAIL_UNVERIFIED_OWNER',
      message: expect.stringMatching(/phone number or password.*verify the email or link Google from Profile/)
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after).toEqual(before); // no field changed (email, emailVerified, googleSub, updatedAt)
    expect(await prisma.user.count({ where: { googleSub: sub } })).toBe(0); // no split account
    expect(await prisma.emailRelease.count({ where: { fromUserId: owner.id } })).toBe(0);
  });

  it('PR Review #58 (a): an existing Google profile without email does not take it from an unverified holder', async () => {
    const email = addr('gsq2');
    const owner = await squatter(email);
    const sub = `sub-${tag}-${++seq}`;
    const g = await prisma.user.create({ data: { googleSub: sub } });
    await expect(A.finishGoogleSignIn(sub, email, 'G')).rejects.toMatchObject({ code: 'GOOGLE_EMAIL_UNVERIFIED_OWNER' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email).toBe(email);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: g.id } })).email).toBeNull();
  });

  it('Sec #58 item 3: linking Google while signed in refuses an unverified holder (same code) and leaves it untouched', async () => {
    const email = addr('merge');
    const owner = await squatter(email);
    const me = await prisma.user.create({ data: { phone: phone() } });
    await expect(A.linkGoogleToSignedIn(`sub-${tag}-${++seq}`, email, 'G', tokenFor(me))).rejects.toMatchObject({
      code: 'GOOGLE_EMAIL_UNVERIFIED_OWNER'
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email).toBe(email);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).googleSub).toBeNull();
  });

  it('Sec #58 item 3: linking Google while signed in runs the release step (other pendings/codes for the address go)', async () => {
    clock = new Date();
    const email = addr('merge2');
    const pend = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const me = await prisma.user.create({ data: { phone: phone() } });
    const s = await A.linkGoogleToSignedIn(`sub-${tag}-${++seq}`, email, 'G', tokenFor(me));
    expect(s.user).toMatchObject({ id: me.id, email, emailVerified: true, googleLinked: true });
    expect(await prisma.pendingSignup.count({ where: { id: pend.pendingId } })).toBe(0);
    expect(await prisma.emailCode.count({ where: { pendingSignupId: pend.pendingId } })).toBe(0);
  });

  it('Sec #58 item 1: verifying one pending signup clears the others for that address (no User holder)', async () => {
    clock = new Date();
    const email = addr('multi');
    const p1 = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const p2 = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const p3 = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    await E.verifyEmailSignup(p3.pendingId, lastCode(email)!, deps());
    expect(await prisma.pendingSignup.count({ where: { id: { in: [p1.pendingId, p2.pendingId, p3.pendingId] } } })).toBe(0);
    expect(await prisma.emailCode.count({ where: { emailNorm: email } })).toBe(0);
  });

  it('PR Review #58 minors: phone taken while the code was out → 409 PHONE_TAKEN, and the code is NOT used up', async () => {
    clock = new Date();
    const email = addr('ph');
    const ph = phone();
    const start = await E.startEmailSignup({ email, password: 'password123', phone: ph }, deps());
    const code = lastCode(email)!;
    const taker = await prisma.user.create({ data: { phone: ph } });
    await expect(E.verifyEmailSignup(start.pendingId, code, deps())).rejects.toMatchObject({ status: 409, code: 'PHONE_TAKEN' });
    expect(await prisma.emailCode.count({ where: { pendingSignupId: start.pendingId } })).toBe(1);
    // Once the clash is gone the same code still works (no new code needed).
    await prisma.user.delete({ where: { id: taker.id } });
    const s = await E.verifyEmailSignup(start.pendingId, code, deps());
    expect(s.user).toMatchObject({ email, phone: ph, emailVerified: true });
  });

  it('DBA #58 item 5: EmailCode CHECK needs exactly one of userId / pendingSignupId', async () => {
    const base = { emailNorm: addr('chk'), codeHmac: 'x', purpose: 'verify_existing', expiresAt: new Date(Date.now() + 60_000) };
    await expect(prisma.emailCode.create({ data: base })).rejects.toThrow();
    const u = await prisma.user.create({ data: { phone: phone() } });
    const p = await prisma.pendingSignup.create({
      data: { emailNorm: base.emailNorm, phone: phone(), passwordHash: 'x', expiresAt: new Date(Date.now() + 60_000) }
    });
    await expect(prisma.emailCode.create({ data: { ...base, userId: u.id, pendingSignupId: p.id } })).rejects.toThrow();
    await expect(prisma.emailCode.create({ data: { ...base, userId: u.id } })).resolves.toBeTruthy();
  });

  it('DBA #58 item 8: a repeat hard bounce refreshes the suppression window', async () => {
    const { recordResendEvent } = await import('../backend/src/resendWebhook');
    const { emailHmac } = await import('../backend/src/emailCode');
    const email = addr('bounce');
    await recordResendEvent({ type: 'email.bounced', data: { to: email, bounce: { type: 'Permanent' } } });
    const old = new Date(Date.now() - 400 * 86_400_000);
    await prisma.emailSuppression.update({ where: { emailHmac: emailHmac(email) }, data: { createdAt: old } });
    await recordResendEvent({ type: 'email.complained', data: { to: email } });
    const row = await prisma.emailSuppression.findUniqueOrThrow({ where: { emailHmac: emailHmac(email) } });
    expect(row.createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(row.reason).toBe('complaint');
  });

  it('Sec #58 item 2: /email/verify/send uses the per-address bucket', async () => {
    const email = addr('bucket');
    const u = await prisma.user.create({ data: { email, phone: phone() } });
    const { rateLimit } = await import('../backend/src/rateLimit');
    const { emailBucket } = await import('../backend/src/emailCode');
    for (let i = 0; i < 5; i++) await rateLimit(`email-send-h:${emailBucket(email)}`, 5, 60 * 60_000);
    const r = await call('POST', '/api/auth/email/verify/send', { token: tokenFor(u) });
    expect(r.status).toBe(429);
  });

  it('manual review: an unverified password holder with no phone and no Google is NOT released (409 EMAIL_CLAIM_REVIEW)', async () => {
    clock = new Date();
    const email = addr('review');
    const sq = await prisma.user.create({ data: { email, passwordHash: 'x' } });
    const start = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    await expect(E.verifyEmailSignup(start.pendingId, lastCode(email)!, deps())).rejects.toMatchObject({ status: 409, code: 'EMAIL_CLAIM_REVIEW' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: sq.id } })).email).toBe(email);
  });

  it('race: two signers verify the same address at once → exactly one account', async () => {
    clock = new Date();
    const email = addr('race');
    const a = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const codeA = lastCode(email)!;
    const b = await E.startEmailSignup({ email, password: 'password123', phone: phone() }, deps());
    const codeB = lastCode(email)!;
    const results = await Promise.allSettled([E.verifyEmailSignup(a.pendingId, codeA, deps()), E.verifyEmailSignup(b.pendingId, codeB, deps())]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect([409, 410]).toContain(lost.reason.status);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('verify existing (P7 nudge): code to the account email marks it verified', async () => {
    clock = new Date();
    const email = addr('legacy');
    const u = await squatter(email);
    const token = tokenFor(u);
    await E.sendVerifyExisting(token, deps());
    await expect(E.confirmVerifyExisting(token, lastCode(email)!, deps())).resolves.toMatchObject({ user: { emailVerified: true } });
    await expect(E.sendVerifyExisting(token, deps())).rejects.toMatchObject({ code: 'ALREADY_VERIFIED' });
  });

  it('email change: needs a change_email grant (a delete grant is refused), code goes to the NEW address, old verified address is told', async () => {
    clock = new Date();
    const oldEmail = addr('old');
    const newEmail = addr('new');
    const u = await squatter(oldEmail, { emailVerified: true });
    const token = tokenFor(u);
    const { issueReauthToken } = await import('../backend/src/reauth');
    const del = await issueReauthToken(prisma, 'test-jwt-secret-for-t4', u.id, 'customer');
    await expect(E.requestEmailChange(token, del.reauthToken, newEmail, deps())).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    await expect(E.requestEmailChange(token, undefined, newEmail, deps())).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' });
    const grant = await issueReauthToken(prisma, 'test-jwt-secret-for-t4', u.id, 'customer', new Date(), 'change_email');
    const sent = await E.requestEmailChange(token, grant.reauthToken, newEmail, deps());
    expect(sent.maskedEmail).toMatch(/@example\.com$/);
    expect(lastCode(oldEmail)).toBeNull();
    // the delete endpoint can't use a change_email grant
    const grant2 = await issueReauthToken(prisma, 'test-jwt-secret-for-t4', u.id, 'customer', new Date(), 'change_email');
    const delTry = await call('DELETE', '/api/auth/account', { token, reauth: grant2.reauthToken });
    expect(delTry.body.code).toBe('REAUTH_REQUIRED');
    const done = await E.confirmEmailChange(token, lastCode(newEmail)!, deps());
    expect(done).toMatchObject({ user: { email: newEmail, emailVerified: true }, notifiedOldAddress: true });
    expect([...outbox].reverse().find((m) => m.to === oldEmail)?.tag).toBe('email_changed');
  });

  it('email change: a verified holder blocks (409); an unverified holder is released', async () => {
    clock = new Date();
    const u = await squatter(addr('me'), { emailVerified: true });
    const token = tokenFor(u);
    const { issueReauthToken } = await import('../backend/src/reauth');
    const taken = addr('taken');
    await prisma.user.create({ data: { email: taken, emailVerified: true, phone: phone() } });
    const g1 = await issueReauthToken(prisma, 'test-jwt-secret-for-t4', u.id, 'customer', new Date(), 'change_email');
    await expect(E.requestEmailChange(token, g1.reauthToken, taken, deps())).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
    const squat = addr('squat2');
    const sq = await squatter(squat);
    const g2 = await issueReauthToken(prisma, 'test-jwt-secret-for-t4', u.id, 'customer', new Date(), 'change_email');
    await E.requestEmailChange(token, g2.reauthToken, squat, deps());
    await E.confirmEmailChange(token, lastCode(squat)!, deps());
    expect((await prisma.user.findUniqueOrThrow({ where: { id: sq.id } })).email).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(squat);
  });

  it('PATCH /auth/profile with a different email → 400 USE_EMAIL_CHANGE; partner with the same email untouched', async () => {
    const email = addr('patch');
    const u = await squatter(email);
    const r = await call('PATCH', '/api/auth/profile', { token: tokenFor(u), body: { email: addr('other') } });
    expect(r).toMatchObject({ status: 400, body: { code: 'USE_EMAIL_CHANGE' } });
    const partner = await prisma.partner.create({ data: { email, passwordHash: 'x' } });
    await expect(A.finishGoogleSignIn(`sub-${tag}-${++seq}`, email, 'G')).rejects.toMatchObject({ code: 'GOOGLE_EMAIL_UNVERIFIED_OWNER' });
    expect((await prisma.partner.findUniqueOrThrow({ where: { id: partner.id } })).email).toBe(email);
  });

  it('lowercase CHECK rejects a mixed-case email write', async () => {
    await expect(prisma.user.create({ data: { email: `${tag}-Mixed@Example.com` } })).rejects.toThrow();
  });

  it('cleanup job deletes codes/pending signups expired over an hour ago', async () => {
    clock = new Date(Date.now() - 31 * 60_000 - 61 * 60_000); // pending expired 61 min ago
    const old = await E.startEmailSignup({ email: addr('clean'), password: 'password123', phone: phone() }, deps());
    clock = new Date(Date.now() - 50 * 60_000); // expired only 20 min ago → kept
    const fresh = await E.startEmailSignup({ email: addr('keep'), password: 'password123', phone: phone() }, deps());
    clock = new Date();
    const r = await cleanup.runEmailCleanup(new Date());
    expect(r.skipped).toBe(false);
    expect(await prisma.pendingSignup.count({ where: { id: old.pendingId } })).toBe(0);
    expect(await prisma.emailCode.count({ where: { pendingSignupId: old.pendingId } })).toBe(0);
    expect(await prisma.pendingSignup.count({ where: { id: fresh.pendingId } })).toBe(1);
  });
});
