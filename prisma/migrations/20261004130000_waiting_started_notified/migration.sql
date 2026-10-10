-- AlterTable
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "waitingStartedNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_status_startsAt_idx" ON "Booking"("status", "startsAt");
