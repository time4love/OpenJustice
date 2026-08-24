'use client';

import { createContext, useContext, useMemo, useState, useCallback, ReactNode } from 'react';
import { apiUrl } from '@/lib/api';
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
  /** Store a new Supabase access token and load the researcher profile. */
  login: (accessToken: string) => Promise<void>;
  /** Clear session from memory and localStorage. */
  logout: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'gf_access_token';

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
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return SIGNED_OUT;
      const researcher = await fetchProfile(stored, signal);
      if (!researcher) {
        localStorage.removeItem(STORAGE_KEY);
        return SIGNED_OUT;
      }
      return { accessToken: stored, researcher };
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

  const login = useCallback(async (accessToken: string) => {
    localStorage.setItem(STORAGE_KEY, accessToken);
    setOverride({ accessToken, researcher: await fetchProfile(accessToken) });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
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
