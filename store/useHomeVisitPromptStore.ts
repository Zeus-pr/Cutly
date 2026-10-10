import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'cutly.homeVisit.dismissedReviews';

type State = {
  hydrated: boolean;
  dismissedReviewIds: string[];
  hydrate: () => Promise<void>;
  dismissReviewPrompt: (bookingId: string) => void;
  isReviewDismissed: (bookingId: string) => boolean;
};

async function persist(ids: string[]) {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(ids.slice(-40)));
  } catch {
    /* ignore */
  }
}

export const useHomeVisitPromptStore = create<State>((set, get) => ({
  hydrated: false,
  dismissedReviewIds: [],
  hydrate: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
      set({ dismissedReviewIds: ids, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  dismissReviewPrompt: (bookingId) => {
    const id = bookingId.trim();
    if (!id) return;
    const next = [...new Set([...get().dismissedReviewIds, id])].slice(-40);
    set({ dismissedReviewIds: next });
    void persist(next);
  },
  isReviewDismissed: (bookingId) => get().dismissedReviewIds.includes(bookingId)
}));
