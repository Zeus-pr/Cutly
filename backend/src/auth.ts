import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import twilio from 'twilio';
import { PrismaClient } from '@prisma/client';
import { assertDateOfBirth } from '../../utils/dateOfBirth';

const prisma = new PrismaClient();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;

export type PublicUser = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  inviteCode?: string | null;
};

/** Fail closed if JWT_SECRET missing (SEC-10). */
export function jwtSecret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

function secret() {
  return jwtSecret();
}

const JWT_VERIFY: jwt.VerifyOptions = { algorithms: ['HS256'] };

function publicUser(user: {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  gender?: string | null;
  dateOfBirth?: Date | null;
  inviteCode?: string | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    gender: user.gender ?? null,
    dateOfBirth: dateOnly(user.dateOfBirth),
    inviteCode: user.inviteCode ?? null
  };
}

function dateOnly(value: Date | null | undefined) {
  if (!value) return null;
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function signToken(user: PublicUser, audience: 'customer' | 'partner' = 'customer') {
  return jwt.sign({ sub: user.id, email: user.email, phone: user.phone, aud: audience }, secret(), { expiresIn: '30d' });
}

/** SEC-08: same message for email/phone taken — no account enumeration. */
const SIGNUP_TAKEN = 'Could not create that account. Try another email or phone, or sign in.';

export async function signUp(email: string, password: string, phone: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error(SIGNUP_TAKEN);
  const phoneTaken = await prisma.user.findUnique({ where: { phone } });
  if (phoneTaken) throw new Error(SIGNUP_TAKEN);
  const user = await prisma.user.create({
    data: {
      email,
      phone,
      name: name || null,
      passwordHash: await bcrypt.hash(password, 10)
    }
  });
  const profile = publicUser(user);
  return { token: signToken(profile), user: profile };
}

export async function userFromToken(token: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret(), JWT_VERIFY) as jwt.JwtPayload;
  } catch {
    throw new Error('Sign in again.');
  }
  // SEC-10: reject partner tokens (and anything without customer aud).
  if (payload.aud !== 'customer') throw new Error('Sign in again.');
  const id = typeof payload.sub === 'string' ? payload.sub : '';
  if (!id) throw new Error('Sign in again.');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error('Sign in again.');
  return publicUser(user);
}

export async function updateProfile(
  token: string,
  input: { name?: string; phone?: string; email?: string; gender?: string; dateOfBirth?: string; inviteCode?: string }
) {
  const current = await userFromToken(token);
  const data: {
    name?: string;
    phone?: string;
    email?: string | null;
    gender?: string | null;
    dateOfBirth?: Date;
    inviteCode?: string | null;
  } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Enter your name.');
    data.name = name;
  }
  if (input.phone !== undefined) {
    const phone = input.phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      throw new Error('Enter phone with country code, like +9198…');
    }
    const taken = await prisma.user.findFirst({ where: { phone, NOT: { id: current.id } } });
    if (taken) throw new Error('That phone number is already on another account.');
    data.phone = phone;
  }
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      data.email = null;
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email.');
      const taken = await prisma.user.findFirst({ where: { email, NOT: { id: current.id } } });
      if (taken) throw new Error('That email is already on another account.');
      data.email = email;
    }
  }
  if (input.gender !== undefined) {
    const gender = input.gender.trim().toLowerCase();
    const allowed = new Set(['male', 'female', 'other', 'prefer_not', '']);
    if (!allowed.has(gender)) throw new Error('Pick a gender option.');
    data.gender = gender || null;
  }
  if (input.dateOfBirth !== undefined) {
    const iso = assertDateOfBirth(input.dateOfBirth);
    data.dateOfBirth = new Date(`${iso}T00:00:00.000Z`);
  }
  if (input.inviteCode !== undefined) {
    const code = input.inviteCode.trim().slice(0, 32);
    data.inviteCode = code || null;
  }
  if (!Object.keys(data).length) throw new Error('Nothing to update.');
  const user = await prisma.user.update({ where: { id: current.id }, data });
  return publicUser(user);
}

/** @deprecated use updateProfile */
export async function updateProfileName(token: string, name: string) {
  return updateProfile(token, { name });
}

export async function signIn(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error('Email or password is incorrect.');
  }
  const profile = publicUser(user);
  return { token: signToken(profile), user: profile };
}

/**
 * SEC-03: an unverified Google email must not match or be saved on a CUTLY user.
 * `email_verified` is only trusted when it is boolean true.
 */
export function trustedGoogleEmail(payload: { email?: string | null; email_verified?: boolean | null }) {
  if (payload.email_verified !== true) return null;
  const email = payload.email?.trim().toLowerCase() || '';
  return email || null;
}

export async function signInWithGoogle(idToken: string) {
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured.');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  const googleSub = payload?.sub;
  if (!googleSub) throw new Error('Google did not return an account.');
  const email = trustedGoogleEmail(payload);
  const name = payload.name || null;
  const bySub = await prisma.user.findUnique({ where: { googleSub } });
  const byEmail = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (bySub && byEmail && bySub.id !== byEmail.id) {
    throw new Error('This Google account does not match that email on CUTLY.');
  }
  const existing = bySub || byEmail;
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { googleSub, email: existing.email || email, name: existing.name || name } })
    : await prisma.user.create({ data: { googleSub, email, name } });
  const profile = publicUser(user);
  return { token: signToken(profile), user: profile };
}

let verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || '';

function twilioError(error: unknown): never {
  const err = error as { code?: number; message?: string };
  const message = err.message || 'Could not send the code.';
  if (err.code === 60203) throw new Error('Too many codes were sent. Wait a few minutes and try again.');
  if (err.code === 60202 || err.code === 20404) throw new Error('That code is incorrect or expired.');
  if (/unverified/i.test(message) || err.code === 21608) {
    throw new Error('This Twilio trial can only text numbers verified in the Twilio console.');
  }
  if (/geo permissions|permission to send/i.test(message) || err.code === 21408 || err.code === 60605) {
    throw new Error('Twilio is not allowed to text this country yet. Enable it in Twilio geo permissions.');
  }
  throw new Error(message);
}

async function verifyService() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Phone sign-in is not configured.');
  const client = twilio(sid, token);
  if (!verifyServiceSid) {
    const listed = await client.verify.v2.services.list({ limit: 20 });
    const found = listed.find((service) => service.friendlyName === 'CUTLY');
    verifyServiceSid = found?.sid || (await client.verify.v2.services.create({ friendlyName: 'CUTLY', codeLength: 6 })).sid;
  }
  return { client, serviceSid: verifyServiceSid };
}

export async function sendPhoneOtp(phone: string) {
  const recent = await prisma.phoneOtp.findFirst({ where: { phone, codeHash: 'twilio-verify' }, orderBy: { createdAt: 'desc' } });
  if (recent && Date.now() - recent.createdAt.getTime() < OTP_COOLDOWN_MS) {
    throw new Error('Wait a moment before requesting another code.');
  }
  const { client, serviceSid } = await verifyService();
  try {
    await client.verify.v2.services(serviceSid).verifications.create({ to: phone, channel: 'sms' });
  } catch (error) {
    twilioError(error);
  }
  await prisma.phoneOtp.create({
    data: { phone, codeHash: 'twilio-verify', expiresAt: new Date(Date.now() + OTP_TTL_MS) }
  });
}

export async function verifyPhoneOtp(phone: string, code: string, mergeToken?: string) {
  const { client, serviceSid } = await verifyService();
  let status = '';
  try {
    const check = await client.verify.v2.services(serviceSid).verificationChecks.create({ to: phone, code });
    status = check.status;
  } catch (error) {
    twilioError(error);
  }
  if (status !== 'approved') throw new Error('That code is incorrect or expired.');
  await prisma.phoneOtp.deleteMany({ where: { phone } });

  const byPhone = await prisma.user.findUnique({ where: { phone } });

  // CJ-43: signed-in email/Google user without phone → attach this phone (merge).
  if (mergeToken) {
    try {
      const signedIn = await userFromToken(mergeToken);
      if (signedIn.phone && signedIn.phone !== phone) {
        throw new Error('This account already has a different phone number.');
      }
      if (!signedIn.phone) {
        if (byPhone && byPhone.id !== signedIn.id) {
          // Phone-only stub with no email/google → fold into signed-in account.
          if (!byPhone.email && !byPhone.googleSub && !byPhone.passwordHash) {
            await prisma.$transaction(async (tx) => {
              await tx.booking.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.favouriteShop.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.review.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.notification.updateMany({ where: { userId: byPhone.id }, data: { userId: signedIn.id } });
              await tx.user.delete({ where: { id: byPhone.id } });
              await tx.user.update({ where: { id: signedIn.id }, data: { phone } });
            });
          } else {
            throw new Error('That phone is already linked to another CUTLY account.');
          }
        } else {
          await prisma.user.update({ where: { id: signedIn.id }, data: { phone } });
        }
        const merged = await prisma.user.findUniqueOrThrow({ where: { id: signedIn.id } });
        const profile = publicUser(merged);
        return { token: signToken(profile), user: profile };
      }
    } catch (err) {
      if (err instanceof Error && !/Sign in again|token/i.test(err.message)) throw err;
      // Invalid merge token → fall through to normal OTP login.
    }
  }

  const user = byPhone || (await prisma.user.create({ data: { phone } }));
  const profile = publicUser(user);
  return { token: signToken(profile), user: profile };
}

/** Removes the customer login and their bookings, holds, and saved places. */
export async function deleteCustomerAccount(token: string) {
  const user = await userFromToken(token);
  const bookings = await prisma.booking.findMany({ where: { userId: user.id }, select: { id: true } });
  const ids = bookings.map((row) => row.id);
  await prisma.$transaction(async (tx) => {
    if (ids.length) {
      await tx.review.deleteMany({ where: { bookingId: { in: ids } } });
      await tx.bookingPayment.deleteMany({ where: { bookingId: { in: ids } } });
      await tx.bookingService.deleteMany({ where: { bookingId: { in: ids } } });
      await tx.booking.deleteMany({ where: { id: { in: ids } } });
    }
    await tx.review.deleteMany({ where: { userId: user.id } });
    await tx.bookingHold.deleteMany({ where: { userId: user.id } });
    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.favouriteShop.deleteMany({ where: { userId: user.id } });
    await tx.savedLocation.deleteMany({ where: { userId: user.id } });
    if (user.phone) await tx.phoneOtp.deleteMany({ where: { phone: user.phone } });
    await tx.user.delete({ where: { id: user.id } });
  });
  return { deleted: true as const };
}
