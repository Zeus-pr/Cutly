import { describe, expect, it } from 'vitest';
import { trustedGoogleEmail } from '../backend/src/auth';

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
