/**
 * T4 (#9) §9.8: Resend bounce / complaint webhook → EmailSuppression (HMAC of the address).
 * Svix signature over the RAW body: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)),
 * secret = base64 part of RESEND_WEBHOOK_SECRET ("whsec_…"). Timestamps older than 5 min are rejected.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { emailHmac } from './emailCode';
import { normalEmail } from './auth';

const prisma = new PrismaClient();
const TOLERANCE_SEC = 5 * 60;

export function verifySvixSignature(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: string,
  nowSec = Math.floor(Date.now() / 1000)
) {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > TOLERANCE_SEC) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type ResendEvent = { type?: string; data?: { to?: string[] | string; bounce?: { type?: string } } };

/** Hard bounces and complaints only; soft (transient) bounces are not stored (DBA item 7). */
export function suppressionFor(event: ResendEvent): { emails: string[]; reason: 'hard_bounce' | 'complaint' } | null {
  const to = event.data?.to;
  const emails = (Array.isArray(to) ? to : to ? [to] : []).map(normalEmail).filter(Boolean);
  if (!emails.length) return null;
  if (event.type === 'email.complained') return { emails, reason: 'complaint' };
  if (event.type === 'email.bounced') {
    const kind = (event.data?.bounce?.type || '').toLowerCase();
    if (kind === 'transient' || kind === 'soft') return null;
    return { emails, reason: 'hard_bounce' };
  }
  return null;
}

export async function recordResendEvent(event: ResendEvent) {
  const hit = suppressionFor(event);
  if (!hit) return { stored: 0 };
  for (const email of hit.emails) {
    const hmac = emailHmac(email);
    await prisma.emailSuppression.upsert({ where: { emailHmac: hmac }, create: { emailHmac: hmac, reason: hit.reason }, update: { reason: hit.reason, createdAt: new Date() } }); // DBA #58 item 8: a repeat bounce restarts the 24-month window
  }
  return { stored: hit.emails.length };
}
