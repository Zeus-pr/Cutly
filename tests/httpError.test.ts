import { describe, expect, it } from 'vitest';
import { AppError, toClientError } from '../backend/src/httpError';

describe('toClientError (SEC-06)', () => {
  it('exposes AppError messages', () => {
    expect(toClientError(new AppError('Pick a time.', 400))).toEqual({
      status: 400,
      message: 'Pick a time.'
    });
  });

  it('maps Sign in again to 401', () => {
    expect(toClientError(new Error('Sign in again.'))).toEqual({
      status: 401,
      message: 'Sign in again.'
    });
  });

  it('hides prisma / secret leaks', () => {
    const out = toClientError(new Error('JWT_SECRET is not set'));
    expect(out.message).toBe('Something went wrong. Try again.');
    expect(out.status).toBe(500);
    const prisma = toClientError(new Error('Invalid `prisma.user.findUnique()` invocation'));
    expect(prisma.message).toBe('Something went wrong. Try again.');
  });

  it('keeps short domain UX strings', () => {
    expect(toClientError(new Error('That slot was just taken.')).message).toBe('That slot was just taken.');
  });
});
