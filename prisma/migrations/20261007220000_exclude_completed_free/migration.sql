-- Free the chair after Done so Any-barber / early-finish can rebook the same window.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_barber_no_overlap";

ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_barber_no_overlap"
  EXCLUDE USING gist (
    "barberId" WITH =,
    tsrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (status NOT IN ('CANCELLED', 'EXPIRED', 'FAILED', 'NO_SHOW', 'REJECTED', 'COMPLETED'));
