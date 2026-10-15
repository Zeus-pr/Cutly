import { getClientIp, rateLimitIpKey } from './clientIp';
import Redis from 'ioredis';

type Bucket = { count: number; resetAt: number };
/** `remaining` = requests still allowed in this window after this one (#46 attemptsRemaining). */
export type LimitResult = { ok: boolean; retryAfterSec: number; remaining?: number };

const buckets = new Map<string, Bucket>();

/**
 * Spread expiry so buckets that start together do not all reset on the same millisecond.
 * Jitter is 0–10% of the window, at least 1s, at most 60s.
 */
export function jitteredTtlMs(windowMs: number, random: () => number = Math.random): number {
  const window = Math.max(1000, Math.floor(windowMs));
  const span = Math.min(60_000, Math.max(1000, Math.floor(window * 0.1)));
  return window + Math.floor(random() * span);
}

const INCR_WITH_JITTER = `
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if current == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

let redis: Redis | null = null;
let warnedFallback = false;
let redisDownUntil = 0;

function redisClient(): Redis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url || Date.now() < redisDownUntil) return null;
  if (redis) return redis;
  redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 800,
    enableOfflineQueue: false,
    lazyConnect: true
  });
  redis.on('error', () => {
    // Connection errors are handled at call time so a blip does not crash the API.
  });
  return redis;
}

function memoryLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + jitteredTtlMs(windowMs) });
    return { ok: true, retryAfterSec: 0, remaining: Math.max(0, limit - 1) };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)), remaining: 0 };
  }
  existing.count += 1;
  return { ok: true, retryAfterSec: 0, remaining: Math.max(0, limit - existing.count) };
}

function fromCount(count: number, ttlMs: number, limit: number): LimitResult {
  if (count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(Math.max(ttlMs, 1000) / 1000)), remaining: 0 };
  }
  return { ok: true, retryAfterSec: 0, remaining: Math.max(0, limit - count) };
}

/** Fixed window in Redis. New keys get a jittered TTL (not a shared expiry). */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<LimitResult> {
  const client = redisClient();
  if (!client) return memoryLimit(key, limit, windowMs);

  try {
    if (client.status === 'wait') await client.connect();
    const ttl = jitteredTtlMs(windowMs);
    const raw = (await client.eval(INCR_WITH_JITTER, 1, `cutly:rl:${key}`, String(ttl))) as [
      number,
      number
    ];
    const count = Number(raw[0]);
    const ttlMs = Number(raw[1]);
    return fromCount(count, ttlMs, limit);
  } catch (err) {
    redisDownUntil = Date.now() + 30_000;
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn('[cutly.ratelimit] Redis unavailable, using in-memory buckets', err);
    }
    return memoryLimit(key, limit, windowMs);
  }
}

/**
 * T4 F4: give back one hit (the request was refused later, so nothing was sent).
 * Never goes below zero; a missing/expired bucket is left alone.
 */
export async function refundRateLimit(key: string): Promise<void> {
  const client = redisClient();
  if (client) {
    try {
      if (client.status === 'wait') await client.connect();
      await client.eval(
        `local v = tonumber(redis.call('GET', KEYS[1]) or '0') if v > 0 then redis.call('DECR', KEYS[1]) end return 0`,
        1,
        `cutly:rl:${key}`
      );
      return;
    } catch {
      // fall through to memory
    }
  }
  const existing = buckets.get(key);
  if (existing && existing.resetAt > Date.now() && existing.count > 0) existing.count -= 1;
}

/**
 * T2: bucket by getClientIp (CF-Connecting-IP only from a trusted proxy socket, else the
 * socket peer). IPv6 is bucketed by /64. Never reads X-Forwarded-For.
 */
export function clientKey(req: Parameters<typeof getClientIp>[0], suffix: string): string {
  return `${suffix}:${rateLimitIpKey(getClientIp(req))}`;
}

/**
 * "45s" / "3 min" / "1 hr" — human wait for 429 copy (#46: no raw seconds in the app).
 * Floors: windows carry up to +60 s jitter (jitteredTtlMs), so 900–959 s must read "15 min",
 * not "16 min". The app's C6 ring shows the exact mm:ss.
 */
export function humanWait(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} hr`;
}

/**
 * #46: every 429 carries `code: 'RATE_LIMITED'`, `retryAfterSec` and a Retry-After header,
 * so the app can show the C6 countdown.
 */
export function sendRateLimited(
  res: { setHeader(name: string, value: string): unknown; status(code: number): { json(body: unknown): unknown } },
  limited: LimitResult,
  what = 'attempts'
) {
  res.setHeader('Retry-After', String(limited.retryAfterSec));
  return res.status(429).json({
    error: `Too many ${what}. Try again in ${humanWait(limited.retryAfterSec)}.`,
    code: 'RATE_LIMITED',
    retryAfterSec: limited.retryAfterSec
  });
}
