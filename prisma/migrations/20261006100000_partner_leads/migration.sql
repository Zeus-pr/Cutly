-- CreateTable
CREATE TABLE "PartnerLead" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "shopName" TEXT,
    "city" TEXT,
    "source" TEXT NOT NULL DEFAULT 'partner-with-us',
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerLead_createdAt_idx" ON "PartnerLead"("createdAt");

-- CreateIndex
CREATE INDEX "PartnerLead_phone_createdAt_idx" ON "PartnerLead"("phone", "createdAt");
