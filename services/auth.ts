import { useSessionStore } from '@/store/useSessionStore';

const base = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.0.2.2:4000/api';

type SessionUser = { id: string; email: string | null; phone: string | null; name: string | null };

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('Cannot reach the CUTLY server. Start it with npm run backend:dev.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload.data as T;
}

function save(session: { token: string; user: SessionUser }) {
  useSessionStore.getState().setSession(session.token, session.user.phone || '', session.user.email, session.user.name);
}

export async function refreshProfile() {
  const token = useSessionStore.getState().accessToken;
  if (!token) return;
  try {
    const response = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return;
    const user = payload.data as SessionUser;
    useSessionStore.getState().setProfile(user);
  } catch {
    // Keep the name already stored on the device.
  }
}

export async function updateProfileName(name: string) {
  const token = useSessionStore.getState().accessToken;
  if (!token) throw new Error('Sign in again.');
  let response: Response;
  try {
    response = await fetch(`${base}/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name })
    });
  } catch {
    throw new Error('Cannot reach the CUTLY server. Start it with npm run backend:dev.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not save your name.');
  const user = payload.data as SessionUser;
  useSessionStore.getState().setProfile(user);
}

export const auth = {
  signUp: async (email: string, password: string) => save(await post('/auth/signup', { email, password })),
  signIn: async (email: string, password: string) => save(await post('/auth/login', { email, password })),
  google: async (idToken: string) => save(await post('/auth/google', { idToken })),
  sendOtp: (phone: string) => post<{ sent: boolean }>('/auth/otp/send', { phone }),
  verifyOtp: async (phone: string, code: string) => save(await post('/auth/otp/verify', { phone, code }))
};
