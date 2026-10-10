export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type HourDayDraft = {
  weekday: number;
  open: boolean;
  opensAt: string;
  closesAt: string;
};

export function defaultHourDrafts(): HourDayDraft[] {
  return WEEKDAY_LABELS.map((_, weekday) => ({
    weekday,
    open: true,
    opensAt: '10:00',
    closesAt: '21:00'
  }));
}

export function draftsFromApiDays(days: { weekday: number; opensAt: string; closesAt: string }[]): HourDayDraft[] {
  const by = new Map(days.map((d) => [d.weekday, d]));
  return WEEKDAY_LABELS.map((_, weekday) => {
    const row = by.get(weekday);
    return {
      weekday,
      open: Boolean(row),
      opensAt: row?.opensAt?.slice(0, 5) || '10:00',
      closesAt: row?.closesAt?.slice(0, 5) || '21:00'
    };
  });
}

/** Open days only — closed = omitted (PS-02). Values stored as 24h HH:mm for API. */
export function draftsToApiDays(drafts: HourDayDraft[]) {
  return drafts
    .filter((d) => d.open)
    .map((d) => {
      const opens = d.opensAt.trim().match(/^(\d{1,2}):(\d{2})$/);
      const closes = d.closesAt.trim().match(/^(\d{1,2}):(\d{2})$/);
      const opensAt = opens
        ? `${String(Math.min(23, Number(opens[1]))).padStart(2, '0')}:${opens[2]}`
        : '10:00';
      const closesAt = closes
        ? `${String(Math.min(23, Number(closes[1]))).padStart(2, '0')}:${closes[2]}`
        : '21:00';
      return { weekday: d.weekday, opensAt, closesAt };
    });
}
