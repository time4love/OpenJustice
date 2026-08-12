// Supabase Auth via REST API — no @supabase/ssr or @supabase/supabase-js.
// Session is stored in localStorage under SESSION_KEY.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const SESSION_KEY = 'bf_session';

export interface BFSession {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string };
}

export function getSession(): BFSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as BFSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: BFSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function authHeaders(accessToken?: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function signIn(email: string, password: string): Promise<{ error: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error_description?: string; msg?: string };
    return { error: body.error_description ?? body.msg ?? 'Authentication failed' };
  }
  saveSession(await res.json() as BFSession);
  return { error: null };
}

export async function signUp(email: string, password: string): Promise<{ hasSession: boolean; error: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error_description?: string; msg?: string };
    return { hasSession: false, error: body.error_description ?? body.msg ?? 'Registration failed' };
  }
  const data = await res.json() as Partial<BFSession>;
  if (data.access_token) {
    saveSession(data as BFSession);
    return { hasSession: true, error: null };
  }
  return { hasSession: false, error: null };
}

export async function signOut(): Promise<void> {
  const session = getSession();
  if (session) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: authHeaders(session.access_token),
    }).catch(() => {});
  }
  clearSession();
}
