-- Global Ops catalogue categories + Service.categoryId (CJ-71)
CREATE TABLE IF NOT EXISTS "ServiceCategory" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "gridLabel" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ServiceCategory" ("id", "label", "gridLabel", "sortOrder", "active") VALUES
  ('kids', 'Kids & Baby Care', 'Kids & Baby', 12, true),
  ('hair-essentials', 'Hair Essentials', NULL, 1, true),
  ('hair-colour', 'Hair Colour', NULL, 2, true),
  ('nail-bar', 'Nail Bar', NULL, 3, true),
  ('face', 'Face', NULL, 4, true),
  ('treatments', 'Treatments', NULL, 5, true),
  ('massage-spa', 'Massage & Spa', NULL, 6, true),
  ('mens-grooming', 'Men''s Grooming', NULL, 7, true),
  ('mani-pedi', 'Manicure & Pedicure', 'Mani & Pedi', 8, true),
  ('waxing', 'Waxing, Bleaching & Threading', 'Wax & Thread', 9, true),
  ('semi-permanent', 'Semi Permanent Make Up', 'Semi Permanent', 10, true),
  ('bridal-makeup', 'Bridal & Makeup', 'Bridal & Makeup', 11, true),
  ('tattoo', 'Tattoo', NULL, 13, true),
  ('piercing', 'Piercing', NULL, 14, true),
  ('other', 'More', NULL, 99, true)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Service"
    ADD CONSTRAINT "Service_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Service_categoryId_idx" ON "Service"("categoryId");
