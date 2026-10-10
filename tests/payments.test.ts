import { afterEach, describe, expect, it } from 'vitest';
import { paymentsEnabled, razorpayConfigured } from '../backend/src/razorpay';

const keys = {
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET
};

afterEach(() => {
  if (keys.PAYMENT_PROVIDER === undefined) delete process.env.PAYMENT_PROVIDER;
  else process.env.PAYMENT_PROVIDER = keys.PAYMENT_PROVIDER;
  if (keys.RAZORPAY_KEY_ID === undefined) delete process.env.RAZORPAY_KEY_ID;
  else process.env.RAZORPAY_KEY_ID = keys.RAZORPAY_KEY_ID;
  if (keys.RAZORPAY_KEY_SECRET === undefined) delete process.env.RAZORPAY_KEY_SECRET;
  else process.env.RAZORPAY_KEY_SECRET = keys.RAZORPAY_KEY_SECRET;
});

describe('payments gate', () => {
  it('turns off for PAYMENT_PROVIDER=none even with keys', () => {
    process.env.PAYMENT_PROVIDER = 'none';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    expect(razorpayConfigured()).toBe(true);
    expect(paymentsEnabled()).toBe(false);
  });

  it('enables when provider is razorpay and keys exist', () => {
    process.env.PAYMENT_PROVIDER = 'razorpay';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
    process.env.RAZORPAY_KEY_SECRET = 'secret';
    expect(paymentsEnabled()).toBe(true);
  });

  it('stays off when keys missing', () => {
    process.env.PAYMENT_PROVIDER = 'razorpay';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(paymentsEnabled()).toBe(false);
  });
});
