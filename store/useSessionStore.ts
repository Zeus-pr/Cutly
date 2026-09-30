import { create } from 'zustand';
type SessionState = { accessToken: string | null; phone: string | null; setSession: (token: string, phone: string) => void; clear: () => void };
export const useSessionStore = create<SessionState>((set) => ({ accessToken: null, phone: null, setSession: (accessToken, phone) => set({ accessToken, phone }), clear: () => set({ accessToken: null, phone: null }) }));
