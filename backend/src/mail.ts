/** Thin Resend wrapper — partner leads. No-op (warn) when RESEND_API_KEY missing. */

export type LeadMailInput = {
  phone: string;
  shopName?: string | null;
  city?: string | null;
  leadId: string;
};

export async function sendPartnerLeadEmail(input: LeadMailInput): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = (process.env.PARTNER_LEAD_TO || 'prajeshchoudhury@gmail.com').trim();
  const from = (process.env.RESEND_FROM || 'CutLy Leads <onboarding@resend.dev>').trim();

  if (!apiKey) {
    console.warn('[mail] RESEND_API_KEY unset — partner lead saved but email skipped', input.leadId);
    return { sent: false, reason: 'RESEND_API_KEY unset' };
  }

  const shop = input.shopName?.trim() || '—';
  const city = input.city?.trim() || '—';
  const subject = `CutLy partner lead · ${input.phone}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#17263C">
      <h2 style="margin:0 0 12px">New Partner With Us lead</h2>
      <p><strong>Phone:</strong> ${escapeHtml(input.phone)}</p>
      <p><strong>Shop:</strong> ${escapeHtml(shop)}</p>
      <p><strong>City:</strong> ${escapeHtml(city)}</p>
      <p style="color:#667386;font-size:13px">Lead id: ${escapeHtml(input.leadId)}</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[mail] Resend failed', res.status, body);
    return { sent: false, reason: `Resend ${res.status}` };
  }
  return { sent: true };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
