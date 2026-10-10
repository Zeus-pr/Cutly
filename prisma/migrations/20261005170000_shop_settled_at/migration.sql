-- Partner "Paid at shop" settlement timestamp (CJ-39 shop-side balance collect).
ALTER TABLE "BookingPayment" ADD COLUMN IF NOT EXISTS "shopSettledAt" TIMESTAMP(3);
