-- Partner accept/reject gate after payment (Zomato-style)
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SHOP';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
