-- T3: purge job scan (raw SQL partial index; see drift notes in schema.prisma).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_purge_due_idx" ON "User" ("deletionRequestedAt") WHERE "deletedAt" IS NULL AND "deletionRequestedAt" IS NOT NULL;
