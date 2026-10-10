ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "kinds" "ShopKind"[] DEFAULT ARRAY[]::"ShopKind"[];
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "productBrands" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "Shop"
SET "kinds" = ARRAY["kind"]::"ShopKind"[]
WHERE "kind" IS NOT NULL AND cardinality("kinds") = 0;
