'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { apiUrl } from '@/lib/api';
import {
  clearSession,
  msUntilRefresh,
  needsRefresh,
  readSession,
  refreshSession,
  writeSession,
  type StoredSession,
} from '@/lib/session';
import { useAsyncData, type AsyncFetcher } from '@/hooks/useAsyncData';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearcherProfile {
  id: string;
  handle: string;
  role: 'RESEARCHER' | 'ADMIN';
  approved: boolean;
  createdAt: string;
}

interface AuthState {
  accessToken: string | null;
  researcher: ResearcherProfile | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  /**
   * Store a new Supabase session and load the researcher profile. A bare token
   * is accepted for the call sites that only ever had one (re-reading the
   * profile after registering a handle); it keeps whatever refresh token is
   * already stored rather than dropping it.
   */
  login: (session: StoredSession | string) => Promise<void>;
  /** Clear session from memory and localStorage. */
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

/** Signed out — the answer both "no stored token" and "stored token is dead" reduce to. */
const SIGNED_OUT: Session = { accessToken: null, researcher: null };

type Session = Pick<AuthState, 'accessToken' | 'researcher'>;

/**
 * `null` means "this token buys you nothing" — expired, revoked, researcher
 * deleted. An abort is NOT that answer and must not be flattened into it: the
 * caller deletes the stored token on `null`, so swallowing an abort here would
 * sign the user out whenever a request was cancelled.
 */
async function fetchProfile(token: string, signal?: AbortSignal): Promise<ResearcherProfile | null> {
  try {
    const res = await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as ResearcherProfile;
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  // Restoring the stored session is an ordinary fetch-on-mount, so it uses the
  // same hook as every other one. What login/logout add on top is an explicit
  // override: once the user has acted, that decision outranks whatever the
  // restore is still doing, even if it lands afterwards.
  const restoreSession = useMemo<AsyncFetcher<Session> | null>(
    () => async (signal) => {
      const stored = readSession();
      if (!stored) return SIGNED_OUT;
      // A tab reopened after the token's hour is up starts by renewing it. This
      // is the common case for a researcher who left the page open overnight,
      // and without it the restore below would 401 and sign them out on sight.
      const live = needsRefresh(stored) ? await refreshSession() : stored;
      if (!live) return SIGNED_OUT;
      const researcher = await fetchProfile(live.accessToken, signal);
      if (!researcher) {
        clearSession();
        return SIGNED_OUT;
      }
      return { accessToken: live.accessToken, researcher };
    },
    [],
  );
  const { state } = useAsyncData(restoreSession);
  const [override, setOverride] = useState<Session | null>(null);

  // A restore that fails outright (localStorage unavailable) is signed out, not
  // an error state — there is nothing for the reader to retry.
  const restored: Session = state.status === 'ok' ? state.data : SIGNED_OUT;
  const session = override ?? restored;
  const loading = override === null && state.status === 'loading';

  // -------------------------------------------------------------------------
  // Keeping the session alive
  // -------------------------------------------------------------------------
  // Supabase's access token lasts an hour, and renewing it BEFORE it expires is
  // what lets `accessToken` be read synchronously by thirteen call sites and
  // still be valid when they read it.
  //
  // TWO TRIGGERS, BECAUSE ONE IS NOT ENOUGH. The timer covers a tab in use. A
  // background tab's timers are throttled by the browser, so a page left open in
  // another window can sail past its expiry with the callback still pending —
  // `visibilitychange` catches that on the way back, before the researcher's
  // first click discovers it the hard way.
  const { accessToken, researcher } = session;
  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const renew = async () => {
      const stored = readSession();
      if (cancelled || !stored || !needsRefresh(stored)) return;
      const next = await refreshSession();
      if (cancelled) return;
      if (next) setOverride({ accessToken: next.accessToken, researcher });
      // A refused refresh clears storage; a network failure leaves it intact.
      // Only the first is a sign-out, and reading storage is how they are told
      // apart without the refresh having to report which it was.
      else if (readSession() === null) setOverride(SIGNED_OUT);
    };

    const schedule = () => {
      const stored = readSession();
      const due = stored ? msUntilRefresh(stored) : null;
      // A session whose expiry the issuer never stated schedules nothing. There
      // is no honest moment to pick, and guessing one would refresh on a loop.
      if (due === null) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void renew().then(schedule);
      }, due);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void renew().then(schedule);
    };

    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessToken, researcher]);

  const login = useCallback(async (next: StoredSession | string) => {
    const session: StoredSession =
      typeof next === 'string'
        ? { ...(readSession() ?? { refreshToken: null, expiresAt: null }), accessToken: next }
        : next;
    writeSession(session);
    setOverride({
      accessToken: session.accessToken,
      researcher: await fetchProfile(session.accessToken),
    });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setOverride(SIGNED_OUT);
  }, []);

  return (
    <AuthContext.Provider value={{ ...session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
