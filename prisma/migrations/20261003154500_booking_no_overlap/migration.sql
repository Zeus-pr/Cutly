-- CJ-04: prevent overlapping active bookings/holds on the same barber (Postgres EXCLUDE).
-- Columns are TIMESTAMP(3) without time zone → use tsrange (not tstzrange).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_barber_no_overlap"
  EXCLUDE USING gist (
    "barberId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (status NOT IN ('CANCELLED', 'EXPIRED', 'FAILED'));

-- All hold rows participate; callers must delete expired holds before insert.
ALTER TABLE "BookingHold"
  ADD CONSTRAINT "hold_barber_no_overlap"
  EXCLUDE USING gist (
    "barberId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  );
