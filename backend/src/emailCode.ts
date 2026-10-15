/**
 * T4 (#9): pure helpers for emailed 6-digit codes. No database, no network (unit-tested).
 * Codes are never stored or logged: only HMAC-SHA256(EMAIL_CODE_KEY, subject|purpose|email|code).
 */
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from './httpError';

export type EmailCodePurpose = 'signup_verify' | 'verify_existing' | 'email_change';

export const EMAIL_CODE_TTL_SEC = 10 * 60;
export const PENDING_SIGNUP_TTL_SEC = 30 * 60;
export const EMAIL_RESEND_COOLDOWN_SEC = 60;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export const EMAIL_UNAVAILABLE = () =>
  new AppError("We couldn't send the code. Try again in a minute.", 503, 'EMAIL_UNAVAILABLE');
export const CODE_EXPIRED = () =>
  new AppError('This code has expired. Send a new one to continue.', 410, 'CODE_EXPIRED');
export const CODE_INVALID = (attemptsRemaining: number) =>
  new AppError(
    `That code isn't right. ${attemptsRemaining} ${attemptsRemaining === 1 ? 'try' : 'tries'} left.`,
    401,
    'CODE_INVALID',
    { attemptsRemaining }
  );
export const EMAIL_TAKEN = () => new AppError("This email can't be used. Try another one.", 409, 'EMAIL_TAKEN');
export const SIGNUP_EXPIRED = () =>
  new AppError('Your code request expired. Send a new one.', 410, 'SIGNUP_EXPIRED');
export const EMAIL_CLAIM_REVIEW = () =>
  new AppError("This email can't be used right now. Contact support.", 409, 'EMAIL_CLAIM_REVIEW');

function keyFrom(name: string) {
  const key = process.env[name]?.trim() || '';
  return key.length >= 32 ? key : null;
}

/** HMAC key for codes. Missing → sends fail closed with 503 (never an unkeyed hash). */
export function emailCodeKey() {
  const key = keyFrom('EMAIL_CODE_KEY');
  if (!key) {
    console.error('[email] EMAIL_CODE_KEY is not set (need at least 32 characters)');
    throw EMAIL_UNAVAILABLE();
  }
  return key;
}

/** HMAC of an address for EmailRelease / EmailSuppression / rate-limit keys (EMAIL_HASH_KEY). */
export function emailHmac(emailNorm: string, key = keyFrom('EMAIL_HASH_KEY')) {
  if (!key) {
    console.error('[email] EMAIL_HASH_KEY is not set (need at least 32 characters)');
    throw EMAIL_UNAVAILABLE();
  }
  return createHmac('sha256', key).update(emailNorm).digest('hex');
}

/** Rate-limit bucket id for an address. Uses the HMAC when keyed; never the raw address. */
export function emailBucket(emailNorm: string) {
  const key = keyFrom('EMAIL_HASH_KEY');
  return key ? emailHmac(emailNorm, key).slice(0, 32) : createHash('sha256').update(`cutly-rl|${emailNorm}`).digest('hex').slice(0, 32);
}

export function generateEmailCode(rand: (max: number) => number = (max) => randomInt(0, max)) {
  return String(rand(1_000_000)).padStart(6, '0');
}

export function hashEmailCode(key: string, subject: string, purpose: EmailCodePurpose, emailNorm: string, code: string) {
  return createHmac('sha256', key).update(`${subject}|${purpose}|${emailNorm}|${code}`).digest('hex');
}

export function emailCodeMatches(expectedHex: string, actualHex: string) {
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(actualHex, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** "p***@gmail.com": first letter of the local part, domain kept. */
export function maskEmail(emailNorm: string) {
  const at = emailNorm.lastIndexOf('@');
  if (at < 1) return '***';
  return `${emailNorm[0]}***${emailNorm.slice(at)}`;
}

/** Spaces/dashes from a paste are dropped; anything else must be exactly 6 digits. */
export function cleanCode(raw: string) {
  const code = raw.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

/** Signup on/off switch (design §10). Default OFF (PR Review #58): only SIGNUP_EMAIL_VERIFY=on enables it. */
export function signupEmailVerifyOn(env: Record<string, string | undefined> = process.env) {
  return (env.SIGNUP_EMAIL_VERIFY || 'off').trim().toLowerCase() === 'on';
}

type Env = Record<string, string | undefined>;
const envKeyOk = (env: Env, name: string) => (env[name]?.trim() || '').length >= 32;

/**
 * Startup check (DBA #58 item 1, Sec #58 item 4). Returns the problems; main.ts exits 1 on any.
 * - EMAIL_CODE_KEY and EMAIL_HASH_KEY must be set (>= 32 chars)
 * - EMAIL_TRANSPORT=log is refused when NODE_ENV=production
 */
export function emailConfigProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  for (const name of ['EMAIL_CODE_KEY', 'EMAIL_HASH_KEY']) {
    if (!envKeyOk(env, name)) problems.push(`${name} is not set (need at least 32 characters)`);
  }
  const transport = (env.EMAIL_TRANSPORT || 'resend').trim().toLowerCase();
  if (transport === 'log' && (env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    problems.push('EMAIL_TRANSPORT=log is not allowed when NODE_ENV=production');
  }
  return problems;
}

/** Postgres deadlock / serialization failure → worth one retry (DBA item 4). */
export function isRetryableTxError(error: unknown) {
  const e = error as { code?: string; message?: string; meta?: { code?: string } };
  if (e?.code === 'P2034') return true;
  const text = `${e?.meta?.code || ''} ${e?.message || ''}`;
  return /40P01|40001|deadlock detected|could not serialize/i.test(text);
}
