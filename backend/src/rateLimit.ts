import { getClientIp, rateLimitIpKey } from './clientIp';
import Redis from 'ioredis';

type Bucket = { count: number; resetAt: number };
type LimitResult = { ok: boolean; retryAfterSec: number };

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
    return { ok: true, retryAfterSec: 0 };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

function fromCount(count: number, ttlMs: number, limit: number): LimitResult {
  if (count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(Math.max(ttlMs, 1000) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
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
 * T2: bucket by getClientIp (CF-Connecting-IP only from a trusted proxy socket, else the
 * socket peer). IPv6 is bucketed by /64. Never reads X-Forwarded-For.
 */
export function clientKey(req: Parameters<typeof getClientIp>[0], suffix: string): string {
  return `${suffix}:${rateLimitIpKey(getClientIp(req))}`;
}
