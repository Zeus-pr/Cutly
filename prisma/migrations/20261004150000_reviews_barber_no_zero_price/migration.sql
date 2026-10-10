-- CJ-42: drop free (₹0) shop services
DELETE FROM "ShopService" WHERE "pricePaise" <= 0;

-- CJ-34: reviews attach to visit barber + dual ratings
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "barberId" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "barberRating" INTEGER;

-- Backfill barber from booking when possible; drop orphan reviews without a barber
UPDATE "Review" r
SET "barberId" = b."barberId",
    "barberRating" = COALESCE(r."barberRating", r."rating")
FROM "Booking" b
WHERE r."bookingId" = b.id
  AND (r."barberId" IS NULL OR r."barberRating" IS NULL);

DELETE FROM "Review" WHERE "barberId" IS NULL OR "barberRating" IS NULL;

ALTER TABLE "Review" ALTER COLUMN "barberId" SET NOT NULL;
ALTER TABLE "Review" ALTER COLUMN "barberRating" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Review_barberId_fkey'
  ) THEN
    ALTER TABLE "Review"
      ADD CONSTRAINT "Review_barberId_fkey"
      FOREIGN KEY ("barberId") REFERENCES "Barber"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Review_shopId_createdAt_idx" ON "Review"("shopId", "createdAt");
CREATE INDEX IF NOT EXISTS "Review_barberId_createdAt_idx" ON "Review"("barberId", "createdAt");
