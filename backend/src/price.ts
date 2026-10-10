/** CJ-42 — services must be paid; ₹0 not allowed. */
export const MIN_SERVICE_PRICE_PAISE = 1;

export function assertPaidPricePaise(pricePaise: number, label = 'Service') {
  if (!Number.isFinite(pricePaise) || pricePaise < MIN_SERVICE_PRICE_PAISE) {
    throw new Error(`${label} price must be at least ₹1.`);
  }
}
