-- CreateTable
CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "pendingSignupId" TEXT,
    "emailNorm" TEXT NOT NULL,
    "codeHmac" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "emailNorm" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailRelease" (
    "id" TEXT NOT NULL,
    "emailHmac" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "emailHmac" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailCode_emailNorm_createdAt_idx" ON "EmailCode"("emailNorm", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailCode_expiresAt_idx" ON "EmailCode"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailCode_userId_purpose_idx" ON "EmailCode"("userId", "purpose");

-- CreateIndex
CREATE INDEX "EmailCode_pendingSignupId_purpose_idx" ON "EmailCode"("pendingSignupId", "purpose");

-- CreateIndex
CREATE INDEX "PendingSignup_expiresAt_idx" ON "PendingSignup"("expiresAt");

-- CreateIndex
CREATE INDEX "PendingSignup_emailNorm_idx" ON "PendingSignup"("emailNorm");

-- CreateIndex
CREATE INDEX "EmailRelease_emailHmac_idx" ON "EmailRelease"("emailHmac");

-- CreateIndex
CREATE INDEX "EmailRelease_createdAt_idx" ON "EmailRelease"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_emailHmac_key" ON "EmailSuppression"("emailHmac");
