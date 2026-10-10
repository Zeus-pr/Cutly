-- Partner mid-day settings: open-for-appointments toggle + shop-level service timing.
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "acceptingAppointments" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ShopService" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
ALTER TABLE "ShopService" ADD COLUMN IF NOT EXISTS "bufferMinutes" INTEGER;

UPDATE "ShopService" AS ss
SET
  "durationMinutes" = COALESCE(ss."durationMinutes", s."durationMinutes"),
  "bufferMinutes" = COALESCE(ss."bufferMinutes", s."bufferMinutes", 10)
FROM "Service" AS s
WHERE ss."serviceId" = s."id";

UPDATE "ShopService"
SET "durationMinutes" = 30
WHERE "durationMinutes" IS NULL;

UPDATE "ShopService"
SET "bufferMinutes" = 10
WHERE "bufferMinutes" IS NULL;

ALTER TABLE "ShopService" ALTER COLUMN "durationMinutes" SET NOT NULL;
ALTER TABLE "ShopService" ALTER COLUMN "bufferMinutes" SET NOT NULL;
ALTER TABLE "ShopService" ALTER COLUMN "bufferMinutes" SET DEFAULT 10;
