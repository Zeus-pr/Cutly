/** Cancel / reschedule policy for confirmed visits (CJ-15). */

export const REFUND_HOURS = 12;
export const LATE_HOURS = 2;

export type CancelPolicy = {
  canModify: boolean;
  refundAdvance: boolean;
  hoursUntilStart: number;
  /** Short copy for alerts */
  refundLabel: string;
};

export function cancelPolicy(startsAt: Date, now = new Date()): CancelPolicy {
  const hoursUntilStart = (startsAt.getTime() - now.getTime()) / 3_600_000;
  const canModify = hoursUntilStart > 0;
  const refundAdvance = hoursUntilStart >= REFUND_HOURS;
  let refundLabel = 'This visit has already started.';
  if (canModify && refundAdvance) {
    refundLabel = `Full advance refund (cancel at least ${REFUND_HOURS}h before).`;
  } else if (canModify && hoursUntilStart < LATE_HOURS) {
    refundLabel = `Under ${LATE_HOURS}h left — shop keeps the advance.`;
  } else if (canModify) {
    refundLabel = `Within ${REFUND_HOURS}h of the visit — shop keeps the advance.`;
  }
  return { canModify, refundAdvance, hoursUntilStart, refundLabel };
}
