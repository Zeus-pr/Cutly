-- T3: purge job scan (raw SQL partial index; see drift notes in schema.prisma).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Partner_purge_due_idx" ON "Partner" ("deletionRequestedAt") WHERE "deletedAt" IS NULL AND "deletionRequestedAt" IS NOT NULL;
