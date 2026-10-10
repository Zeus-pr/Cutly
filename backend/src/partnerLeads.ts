import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { sendPartnerLeadEmail } from './mail';

const prisma = new PrismaClient();

export type PartnerLeadInput = {
  phone: string;
  shopName?: string;
  city?: string;
  source?: string;
  userAgent?: string | null;
  ip?: string | null;
};

/** Normalize Indian mobile → +91XXXXXXXXXX */
export function normalizeIndiaPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('91') && local.length === 12) local = local.slice(2);
  if (local.startsWith('0') && local.length === 11) local = local.slice(1);
  if (local.length !== 10 || !/^[6-9]/.test(local)) return null;
  return `+91${local}`;
}

function hashIp(ip: string | null | undefined) {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

export async function createPartnerLead(input: PartnerLeadInput) {
  const phone = normalizeIndiaPhone(input.phone);
  if (!phone) throw new Error('Enter a valid 10-digit Indian mobile number.');

  const shopName = input.shopName?.trim().slice(0, 120) || null;
  const city = input.city?.trim().slice(0, 80) || null;
  const source = (input.source || 'partner-with-us').slice(0, 64);

  const lead = await prisma.partnerLead.create({
    data: {
      phone,
      shopName,
      city,
      source,
      userAgent: input.userAgent?.slice(0, 280) || null,
      ipHash: hashIp(input.ip)
    }
  });

  const mail = await sendPartnerLeadEmail({
    leadId: lead.id,
    phone: lead.phone,
    shopName: lead.shopName,
    city: lead.city
  });

  return {
    id: lead.id,
    phone: lead.phone,
    shopName: lead.shopName,
    city: lead.city,
    emailSent: mail.sent
  };
}
