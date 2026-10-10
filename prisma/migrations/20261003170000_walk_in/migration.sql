-- CJ-23: partner walk-ins occupy barber timeline + shop capacity like bookings.
CREATE TYPE "WalkInStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "WalkIn" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "WalkInStatus" NOT NULL DEFAULT 'ACTIVE',
    "guestName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalkIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalkIn_barberId_startsAt_endsAt_idx" ON "WalkIn"("barberId", "startsAt", "endsAt");
CREATE INDEX "WalkIn_shopId_startsAt_idx" ON "WalkIn"("shopId", "startsAt");

ALTER TABLE "WalkIn" ADD CONSTRAINT "WalkIn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalkIn" ADD CONSTRAINT "WalkIn_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "WalkIn"
  ADD CONSTRAINT "walk_in_barber_no_overlap"
  EXCLUDE USING gist (
    "barberId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (status = 'ACTIVE');
