import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { signToken } from './auth';
import { partnerSignUp } from './partner';
import { clientKey, rateLimit } from './rateLimit';
import { hasCloudflareHeaders, isLoopback, normalizeIp, socketIp } from './clientIp';

const prisma = new PrismaClient();

/** Documented historical default — never accept on a live API. */
export const WEAK_ADMIN_SECRETS = new Set(['cutly-admin-local', 'admin', 'password', 'secret']);

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  const len = Math.max(ab.length, bb.length, 1);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  ab.copy(aPad);
  bb.copy(bPad);
  const equal = timingSafeEqual(aPad, bPad);
  return equal && ab.length === bb.length;
}

/** @deprecated T2: kept for callers; uses the normalised raw socket check. */
export function isLoopbackIp(ip: string | undefined): boolean {
  return isLoopback(normalizeIp(ip ?? null));
}

/**
 * Ops admin gate:
 * - Strong unique `ADMIN_SECRET` (rejects empty + known weak defaults)
 * - Served only by the admin listener on 127.0.0.1:4001 (T2); :4000 answers 404.
 * - Raw socket peer must be loopback (never req.ip / headers).
 * - Requests carrying Cloudflare headers are refused (403): cloudflared also connects from loopback.
 * - ADMIN_ALLOW_REMOTE was removed (T2); remote admin only via a future Cloudflare Access setup.
 */
export function assertAdmin(req: Request) {
  const expected = process.env.ADMIN_SECRET?.trim() || '';
  if (!expected) {
    const err = new Error('Admin is not configured.') as Error & { status?: number };
    err.status = 503;
    throw err;
  }
  if (WEAK_ADMIN_SECRETS.has(expected) || expected.length < 24) {
    const err = new Error('Admin secret is too weak. Set a long unique ADMIN_SECRET in .env.') as Error & {
      status?: number;
    };
    err.status = 503;
    throw err;
  }

  if (hasCloudflareHeaders(req)) {
    const err = new Error('Forbidden.') as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  if (!isLoopback(socketIp(req))) {
    const err = new Error('Unauthorized.') as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const got = String(req.header('x-admin-secret') || '').trim();
  if (!got || !safeEqualString(got, expected)) {
    const err = new Error('Unauthorized.') as Error & { status?: number };
    err.status = 401;
    throw err;
  }
}

/**
 * Rate-limit + assertAdmin with proper HTTP status (not always 400).
 * Loopback-only already — allow a high success budget so Menu/catalogue clicks
 * do not trip 429. Failed secrets stay on a tight bucket.
 */
export function runAdmin(req: Request, res: Response, action: () => Promise<unknown> | unknown) {
  void (async () => {
    const traffic = await rateLimit(clientKey(req, 'admin'), 600, 15 * 60_000);
    if (!traffic.ok) {
      res.setHeader('Retry-After', String(traffic.retryAfterSec));
      res.status(429).json({ error: 'Too many admin requests. Wait a minute and retry.' });
      return;
    }
    try {
      assertAdmin(req);
      const data = await action();
      res.status(200).json({ data });
    } catch (error) {
      const status =
        error instanceof Error && typeof (error as Error & { status?: number }).status === 'number'
          ? (error as Error & { status: number }).status
          : 400;
      if (status === 401) {
        const fails = await rateLimit(clientKey(req, 'admin-auth-fail'), 20, 15 * 60_000);
        if (!fails.ok) {
          res.setHeader('Retry-After', String(fails.retryAfterSec));
          res.status(429).json({ error: 'Too many failed unlocks. Try again later.' });
          return;
        }
      }
      const message =
        status === 401 || status === 403 || status === 503
          ? error instanceof Error
            ? error.message
            : 'Unauthorized.'
          : error instanceof Error
            ? error.message
            : 'Request failed';
      res.status(status).json({ error: message });
    }
  })();
}

export async function adminPing() {
  return { ok: true as const, service: 'cutly-admin' };
}

export async function adminListPartners() {
  const rows = await prisma.partner.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      shops: {
        select: {
          id: true,
          name: true,
          city: true,
          phone: true,
          setupDone: true,
          isActive: true,
          kinds: true,
          kind: true,
          acceptingAppointments: true
        }
      }
    }
  });
  return rows.map((p) => {
    const shop = p.shops[0] || null;
    return {
      id: p.id,
      email: p.email,
      name: p.name,
      phone: p.phone,
      createdAt: p.createdAt.toISOString(),
      shop: shop
        ? {
            id: shop.id,
            name: shop.name,
            city: shop.city,
            phone: shop.phone,
            setupDone: shop.setupDone,
            isActive: shop.isActive,
            kinds: shop.kinds?.length ? shop.kinds : shop.kind ? [shop.kind] : [],
            acceptingAppointments: shop.acceptingAppointments
          }
        : null
    };
  });
}

export async function adminCreatePartner(input: { email: string; password: string; name?: string }) {
  // Reuses existing partner signup (same table + JWT shape as the app).
  return partnerSignUp(input.email, input.password, input.name);
}

export async function adminSetPartnerPassword(partnerId: string, password: string) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new Error('Partner not found.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  await prisma.partner.update({
    where: { id: partnerId },
    data: { passwordHash: await bcrypt.hash(password, 10) }
  });
  return { ok: true as const, partnerId, email: partner.email };
}

/** Mint a normal partner JWT so the admin UI can call existing `/api/partner/*` routes. */
export async function adminMintPartnerToken(partnerId: string) {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw new Error('Partner not found.');
  const profile = {
    id: partner.id,
    email: partner.email,
    phone: partner.phone,
    name: partner.name
  };
  return {
    token: signToken(profile, 'partner'),
    partner: profile
  };
}

export async function adminListLeads(limit = 100) {
  const take = Math.max(1, Math.min(200, limit));
  const rows = await prisma.partnerLead.findMany({
    orderBy: { createdAt: 'desc' },
    take
  });
  return rows.map((l) => ({
    id: l.id,
    phone: l.phone,
    shopName: l.shopName,
    city: l.city,
    source: l.source,
    createdAt: l.createdAt.toISOString()
  }));
}
