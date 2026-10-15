import { getApiBaseUrl } from '@/services/apiBase';
import { useSessionStore } from '@/store/useSessionStore';
import { apiErrorFrom } from '@/utils/deleteFlow';
import type { CodeSent, SignupStarted } from '@/utils/emailVerifyFlow';

/** T4 (#9) API calls. Errors are `ApiError` (code, attemptsRemaining, retryAfterSec). */

const OFFLINE = 'Cannot reach the CUTLY server. Check your connection and try again.';

async function request<T>(path: string, opts: { body?: unknown; auth?: boolean; reauth?: string } = {}): Promise<T> {
  const token = useSessionStore.getState().accessToken;
  if (opts.auth && !token) throw apiErrorFrom(401, { error: 'Sign in again.' });
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.auth && token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.reauth ? { 'X-Reauth-Token': opts.reauth } : {})
      },
      body: JSON.stringify(opts.body ?? {})
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiErrorFrom(response.status, payload, response.headers.get('retry-after'));
  return (payload as { data: T }).data;
}

export type SessionPayload = { token: string; user: Record<string, unknown> & { id: string }; restored?: boolean };
type ProfilePayload = { user: Record<string, unknown> };

export const emailVerify = {
  /** 202 → pending signup; an old API (SIGNUP_EMAIL_VERIFY=off) answers with a session instead. */
  startSignup: (input: { email: string; password: string; phone: string }) =>
    request<SignupStarted | SessionPayload>('/auth/signup', { body: input }),
  resendSignup: (pendingId: string) => request<SignupStarted>('/auth/signup/resend', { body: { pendingId } }),
  verifySignup: (pendingId: string, code: string) => request<SessionPayload>('/auth/signup/verify', { body: { pendingId, code } }),
  sendVerify: () => request<CodeSent>('/auth/email/verify/send', { auth: true }),
  confirmVerify: (code: string) => request<ProfilePayload>('/auth/email/verify', { auth: true, body: { code } }),
  /** Step-up for an email change; same proofs as delete, bound to action change_email. */
  reauthForChange: (proof: { code: string } | { password: string } | { googleIdToken: string }) =>
    request<{ reauthToken: string; expiresIn: number }>('/auth/reauth', { auth: true, body: { ...proof, action: 'change_email' } }),
  sendReauthSms: () => request<{ sent: true; phoneLast4: string }>('/auth/reauth/otp/send', { auth: true }),
  requestChange: (newEmail: string, reauthToken: string) =>
    request<CodeSent>('/auth/email/change', { auth: true, body: { newEmail }, reauth: reauthToken }),
  resendChange: () => request<CodeSent>('/auth/email/change/resend', { auth: true }),
  confirmChange: (code: string) =>
    request<ProfilePayload & { notifiedOldAddress: boolean }>('/auth/email/change/verify', { auth: true, body: { code } })
};
