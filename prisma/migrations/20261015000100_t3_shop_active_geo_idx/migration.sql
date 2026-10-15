-- T3: listing geo scan over active shops only. Raw SQL partial index (not expressible in Prisma; see drift notes in schema.prisma).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Shop_active_lat_lng_idx" ON "Shop" ("latitude", "longitude") WHERE "status" = 'ACTIVE';
