import type { PartnerShop } from '@/services/partner';

/** Whether the partner Home switch should show “open for appointments”. */
export function isPartnerBookableNow(shop: Pick<PartnerShop, 'acceptingAppointments' | 'acceptingPausedUntil'> & { status?: PartnerShop['status'] }) {
  // #46 P3: a shop restored after a cancelled deletion is PAUSED until the partner opens it.
  if (shop.status && shop.status !== 'ACTIVE') return false;
  if (shop.acceptingAppointments === false) return false;
  if (shop.acceptingPausedUntil) {
    const until = new Date(shop.acceptingPausedUntil).getTime();
    if (Number.isFinite(until) && Date.now() < until) return false;
  }
  return true;
}

export function partnerAcceptingCopy(shop: Pick<PartnerShop, 'acceptingAppointments' | 'acceptingPausedUntil'> & { status?: PartnerShop['status'] }): {
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
  if (shop.status === 'PAUSED' || shop.status === 'CLOSED') {
    return {
      kicker: 'Not taking appointments',
      body: 'Your shop is paused. Turn bookings back on when you’re ready.'
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
