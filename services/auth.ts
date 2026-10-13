import { getApiBaseUrl } from '@/services/apiBase';
import { useSessionStore } from '@/store/useSessionStore';

function apiBase() {
  return getApiBaseUrl();
}

type SessionUser = {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  googleLinked?: boolean;
};

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
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
  const user = session.user;
  useSessionStore.getState().setSession(session.token, user.phone || '', user.email, user.name);
  useSessionStore.getState().setProfile({
    phone: user.phone,
    email: user.email,
    name: user.name,
    gender: user.gender ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    googleLinked: Boolean(user.googleLinked)
  });
}

/** Pull the account from the server so every phone on this number shares one profile. */
export async function refreshProfile(): Promise<'ok' | 'unauthorized' | 'offline'> {
  const token = useSessionStore.getState().accessToken;
  if (!token) return 'unauthorized';
  try {
    const response = await fetch(`${apiBase()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) return 'unauthorized';
    if (!response.ok) return 'offline';
    const user = payload.data as SessionUser;
    useSessionStore.getState().setProfile(user);
    return 'ok';
  } catch {
    return 'offline';
  }
}

export function dropExpiredSession() {
  const session = useSessionStore.getState();
  session.clear();
  session.passLaunch();
}

export async function updateProfileName(name: string) {
  return updateProfile({ name });
}

export async function updateProfile(input: {
  name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  inviteCode?: string;
}) {
  const token = useSessionStore.getState().accessToken;
  if (!token) throw new Error('Sign in again.');
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(input)
    });
  } catch {
    throw new Error('Cannot reach the CUTLY server. Start it with npm run backend:dev.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not save profile.');
  const user = payload.data as SessionUser;
  useSessionStore.getState().setProfile(user);
}

export async function deleteAccount() {
  const token = useSessionStore.getState().accessToken;
  if (!token) throw new Error('Sign in again.');
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new Error('Cannot reach the CUTLY server. Start it with npm run backend:dev.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not delete account.');
}

export const auth = {
  signUp: async (email: string, password: string, phone: string) =>
    save(await post('/auth/signup', { email, password, phone })),
  signIn: async (email: string, password: string) => save(await post('/auth/login', { email, password })),
  google: async (idToken: string) => save(await post('/auth/google', { idToken })),
  linkGoogle: async (idToken: string) => {
    const token = useSessionStore.getState().accessToken;
    if (!token) throw new Error('Sign in again.');
    return save(await post('/auth/google', { idToken }, token));
  },
  sendOtp: (phone: string) => post<{ sent: boolean }>('/auth/otp/send', { phone }),
  verifyOtp: async (phone: string, code: string) => save(await post('/auth/otp/verify', { phone, code }))
};
