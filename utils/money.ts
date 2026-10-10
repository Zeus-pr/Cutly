/** Display helper — amounts shown before pay must match server `advancePaiseFromTotal` (CJ-02). */
export const formatINR = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** Same formula as `backend/src/money.ts` — Razorpay charge uses server value. */
export const advanceFor = (totalPaise: number) => {
  if (!Number.isFinite(totalPaise) || totalPaise <= 0) return 0;
  return Math.round(totalPaise * 0.3);
};
