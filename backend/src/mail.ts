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

// ---------------------------------------------------------------------------
// T4 (#9): transactional mail behind a small interface so the provider can change later
// (Cloudflare Email Service only changes the records on notify.cutly.buzz).

export type TransactionalMail = { to: string; subject: string; text: string; html: string; tag: string };
export type EmailSender = (mail: TransactionalMail) => Promise<{ sent: boolean; reason?: string }>;

/** NE: strict DMARC alignment → From must be exactly no-reply@notify.cutly.buzz. No Reply-To for now. */
export const DEFAULT_EMAIL_FROM = 'CutLy <no-reply@notify.cutly.buzz>';

function maskTo(to: string) {
  const at = to.lastIndexOf('@');
  return at < 1 ? '***' : `${to[0]}***${to.slice(at)}`;
}

/**
 * EMAIL_TRANSPORT=log prints a line instead of sending (Expo Go testing). The message body
 * (which holds the code) is printed only when NODE_ENV=development. Never logs the code otherwise.
 */
export const sendTransactional: EmailSender = async (mail) => {
  const transport = (process.env.EMAIL_TRANSPORT || 'resend').trim().toLowerCase();
  if (transport === 'log') {
    const dev = process.env.NODE_ENV === 'development';
    console.log(`[mail:log] ${mail.tag} to ${maskTo(mail.to)}${dev ? ` · ${mail.text.split('\n')[0]}` : ''}`);
    return { sent: true };
  }
  // T4 mail uses its own key. RESEND_API_KEY belongs to the partner contact form (sendPartnerLeadEmail).
  const apiKey = process.env.RESEND_VERIFY_API_KEY?.trim();
  if (!apiKey) {
    console.error('[mail] RESEND_VERIFY_API_KEY unset; transactional mail not sent', mail.tag);
    return { sent: false, reason: 'RESEND_VERIFY_API_KEY unset' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: (process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM).trim(),
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        tags: [{ name: 'type', value: mail.tag }]
      })
    });
    if (!res.ok) {
      console.error('[mail] Resend failed', res.status, mail.tag);
      return { sent: false, reason: `Resend ${res.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error('[mail] Resend unreachable', mail.tag, error instanceof Error ? error.message : '');
    return { sent: false, reason: 'network' };
  }
};

function wrap(body: string) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#17263C;max-width:480px">${body}<p style="color:#667386;font-size:13px">CutLy · cutly.buzz</p></div>`;
}

export function codeMail(to: string, code: string, purpose: 'signup_verify' | 'verify_existing' | 'email_change'): TransactionalMail {
  const lead =
    purpose === 'email_change' ? 'Use this code to confirm your new CutLy email.' : 'Use this code to confirm your email on CutLy.';
  return {
    to,
    tag: purpose,
    subject: `${code} is your CutLy code`,
    text: `${code} is your CutLy code.\n\n${lead} It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
    html: wrap(
      `<p>${lead}</p><p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p><p>It expires in 10 minutes. If you didn't ask for this, you can ignore this email.</p>`
    )
  };
}

/** Design §9.10: sent instead of a code when a verified account already owns the address. */
export function signupNoticeMail(to: string): TransactionalMail {
  return {
    to,
    tag: 'signup_notice',
    subject: 'Someone tried to sign up with your email',
    text: "Someone tried to create a CutLy account with this email. You already have one, so no new account was made.\n\nIf it was you, just sign in. If it wasn't, you can ignore this email.",
    html: wrap(
      "<p>Someone tried to create a CutLy account with this email. You already have one, so no new account was made.</p><p>If it was you, just sign in. If it wasn't, you can ignore this email.</p>"
    )
  };
}

/** Design §8: notice to the OLD verified address after an email change. */
export function emailChangedMail(to: string, maskedNew: string): TransactionalMail {
  return {
    to,
    tag: 'email_changed',
    subject: 'Your CutLy email was changed',
    text: `Your CutLy email was changed to ${maskedNew}.\n\nNot you? Contact CutLy support from the app.`,
    html: wrap(`<p>Your CutLy email was changed to <strong>${escapeHtml(maskedNew)}</strong>.</p><p>Not you? Contact CutLy support from the app.</p>`)
  };
}
