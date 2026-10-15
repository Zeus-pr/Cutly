-- T3 delete-account (#8): additive columns only. Indexes on existing big tables live in
-- the following CONCURRENTLY-only migrations (one statement per file so Postgres does
-- not run them inside a transaction block).

-- Shop lifecycle
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

ALTER TABLE "Shop"
  ADD COLUMN "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Backfill (DBA): isActive=false shops become PAUSED. isActive stays in sync for one release.
UPDATE "Shop" SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"ShopStatus" ELSE 'PAUSED'::"ShopStatus" END;

-- Soft delete + session revocation
ALTER TABLE "User"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Partner"
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Abuse-check identity hash, kept 12 months (new, empty table: plain indexes are fine here)
CREATE TABLE "DeletedIdentity" (
    "id" TEXT NOT NULL,
    "phoneHmac" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    CONSTRAINT "DeletedIdentity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeletedIdentity_phoneHmac_idx" ON "DeletedIdentity"("phoneHmac");
CREATE INDEX "DeletedIdentity_deletedAt_idx" ON "DeletedIdentity"("deletedAt");

-- One-time step-up (re-auth) grants for account deletion (new, empty table)
CREATE TABLE "ReauthGrant" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReauthGrant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReauthGrant_expiresAt_idx" ON "ReauthGrant"("expiresAt");
