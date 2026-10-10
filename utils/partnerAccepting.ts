import type { PartnerShop } from '@/services/partner';

/** Whether the partner Home switch should show “open for appointments”. */
export function isPartnerBookableNow(shop: Pick<PartnerShop, 'acceptingAppointments' | 'acceptingPausedUntil'>) {
  if (shop.acceptingAppointments === false) return false;
  if (shop.acceptingPausedUntil) {
    const until = new Date(shop.acceptingPausedUntil).getTime();
    if (Number.isFinite(until) && Date.now() < until) return false;
  }
  return true;
}

export function partnerAcceptingCopy(shop: Pick<PartnerShop, 'acceptingAppointments' | 'acceptingPausedUntil'>): {
  kicker: string;
  body: string;
} {
  const bookable = isPartnerBookableNow(shop);
  if (bookable) {
    return {
      kicker: 'Open for appointments',
      body: 'Customers can book within your open hours.'
    };
  }
  const pausedToday =
    shop.acceptingAppointments !== false &&
    shop.acceptingPausedUntil &&
    new Date(shop.acceptingPausedUntil).getTime() > Date.now();
  if (pausedToday) {
    return {
      kicker: 'Closed for bookings today',
      body: 'No new bookings for today until closing time. Tomorrow stays bookable. Floor visits keep running.'
    };
  }
  return {
    kicker: 'Not taking appointments',
    body: 'You’re listed as closed until you turn this back on. Existing Floor visits keep running.'
  };
}
