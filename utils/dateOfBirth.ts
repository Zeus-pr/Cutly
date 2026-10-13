const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date in India, so the 13+ check does not depend on the server clock zone. */
export function istYmd(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { y: read('year'), m: read('month'), d: read('day') };
}

export function ageInYears(iso: string, now = new Date()) {
  const match = ISO.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  const today = istYmd(now);
  let age = today.y - y;
  if (today.m < m || (today.m === m && today.d < d)) age -= 1;
  return age;
}

export function assertDateOfBirth(iso: string, now = new Date()) {
  const age = ageInYears(iso, now);
  if (age == null || age > 120) throw new Error('Pick your date of birth.');
  if (age < 13) throw new Error('You need to be 13 or older.');
  return iso;
}

export function isoFromLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localDateFromIso(iso: string) {
  const match = ISO.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatDobLabel(iso: string) {
  const date = localDateFromIso(iso);
  if (!date) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function shiftYears(years: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setFullYear(date.getFullYear() - years);
  return date;
}

/** Latest birthday that is already 13, and the oldest date the picker offers. */
export function dobPickerBounds() {
  return { minimumDate: shiftYears(120), maximumDate: shiftYears(13) };
}

export function defaultDobDraft() {
  return shiftYears(18);
}
