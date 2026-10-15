import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanCode,
  emailBucket,
  emailCodeKey,
  emailCodeMatches,
  generateEmailCode,
  hashEmailCode,
  isRetryableTxError,
  maskEmail,
  signupEmailVerifyOn
} from '../backend/src/emailCode';
import { canStillSignIn } from '../backend/src/emailRelease';
import { codeMail, emailChangedMail, signupNoticeMail, DEFAULT_EMAIL_FROM } from '../backend/src/mail';
import { suppressionFor, verifySvixSignature } from '../backend/src/resendWebhook';

const KEY = 'k'.repeat(32);

describe('T4 email codes', () => {
  afterEach(() => {
    delete process.env.EMAIL_CODE_KEY;
    delete process.env.EMAIL_HASH_KEY;
  });

  it('generates zero-padded 6-digit codes', () => {
    expect(generateEmailCode(() => 42)).toBe('000042');
    expect(generateEmailCode(() => 999_999)).toBe('999999');
    for (let i = 0; i < 50; i++) expect(generateEmailCode()).toMatch(/^\d{6}$/);
  });

  it('binds the hash to subject, purpose and address (a signup code cannot change an email)', () => {
    const base = hashEmailCode(KEY, 'pending:p1', 'signup_verify', 'a@x.com', '123456');
    expect(emailCodeMatches(base, hashEmailCode(KEY, 'pending:p1', 'signup_verify', 'a@x.com', '123456'))).toBe(true);
    expect(emailCodeMatches(base, hashEmailCode(KEY, 'pending:p1', 'email_change', 'a@x.com', '123456'))).toBe(false);
    expect(emailCodeMatches(base, hashEmailCode(KEY, 'pending:p2', 'signup_verify', 'a@x.com', '123456'))).toBe(false);
    expect(emailCodeMatches(base, hashEmailCode(KEY, 'pending:p1', 'signup_verify', 'b@x.com', '123456'))).toBe(false);
    expect(emailCodeMatches(base, hashEmailCode(KEY, 'pending:p1', 'signup_verify', 'a@x.com', '123457'))).toBe(false);
    expect(emailCodeMatches(base, '')).toBe(false);
  });

  it('fails closed (503) without EMAIL_CODE_KEY or with a short one', () => {
    expect(() => emailCodeKey()).toThrow(expect.objectContaining({ status: 503, code: 'EMAIL_UNAVAILABLE' }));
    process.env.EMAIL_CODE_KEY = 'short';
    expect(() => emailCodeKey()).toThrow(expect.objectContaining({ status: 503 }));
    process.env.EMAIL_CODE_KEY = KEY;
    expect(emailCodeKey()).toBe(KEY);
  });

  it('rate-limit buckets never contain the address; keyed when EMAIL_HASH_KEY is set', () => {
    const plain = emailBucket('guest@cutly.buzz');
    expect(plain).not.toContain('guest');
    process.env.EMAIL_HASH_KEY = KEY;
    expect(emailBucket('guest@cutly.buzz')).toBe(createHmac('sha256', KEY).update('guest@cutly.buzz').digest('hex').slice(0, 32));
  });

  it('masks addresses and cleans pasted codes', () => {
    expect(maskEmail('prajesh@gmail.com')).toBe('p***@gmail.com');
    expect(maskEmail('bad')).toBe('***');
    expect(cleanCode(' 123 456 ')).toBe('123456');
    expect(cleanCode('123-456')).toBe('123456');
    expect(cleanCode('12345')).toBeNull();
    expect(cleanCode('12345a')).toBeNull();
  });

  it('SIGNUP_EMAIL_VERIFY defaults on; "off" restores one-step signup', () => {
    expect(signupEmailVerifyOn({})).toBe(true);
    expect(signupEmailVerifyOn({ SIGNUP_EMAIL_VERIFY: 'OFF' })).toBe(false);
  });

  it('retries only deadlocks / serialization failures', () => {
    expect(isRetryableTxError({ code: 'P2034' })).toBe(true);
    expect(isRetryableTxError(new Error('ERROR: deadlock detected (40P01)'))).toBe(true);
    expect(isRetryableTxError(new Error('nope'))).toBe(false);
  });
});

describe('T4 release guard (DBA final (a))', () => {
  it('releases only when the holder can still sign in', () => {
    expect(canStillSignIn({ phone: '+919000000001', googleSub: null, passwordHash: 'h' })).toBe(true);
    expect(canStillSignIn({ phone: null, googleSub: 'g', passwordHash: 'h' })).toBe(true);
    expect(canStillSignIn({ phone: null, googleSub: null, passwordHash: null })).toBe(true);
    expect(canStillSignIn({ phone: null, googleSub: null, passwordHash: 'h' })).toBe(false);
  });
});

describe('T4 mail', () => {
  it('From is exactly no-reply@notify.cutly.buzz (strict DMARC alignment)', () => {
    expect(DEFAULT_EMAIL_FROM).toBe('CutLy <no-reply@notify.cutly.buzz>');
  });

  it('code mail has text + html with the code; notice/changed mails carry no code', () => {
    const m = codeMail('a@x.com', '012345', 'signup_verify');
    expect(m.text).toContain('012345');
    expect(m.html).toContain('012345');
    expect(m.subject).toContain('012345');
    expect(signupNoticeMail('a@x.com').text).not.toMatch(/\d{6}/);
    expect(emailChangedMail('a@x.com', 'n***@y.com').text).toContain('n***@y.com');
  });
});

describe('T4 Resend webhook', () => {
  const secretBytes = Buffer.from('super-secret-webhook-key-bytes!!');
  const secret = `whsec_${secretBytes.toString('base64')}`;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64')}`;

  it('accepts a valid Svix signature and rejects tampering, staleness and missing headers', () => {
    const now = 1_760_000_000;
    const body = '{"type":"email.bounced"}';
    const sig = sign('msg_1', String(now), body);
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature: `v1,bogus ${sig}` }, body, now)).toBe(true);
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body + ' ', now)).toBe(false);
    expect(verifySvixSignature(secret, { id: 'msg_2', timestamp: String(now), signature: sig }, body, now)).toBe(false);
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now + 301)).toBe(false);
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now) }, body, now)).toBe(false);
    expect(verifySvixSignature('', { id: 'msg_1', timestamp: String(now), signature: sig }, body, now)).toBe(false);
  });

  it('stores hard bounces and complaints only', () => {
    expect(suppressionFor({ type: 'email.bounced', data: { to: ['A@X.com'], bounce: { type: 'Permanent' } } })).toEqual({
      emails: ['a@x.com'],
      reason: 'hard_bounce'
    });
    expect(suppressionFor({ type: 'email.bounced', data: { to: ['a@x.com'], bounce: { type: 'Transient' } } })).toBeNull();
    expect(suppressionFor({ type: 'email.complained', data: { to: 'a@x.com' } })).toEqual({ emails: ['a@x.com'], reason: 'complaint' });
    expect(suppressionFor({ type: 'email.delivered', data: { to: ['a@x.com'] } })).toBeNull();
  });
});
