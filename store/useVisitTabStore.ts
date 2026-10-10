import { create } from 'zustand';
import type { VisitTabId } from '@/utils/visitTabs';

type VisitTabState = {
  tab: VisitTabId;
  setTab: (tab: VisitTabId) => void;
};

/** Remembers the My Visits chip while a booking detail is open on top of the list. */
export const useVisitTabStore = create<VisitTabState>((set) => ({
  tab: 'awaiting',
  setTab: (tab) => set({ tab })
}));

export function isVisitTab(value: unknown): value is VisitTabId {
  return (
    value === 'awaiting' ||
    value === 'today' ||
    value === 'upcoming' ||
    value === 'served' ||
    value === 'cancelled'
  );
}
