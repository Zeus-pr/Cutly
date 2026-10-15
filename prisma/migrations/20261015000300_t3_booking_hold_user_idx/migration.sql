-- T3: release holds on delete request without a full scan. Mirrors @@index([userId]).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "BookingHold_userId_idx" ON "BookingHold" ("userId");
