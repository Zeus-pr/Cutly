/** Partner may mark No-show / reschedule after slot start + this grace. */
export const NO_SHOW_GRACE_MS = 5 * 60 * 1000;

export function noShowAvailableAt(startsAt: Date) {
  return new Date(startsAt.getTime() + NO_SHOW_GRACE_MS);
}

export function canMarkNoShow(startsAt: Date, now = new Date()) {
  return now.getTime() >= noShowAvailableAt(startsAt).getTime();
}
