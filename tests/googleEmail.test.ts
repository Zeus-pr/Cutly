import { describe, expect, it } from 'vitest';
import { planGoogleLink, trustedGoogleEmail, type GoogleProfileHit } from '../backend/src/auth';

const hit = (overrides: Partial<GoogleProfileHit> & Pick<GoogleProfileHit, 'id'>): GoogleProfileHit => ({
  email: 'guest@cutly.buzz',
  googleSub: null,
  emailVerified: false,
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

describe('planGoogleLink (SEC-03)', () => {
  const googleSub = 'google-new';
  const trustedEmail = 'guest@cutly.buzz';

  it('creates a profile with the verified email when nobody has it', () => {
    expect(planGoogleLink({ googleSub, trustedEmail, bySub: null, byEmail: null })).toEqual({
      kind: 'create',
      email: trustedEmail
    });
  });

  it('does not attach Google to an account that only typed the email', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: null,
        byEmail: hit({ id: 'typed', emailVerified: false })
      })
    ).toEqual({ kind: 'create', email: null });
  });

  it('links when the stored email was already verified and has no other Google account', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: null,
        byEmail: hit({ id: 'verified', emailVerified: true })
      })
    ).toEqual({ kind: 'link', userId: 'verified', storeEmail: null, markEmailVerified: true });
  });

  it('rejects replacing a different googleSub', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: null,
        byEmail: hit({ id: 'taken', emailVerified: true, googleSub: 'google-old' })
      })
    ).toEqual({ kind: 'reject' });
  });

  it('keeps the existing Google profile when another account is squatting the email', () => {
    expect(
      planGoogleLink({
        googleSub,
        trustedEmail,
        bySub: hit({ id: 'mine', email: null, googleSub, emailVerified: false }),
        byEmail: hit({ id: 'squat', emailVerified: false })
      })
    ).toEqual({ kind: 'link', userId: 'mine', storeEmail: null, markEmailVerified: false });
  });

  it('marks the email verified when this Google profile already has that address', () => {
    const mine = hit({ id: 'mine', googleSub, emailVerified: false });
    expect(planGoogleLink({ googleSub, trustedEmail, bySub: mine, byEmail: mine })).toEqual({
      kind: 'link',
      userId: 'mine',
      storeEmail: null,
      markEmailVerified: true
    });
  });
});
