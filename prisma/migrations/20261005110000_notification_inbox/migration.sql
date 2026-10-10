-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "data" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
