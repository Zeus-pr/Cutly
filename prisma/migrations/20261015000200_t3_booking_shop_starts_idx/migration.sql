-- T3: partner delete upcoming-bookings check + shop floor queries. Mirrors @@index([shopId, startsAt]).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Booking_shopId_startsAt_idx" ON "Booking" ("shopId", "startsAt");
