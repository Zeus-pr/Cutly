import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { consumeReauthToken, issueReauthToken, verifyReauthProof, type ReauthSubject } from '../backend/src/reauth';

const SECRET = 'test-secret';

/** In-memory stand-in for prisma.reauthGrant (create + conditional updateMany). */
function memoryStore() {
  const rows = new Map<string, { id: string; subjectId: string; audience: string; action: string; expiresAt: Date; usedAt: Date | null }>();
  const store = {
    reauthGrant: {
      async create({ data }: { data: { id: string; subjectId: string; audience: string; action: string; expiresAt: Date } }) {
        rows.set(data.id, { ...data, usedAt: null });
        return data;
      },
      async updateMany({ where, data }: { where: any; data: { usedAt: Date } }) {
        const row = rows.get(where.id);
        if (
          !row ||
          row.subjectId !== where.subjectId ||
          row.audience !== where.audience ||
          row.action !== where.action ||
          row.usedAt !== null ||
          row.expiresAt.getTime() <= where.expiresAt.gt.getTime()
        ) {
          return { count: 0 };
        }
        row.usedAt = data.usedAt;
        return { count: 1 };
      }
    }
  };
  return store as any;
}

const deps = {
  checkOtp: async (_phone: string, code: string) => code === '123456',
  verifyGoogle: async (idToken: string) => ({ sub: idToken.split(':')[0], iat: Number(idToken.split(':')[1]) })
};

describe('reauth proofs', async () => {
  const subject: ReauthSubject = {
    id: 'u1',
    phone: '+919800000001',
    passwordHash: await bcrypt.hash('correct horse', 4),
    googleSub: 'g-123'
  };
  const now = new Date('2026-10-15T10:00:00.000Z');
  const nowSec = now.getTime() / 1000;

  it('password', async () => {
    await expect(verifyReauthProof(subject, { method: 'password', password: 'correct horse' }, deps)).resolves.toBeUndefined();
    await expect(verifyReauthProof(subject, { method: 'password', password: 'wrong' }, deps)).rejects.toMatchObject({
      status: 401,
      code: 'REAUTH_FAILED'
    });
    await expect(
      verifyReauthProof({ ...subject, passwordHash: null }, { method: 'password', password: 'x' }, deps)
    ).rejects.toMatchObject({ status: 401 });
  });

  it('OTP for the account phone only', async () => {
    await expect(verifyReauthProof(subject, { method: 'otp', code: '123456' }, deps)).resolves.toBeUndefined();
    await expect(verifyReauthProof(subject, { method: 'otp', code: '000000' }, deps)).rejects.toMatchObject({ status: 401 });
    await expect(
      verifyReauthProof({ ...subject, phone: null }, { method: 'otp', code: '123456' }, deps)
    ).rejects.toMatchObject({ status: 401 });
  });

  it('Google: matching sub and a fresh token (< 5 min)', async () => {
    const d = { ...deps, now: () => now };
    await expect(verifyReauthProof(subject, { method: 'google', idToken: `g-123:${nowSec - 60}` }, d)).resolves.toBeUndefined();
    await expect(verifyReauthProof(subject, { method: 'google', idToken: `g-999:${nowSec}` }, d)).rejects.toMatchObject({ status: 401 });
    await expect(verifyReauthProof(subject, { method: 'google', idToken: `g-123:${nowSec - 360}` }, d)).rejects.toMatchObject({ status: 401 });
  });
});

describe('reauth token', () => {
  const now = new Date('2026-10-15T10:00:00.000Z');

  it('is one-time', async () => {
    const store = memoryStore();
    const { reauthToken, expiresIn } = await issueReauthToken(store, SECRET, 'u1', 'customer', now);
    expect(expiresIn).toBe(300);
    await expect(consumeReauthToken(store, SECRET, reauthToken, 'u1', 'customer', now)).resolves.toBeUndefined();
    await expect(consumeReauthToken(store, SECRET, reauthToken, 'u1', 'customer', now)).rejects.toMatchObject({
      status: 401,
      code: 'REAUTH_REQUIRED'
    });
  });

  it('missing header → 401 REAUTH_REQUIRED', async () => {
    await expect(consumeReauthToken(memoryStore(), SECRET, undefined, 'u1', 'customer', now)).rejects.toMatchObject({
      status: 401,
      code: 'REAUTH_REQUIRED'
    });
  });

  it('expired grant (6 minutes later) is refused', async () => {
    const store = memoryStore();
    const { reauthToken } = await issueReauthToken(store, SECRET, 'u1', 'customer', now);
    const later = new Date(now.getTime() + 6 * 60_000);
    await expect(consumeReauthToken(store, SECRET, reauthToken, 'u1', 'customer', later)).rejects.toMatchObject({ status: 401 });
  });

  it('bound to subject and audience', async () => {
    const store = memoryStore();
    const { reauthToken } = await issueReauthToken(store, SECRET, 'u1', 'customer', now);
    await expect(consumeReauthToken(store, SECRET, reauthToken, 'u2', 'customer', now)).rejects.toMatchObject({ status: 401 });
    await expect(consumeReauthToken(store, SECRET, reauthToken, 'u1', 'partner', now)).rejects.toMatchObject({ status: 401 });
  });

  it('a normal session token is not a reauth token', async () => {
    const session = jwt.sign({ sub: 'u1', aud: 'customer' }, SECRET, { jwtid: 'x' });
    await expect(consumeReauthToken(memoryStore(), SECRET, session, 'u1', 'customer', now)).rejects.toMatchObject({ status: 401 });
  });
});
