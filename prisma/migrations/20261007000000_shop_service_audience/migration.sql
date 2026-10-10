-- AlterTable
ALTER TABLE "ShopService" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'UNISEX';

-- Backfill from service names (keep in sync with backend/src/serviceAudience.ts)
UPDATE "ShopService" ss
SET "audience" = CASE
  WHEN s."name" ~* '(kids|baby|child)' THEN 'KIDS'
  WHEN s."name" !~* 'women' AND s."name" ~* '((^|[^a-z])men(''?s)?([^a-z]|$)|beard|shave)' THEN 'MEN'
  WHEN s."name" ~* '(bridal|lash|makeup|women)' THEN 'WOMEN'
  ELSE 'UNISEX'
END
FROM "Service" s
WHERE s."id" = ss."serviceId";
