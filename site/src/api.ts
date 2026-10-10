const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
  (typeof window !== 'undefined' && window.location.port === '5173'
    ? ''
    : 'https://api.cutly.buzz');

export type LeadPayload = {
  phone: string;
  shopName?: string;
  city?: string;
};

export async function submitPartnerLead(payload: LeadPayload) {
  const res = await fetch(`${API_BASE}/api/public/partner-leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, source: 'partner-with-us' })
  });
  const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: string };
  if (!res.ok) throw new Error(json.error || 'Could not submit. Try again.');
  return json.data;
}
