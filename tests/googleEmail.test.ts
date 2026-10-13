import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  GoogleLinkRetry,
  normalEmail,
  planGoogleLink,
  planGoogleMerge,
  preferEmailOwner,
  shouldClearEmailVerified,
  shouldRetryGoogleLink,
  trustedGoogleEmail,
  type GoogleProfileHit
} from '../backend/src/auth';

const hit = (overrides: Partial<GoogleProfileHit> & Pick<GoogleProfileHit, 'id'>): GoogleProfileHit => ({
  email: 'guest@cutly.buzz',
  googleSub: null,
  emailVerified: false,
  hasPassword: false,
  ...overrides
});

describe('trustedGoogleEmail (SEC-03)', () => {
  it('keeps a verified email', () => {
    expect(trustedGoogleEmail({ email: ' Guest@Cutly.Buzz ', email_verified: true })).toBe('guest@cutly.buzz');
  });

  it('drops an unverified email so it cannot link an account', () => {
    expect(trustedGoogleEmail({ email: 'guest@cutly.buzz', email_verified: false })).toBeNull();
    expect(trustedGoogleEmail({ email: 'guest@cutly.buzz' })).toBeNull();
  });

  it('drops a verified claim with no address', () => {
    expect(trustedGoogleEmail({ email: '  ', email_verified: true })).toBeNull();
    expect(trustedGoogleEmail({ email: null, email_verified: true })).toBeNull();
  });
});

describe('planGoogleMerge', () => {
  const base = {
    googleSub: 'google-new',
    trustedEmail: 'guest@cutly.buzz',
    accountId: 'me',
    accountEmail: 'Guest@cutly.buzz',
    accountGoogleSub: null,
    googleOwnerId: null
  };

  it('links when the signed-in email matches Google', () => {
    expect(planGoogleMerge(base)).toEqual({ ok: true });
  });

  it('refuses a different Google login already on the account', () => {
    expect(planGoogleMerge({ ...base, accountGoogleSub: 'google-old' }).ok).toBe(false);
  });

  it('refuses a Google login that belongs to someone else', () => {
    expect(planGoogleMerge({ ...base, googleOwnerId: 'other' }).ok).toBe(false);
  });
});

describe('preferEmailOwner', () => {
  it('keeps a verified row ahead of a password row', () => {
    const verified = { id: 'v', emailVerified: true, hasPassword: false };
    const password = { id: 'p', emailVerified: false, hasPassword: true };
    expect(preferEmailOwner([password, verified])?.id).toBe('v');
  });
});

describe('normalEmail', () => {
  it('trims and lowercases', () => {
    expect(normalEmail('  Guest@Cutly.Buzz ')).toBe('guest@cutly.buzz');
  });
});

describe('shouldRetryGoogleLink', () => {
  it('retries a stale reclaim and a unique clash', () => {
    expect(shouldRetryGoogleLink(new GoogleLinkRetry())).toBe(true);
    expect(
      shouldRetryGoogleLink(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '0'
        })
      )
    ).toBe(true);
    expect(shouldRetryGoogleLink(new Error('Sign in again.'))).toBe(false);
  });
});

describe('shouldClearEmailVerified (SEC-03)', () => {
  it('clears proof when the profile email changes', () => {
    expect(shouldClearEmailVerified('guest@cutly.buzz', 'other@cutly.buzz')).toBe(true);
    expect(shouldClearEmailVerified('guest@cutly.buzz', null)).toBe(true);
  });

  it('keeps proof when the address is unchanged', () => {
    expect(shouldClearEmailVerified('guest@cutly.buzz', 'guest@cutly.buzz')).toBe(false);
  });
});

describe('planGoogleLink (SEC-03)', () => {
  const googleSub = 'google-new';
  const trustedEmail = 'guest@cutly.buzz';

  it('creates a profile with the verified email when nobody has it', () => {
    expect(planGoogleLink({ googleSub, trustedEmail, bySub: null, byEmail: null })).toEqual({
      kind: 'create',
      email: trustedEmail,
      reclaimFromUserId: null
    });
  });

  it('leaves a password account’s email in place', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: null,
        byEmail: hit({ id: 'password', emailVerified: false, hasPassword: true })
      })
    ).toEqual({
      kind: 'reject',
      message: 'You already have a CUTLY account with this email. Sign in with your password, then link Google.'
    });
  });

  it('moves a typed email onto the new Google profile', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: null,
        byEmail: hit({ id: 'typed', emailVerified: false })
      })
    ).toEqual({ kind: 'create', email: trustedEmail, reclaimFromUserId: 'typed' });
  });

  it('links when the stored email was already verified and has no other Google account', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: null,
        byEmail: hit({ id: 'verified', emailVerified: true })
      })
    ).toEqual({ kind: 'link', userId: 'verified', storeEmail: null, markEmailVerified: true, reclaimFromUserId: null });
  });

  it('rejects replacing a different googleSub', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: null,
        byEmail: hit({ id: 'taken', emailVerified: true, googleSub: 'google-old' })
      })
    ).toEqual({ kind: 'reject', message: 'This Google account does not match that email on CUTLY.' });
  });

  it('keeps the existing Google profile when another account is squatting the email', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: hit({ id: 'mine', email: null, googleSub, emailVerified: false }),
        byEmail: hit({ id: 'squat', emailVerified: false })
      })
    ).toEqual({
      kind: 'link',
      userId: 'mine',
      storeEmail: trustedEmail,
      markEmailVerified: true,
      reclaimFromUserId: 'squat'
    });
  });

  it('marks the email verified when this Google profile already has that address', () => {
    const mine = hit({ id: 'mine', googleSub, emailVerified: false });
    expect(planGoogleLink({ googleSub, trustedEmail, bySub: mine, byEmail: mine })).toEqual({
      kind: 'link',
      userId: 'mine',
      storeEmail: null,
      markEmailVerified: true,
      reclaimFromUserId: null
    });
  });
});
