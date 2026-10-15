import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError } from './httpError';

/**
 * T3 step-up auth. A short-lived (5 min), one-time token proving the owner just
 * re-entered a password, an SMS code for their own phone, or a fresh Google sign-in.
 * Required (X-Reauth-Token) for DELETE /api/auth/account and /api/partner/account.
 */

export const REAUTH_TTL_SEC = 300;
export const REAUTH_ACTION = 'delete_account';
/** T4 (#9): a grant is bound to one action; a delete grant can't change the email and vice versa. */
export type ReauthAction = 'delete_account' | 'change_email';
export type ReauthAudience = 'customer' | 'partner';

export const REAUTH_REQUIRED = () => new AppError('Confirm it’s you first.', 401, 'REAUTH_REQUIRED');
const REAUTH_FAILED = () => new AppError('We could not confirm it’s you. Try again.', 401, 'REAUTH_FAILED');

export type ReauthInput =
  | { method: 'password'; password: string }
  | { method: 'otp'; code: string }
  | { method: 'google'; idToken: string };

export type ReauthSubject = {
  id: string;
  phone: string | null;
  passwordHash: string | null;
  googleSub: string | null;
};

export type ReauthDeps = {
  /** Twilio Verify check for the account's own phone. */
  checkOtp: (phone: string, code: string) => Promise<boolean>;
  /** Returns { sub, iat } from a verified Google ID token. */
  verifyGoogle: (idToken: string) => Promise<{ sub: string; iat: number }>;
  now?: () => Date;
};

export async function defaultVerifyGoogle(idToken: string) {
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw REAUTH_FAILED();
  const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || typeof payload.iat !== 'number') throw REAUTH_FAILED();
  return { sub: payload.sub, iat: payload.iat };
}

/** Checks the proof against the subject. Throws 401 REAUTH_FAILED on any mismatch. */
export async function verifyReauthProof(subject: ReauthSubject, input: ReauthInput, deps: ReauthDeps) {
  const now = (deps.now ?? (() => new Date()))();
  if (input.method === 'password') {
    if (!subject.passwordHash || !(await bcrypt.compare(input.password, subject.passwordHash))) throw REAUTH_FAILED();
    return;
  }
  if (input.method === 'otp') {
    if (!subject.phone) throw REAUTH_FAILED();
    let ok = false;
    try {
      ok = await deps.checkOtp(subject.phone, input.code);
    } catch {
      ok = false;
    }
    if (!ok) throw REAUTH_FAILED();
    return;
  }
  if (!subject.googleSub) throw REAUTH_FAILED();
  let proof: { sub: string; iat: number };
  try {
    proof = await deps.verifyGoogle(input.idToken);
  } catch {
    throw REAUTH_FAILED();
  }
  const ageSec = now.getTime() / 1000 - proof.iat;
  if (proof.sub !== subject.googleSub || ageSec > REAUTH_TTL_SEC || ageSec < -60) throw REAUTH_FAILED();
}

type GrantStore = Pick<PrismaClient, 'reauthGrant'> | Prisma.TransactionClient;

export async function issueReauthToken(
  store: GrantStore,
  secret: string,
  subjectId: string,
  audience: ReauthAudience,
  now = new Date(),
  action: ReauthAction = REAUTH_ACTION
) {
  const jti = randomUUID();
  await store.reauthGrant.create({
    data: {
      id: jti,
      subjectId,
      audience,
      action,
      expiresAt: new Date(now.getTime() + REAUTH_TTL_SEC * 1000)
    }
  });
  const reauthToken = jwt.sign({ sub: subjectId, aud: 'reauth', who: audience, act: action }, secret, {
    algorithm: 'HS256',
    expiresIn: REAUTH_TTL_SEC,
    jwtid: jti
  });
  return { reauthToken, expiresIn: REAUTH_TTL_SEC };
}

/**
 * Verifies and burns a reauth token. Call inside the delete transaction so a failed
 * delete does not use up the grant. Throws 401 REAUTH_REQUIRED.
 */
export async function consumeReauthToken(
  store: GrantStore,
  secret: string,
  token: string | undefined | null,
  subjectId: string,
  audience: ReauthAudience,
  now = new Date(),
  action: ReauthAction = REAUTH_ACTION
) {
  if (!token) throw REAUTH_REQUIRED();
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'], audience: 'reauth' }) as jwt.JwtPayload;
  } catch {
    throw REAUTH_REQUIRED();
  }
  if (payload.sub !== subjectId || payload.who !== audience || payload.act !== action || !payload.jti) {
    throw REAUTH_REQUIRED();
  }
  const used = await store.reauthGrant.updateMany({
    where: { id: payload.jti, subjectId, audience, action, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now }
  });
  if (used.count !== 1) throw REAUTH_REQUIRED();
}
