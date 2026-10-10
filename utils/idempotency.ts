/** Client booking intent key (CJ-12 / CJ-13). Server prefixes with user id. */
export function bookingIntentKey(input: {
  shopId: string;
  serviceId: string;
  barberId: string;
  startsAt: string;
}): string {
  return `${input.shopId}_${input.serviceId}_${input.barberId}_${input.startsAt}`;
}
