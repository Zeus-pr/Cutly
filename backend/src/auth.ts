import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import twilio from 'twilio';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;

export type PublicUser = { id: string; email: string | null; phone: string | null; name: string | null };

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET is not set');
  return value;
}

function publicUser(user: { id: string; email: string | null; phone: string | null; name: string | null }): PublicUser {
  return { id: user.id, email: user.email, phone: user.phone, name: user.name };
}

export function signToken(user: PublicUser, audience: 'customer' | 'partner' = 'customer') {
  return jwt.sign({ sub: user.id, email: user.email, phone: user.phone, aud: audience }, secret(), { expiresIn: '30d' });
}

export async function signUp(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('An account with that email already exists.');
  const user = await prisma.user.create({
    data: { email, name: name || null, passwordHash: await bcrypt.hash(password, 10) }
  });
  const profile = publicUser(user);
  return { token: signToken(profile), user: profile };
}

export async function userFromToken(token: string) {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, secret()) as jwt.JwtPayload;
  } catch {
    throw new Error('Sign in again.');
  }
  const id = typeof payload.sub === 'string' ? payload.sub : '';
  if (!id) throw new Error('Sign in again.');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error('Sign in again.');
  return publicUser(user);
}

export async function updateProfileName(token: string, name: string) {
  const current = await userFromToken(token);
  const user = await prisma.user.update({ where: { id: current.id }, data: { name } });
  return publicUser(user);
}

export async function signIn(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new Error('Email or password is incorrect.');
  }
  const profile = publicUser(user);
  return { token: signToken(profile), user: profile };
}

export async function signInWithGoogle(idToken: string) {
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured.');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  const googleSub = payload?.sub;
  if (!googleSub) throw new Error('Google did not return an account.');
  const email = payload.email?.toLowerCase() || null;
  const name = payload.name || null;
  const existing = await prisma.user.findUnique({ where: { googleSub } })
    || (email ? await prisma.user.findUnique({ where: { email } }) : null);
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

export async function verifyPhoneOtp(phone: string, code: string) {
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
  const existing = await prisma.user.findUnique({ where: { phone } });
  const user = existing || await prisma.user.create({ data: { phone } });
  const profile = publicUser(user);
  return { token: signToken(profile), user: profile };
}
