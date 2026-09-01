/**
 * The signed-in session, and the one place that keeps it alive.
 *
 * Supabase issues an access token that expires in an hour and a refresh token
 * that renews it. Until now the redirect fragment's `refresh_token` and
 * `expires_in` were read and DISCARDED, so a session simply died after an hour
 * and the only recovery was a fresh magic link. That cost four interrupted
 * sessions in one working day, and each one presented as a broken page rather
 * than a signed-out one.
 *
 * Two properties this module exists to guarantee:
 *
 * ONE IN-FLIGHT REFRESH, EVER. Supabase ROTATES the refresh token on use: the
 * old one is void the moment a new one is issued. Two concurrent refreshes
 * therefore race, and the loser holds a token the server has already revoked —
 * which signs the researcher out precisely when the app was trying hardest to
 * keep them in. Callers share one promise instead.
 *
 * THE STORED TOKEN IS THE TOKEN EVERYONE READS. `authHeaders()` is synchronous
 * and has thirteen callers; making it async would push a refresh into every
 * call site. So the refresh is PROACTIVE — scheduled ahead of expiry — and what
 * is in storage is what is valid. `fetchJson` still retries once on a 401 for
 * the request that races the boundary, but that is a backstop, not the design.
 */

export interface StoredSession {
  accessToken: string;
  /** Absent for a session restored from the pre-refresh storage format. */
  refreshToken: string | null;
  /** Epoch ms. Absent when the issuer did not say, which is treated as "unknown", not "expired". */
  expiresAt: number | null;
}

const STORAGE_KEY = 'gf_access_token';

/** Refresh this long before the token actually expires. */
const SKEW_MS = 2 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to sign-in / sign-out / refresh. Returns the unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A value written before refresh tokens were stored is a bare token string, not
 * JSON. It is ADOPTED rather than discarded: it still works until it expires,
 * and signing someone out to upgrade a storage format is the very failure this
 * change exists to stop.
 */
function parse(raw: string): StoredSession {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'accessToken' in parsed) {
      const value = parsed as Partial<StoredSession>;
      if (typeof value.accessToken === 'string') {
        return {
          accessToken: value.accessToken,
          refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : null,
          expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : null,
        };
      }
    }
  } catch {
    // Not JSON — the legacy bare-token format, handled below.
  }
  return { accessToken: raw, refreshToken: null, expiresAt: null };
}

export function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable outright (private mode, blocked site data).
    return null;
  }
  return raw ? parse(raw) : null;
}

export function writeSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // A session that cannot be persisted still works for this page's lifetime.
  }
  notify();
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the in-memory listeners still hear about it.
  }
  notify();
}

/** The current access token, or null. Synchronous — see the header. */
export function currentAccessToken(): string | null {
  return readSession()?.accessToken ?? null;
}

/**
 * Build a session from what Supabase puts in the redirect fragment. `expires_in`
 * is seconds from now; a missing one leaves `expiresAt` null, which schedules no
 * refresh rather than scheduling one at the epoch.
 */
export function sessionFromFragment(params: URLSearchParams): StoredSession | null {
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  const expiresIn = Number(params.get('expires_in'));
  return {
    accessToken,
    refreshToken: params.get('refresh_token'),
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
  };
}

/** True when the session is expired, or close enough that a request would race it. */
export function needsRefresh(session: StoredSession): boolean {
  return session.expiresAt !== null && Date.now() > session.expiresAt - SKEW_MS;
}

/** Milliseconds until the refresh is due, or null when the expiry is unknown. */
export function msUntilRefresh(session: StoredSession): number | null {
  if (session.expiresAt === null) return null;
  return Math.max(0, session.expiresAt - SKEW_MS - Date.now());
}

let inFlight: Promise<StoredSession | null> | null = null;

/**
 * Exchange the refresh token for a new session. Returns null when there is
 * nothing to refresh with, or when the server refuses — in which case the
 * session is CLEARED, so a dead session becomes a visible signed-out state
 * rather than a token that 401s forever.
 */
export async function refreshSession(): Promise<StoredSession | null> {
  inFlight ??= (async () => {
    try {
      const session = readSession();
      if (!session?.refreshToken) return null;

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return null;

      const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: key },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      if (!res.ok) {
        // A refused refresh is terminal: the token is spent or revoked, and
        // retrying it produces the same answer. Clearing is what makes the page
        // say "signed out" instead of silently failing every request.
        clearSession();
        return null;
      }
      const body = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!body.access_token) {
        clearSession();
        return null;
      }
      const next: StoredSession = {
        accessToken: body.access_token,
        refreshToken: body.refresh_token ?? session.refreshToken,
        expiresAt: typeof body.expires_in === 'number' ? Date.now() + body.expires_in * 1000 : null,
      };
      writeSession(next);
      return next;
    } catch {
      // A network failure is NOT terminal — the token may still be good and the
      // researcher may simply be offline. Leave the session alone and let the
      // next scheduled attempt try again.
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** A valid token, refreshing first when the stored one is at or past the skew. */
export async function getFreshAccessToken(): Promise<string | null> {
  const session = readSession();
  if (!session) return null;
  if (!needsRefresh(session)) return session.accessToken;
  return (await refreshSession())?.accessToken ?? null;
}
