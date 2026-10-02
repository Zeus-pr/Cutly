CREATE TYPE "ShopKind" AS ENUM ('BARBER', 'SALON', 'PARLOUR', 'TATTOO', 'PIERCING');

CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Partner_phone_key" ON "Partner"("phone");
CREATE UNIQUE INDEX "Partner_email_key" ON "Partner"("email");
CREATE UNIQUE INDEX "Partner_googleSub_key" ON "Partner"("googleSub");

ALTER TABLE "Shop" ADD COLUMN "ownerPartnerId" TEXT;
ALTER TABLE "Shop" ADD COLUMN "kind" "ShopKind";
ALTER TABLE "Shop" ADD COLUMN "chairCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Shop" ADD COLUMN "setupDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "Shop_ownerPartnerId_key" ON "Shop"("ownerPartnerId");

ALTER TABLE "Shop" ADD CONSTRAINT "Shop_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ShopDayCapacity" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "workersPresent" INTEGER NOT NULL,
    "chairsInUse" INTEGER NOT NULL,

    CONSTRAINT "ShopDayCapacity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopDayCapacity_shopId_date_key" ON "ShopDayCapacity"("shopId", "date");

ALTER TABLE "ShopDayCapacity" ADD CONSTRAINT "ShopDayCapacity_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Service" ADD COLUMN "kind" "ShopKind";
