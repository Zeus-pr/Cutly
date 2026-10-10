-- CJ-25: partner Expo push token
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "pushToken" TEXT;

-- CJ-11: default turnover buffer on existing catalogue services (skip free consultations)
UPDATE "Service"
SET "bufferMinutes" = 10
WHERE "bufferMinutes" = 0
  AND lower("name") NOT LIKE '%consultation%';
