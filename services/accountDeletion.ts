import { getApiBaseUrl } from '@/services/apiBase';
import { useSessionStore } from '@/store/useSessionStore';
import { apiErrorFrom } from '@/utils/deleteFlow';

/**
 * #46 delete-account API (customer + partner). Errors are `ApiError` with the server's
 * `code` (REAUTH_FAILED, RATE_LIMITED, VISIT_IN_PROGRESS, UPCOMING_BOOKINGS, …) so the
 * screens can branch on it — see utils/deleteFlow.ts.
 */

type Audience = 'customer' | 'partner';

export type ReauthProof = { code: string } | { password: string } | { googleIdToken: string };
export type ReauthGrant = { reauthToken: string; expiresIn: number };
export type CustomerDeleteResult = {
  deleted: true;
  deletionRequestedAt: string;
  restoreBefore: string;
  cancelledBookings: number;
  refundedBookingIds: string[];
};
export type PartnerDeleteResult = { deleted: true; deletionRequestedAt: string; restoreBefore: string };

const OFFLINE = 'Cannot reach the CUTLY server. Check your connection and try again.';

export async function deletionRequest<T>(audience: Audience, path: string, init: RequestInit = {}): Promise<T> {
  const state = useSessionStore.getState();
  const token = audience === 'partner' ? state.partnerToken : state.accessToken;
  if (!token) throw apiErrorFrom(401, { error: 'Sign in again.' });
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers || {})
      }
    });
  } catch {
    throw new Error(OFFLINE);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiErrorFrom(response.status, payload, response.headers.get('retry-after'));
  return (payload as { data: T }).data;
}

export const customerDeletion = {
  /** SMS to the signed-in account's own phone; its own rate limit (not the login bucket). */
  sendCode: () => deletionRequest<{ sent: true; phoneLast4: string }>('customer', '/auth/reauth/otp/send', { method: 'POST' }),
  reauth: (proof: ReauthProof) =>
    deletionRequest<ReauthGrant>('customer', '/auth/reauth', { method: 'POST', body: JSON.stringify(proof) }),
  deleteAccount: (reauthToken: string) =>
    deletionRequest<CustomerDeleteResult>('customer', '/auth/account', {
      method: 'DELETE',
      headers: { 'X-Reauth-Token': reauthToken }
    })
};

export const partnerDeletion = {
  reauth: (proof: ReauthProof) =>
    deletionRequest<ReauthGrant>('partner', '/partner/reauth', { method: 'POST', body: JSON.stringify(proof) }),
  deleteAccount: (reauthToken: string) =>
    deletionRequest<PartnerDeleteResult>('partner', '/partner/account', {
      method: 'DELETE',
      headers: { 'X-Reauth-Token': reauthToken }
    })
};

/** Re-auth, then DELETE straight away (the grant lasts 300 s and is single-use). */
export async function confirmAndDeleteCustomer(proof: ReauthProof) {
  const grant = await customerDeletion.reauth(proof);
  return customerDeletion.deleteAccount(grant.reauthToken);
}

export async function confirmAndDeletePartner(password: string) {
  const grant = await partnerDeletion.reauth({ password });
  return partnerDeletion.deleteAccount(grant.reauthToken);
}
