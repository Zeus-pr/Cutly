-- Pause new bookings until end of today's shop hours (partner "close for today").
ALTER TABLE "Shop" ADD COLUMN "acceptingPausedUntil" TIMESTAMP(3);
