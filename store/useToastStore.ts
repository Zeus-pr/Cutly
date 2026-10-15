import { create } from 'zustand';

/** T4 (#9): one ink-pill toast at a time (spec §2 "New code sent", §08 "Email verified"). */
type ToastState = {
  message: string | null;
  icon: string | null;
  seq: number;
  show: (message: string, icon?: string) => void;
  hide: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  icon: null,
  seq: 0,
  show: (message, icon) => set((s) => ({ message, icon: icon ?? null, seq: s.seq + 1 })),
  hide: () => set({ message: null, icon: null })
}));

export function showToast(message: string, icon?: string) {
  useToastStore.getState().show(message, icon);
}
