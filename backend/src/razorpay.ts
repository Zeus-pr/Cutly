import crypto from 'crypto';
import Razorpay from 'razorpay';

/** Flip via PAYMENT_PROVIDER=none|off to skip checkout (direct → AWAITING_SHOP). */
export function paymentsEnabled() {
  const provider = (process.env.PAYMENT_PROVIDER || 'razorpay').trim().toLowerCase();
  if (provider === 'none' || provider === 'off' || provider === 'false' || provider === '0') return false;
  return razorpayConfigured();
}

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
}

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim() || '';
  if (!keyId || !keySecret) throw new Error('Razorpay test keys are missing in .env');
  return { keyId, keySecret };
}

export function razorpayClient() {
  const { keyId, keySecret } = credentials();
  return {
    keyId,
    client: new Razorpay({ key_id: keyId, key_secret: keySecret })
  };
}

export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  if (input.amountPaise < 100) throw new Error('Advance must be at least ₹1 for Razorpay test checkout.');
  const { client, keyId } = razorpayClient();
  const order = await client.orders.create({
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt.slice(0, 40),
    notes: input.notes,
    payment_capture: true
  });
  return {
    keyId,
    orderId: String(order.id),
    amountPaise: input.amountPaise,
    currency: 'INR' as const
  };
}

export function verifyRazorpaySignature(input: { orderId: string; paymentId: string; signature: string }) {
  const { keySecret } = credentials();
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest('hex');
  return expected === input.signature;
}
