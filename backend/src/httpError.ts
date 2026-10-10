/**
 * SEC-06: intentional client-facing errors vs internal leaks.
 * Domain code may `throw new AppError('…')` or keep `throw new Error('…')`
 * for known UX strings; unknowns are logged and replaced with a generic message.
 */

export class AppError extends Error {
  readonly status: number;
  readonly expose: true = true;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

const LEAK_RE =
  /prisma|ECONNREFUSED|EADDRINUSE|JWT_SECRET|ADMIN_SECRET|stack|ENOENT|EACCES|postgres|sql\s|sqlite|mongodb|redis|at\s+\S+\s+\(|TypeError:|ReferenceError:|Cannot read prop|undefined is not|internal server|openssl|openssl_error|authentication failed for/i;

/** Messages we always treat as safe to show (auth + common booking UX). */
const SAFE_EXACT = new Set([
  'Sign in again.',
  'Email or password is incorrect.',
  'Something went wrong. Try again.',
  'We cannot find the page you are looking for.'
]);

export function toClientError(error: unknown): { status: number; message: string } {
  if (error instanceof AppError) {
    return { status: error.status, message: error.message.slice(0, 200) };
  }
  if (!(error instanceof Error) || !error.message.trim()) {
    console.error('[api]', error);
    return { status: 500, message: 'Something went wrong. Try again.' };
  }
  const message = error.message.trim();
  if (SAFE_EXACT.has(message)) {
    return { status: message === 'Sign in again.' ? 401 : 400, message };
  }
  if (LEAK_RE.test(message) || message.length > 180) {
    console.error('[api]', error);
    return { status: 500, message: 'Something went wrong. Try again.' };
  }
  // Domain throws use short plain English — keep them for UX.
  return { status: 400, message: message.slice(0, 180) };
}
