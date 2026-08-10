'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearcherProfile {
  id: string;
  handle: string;
  role: 'RESEARCHER' | 'ADMIN';
  approved: boolean;
  hasMcpToken: boolean;
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
  /** Refresh the researcher profile from the backend (e.g. after token generation). */
  refreshProfile: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'gf_access_token';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    researcher: null,
    loading: true,
  });

  const fetchProfile = useCallback(async (token: string): Promise<ResearcherProfile | null> => {
    try {
      const res = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json() as Promise<ResearcherProfile>;
    } catch {
      return null;
    }
  }, []);

  // On mount — restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    fetchProfile(stored).then((researcher) => {
      if (!researcher) {
        // Token expired or researcher deleted
        localStorage.removeItem(STORAGE_KEY);
        setState({ accessToken: null, researcher: null, loading: false });
      } else {
        setState({ accessToken: stored, researcher, loading: false });
      }
    });
  }, [fetchProfile]);

  const login = useCallback(async (accessToken: string) => {
    localStorage.setItem(STORAGE_KEY, accessToken);
    const researcher = await fetchProfile(accessToken);
    setState({ accessToken, researcher, loading: false });
  }, [fetchProfile]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ accessToken: null, researcher: null, loading: false });
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = state.accessToken;
    if (!token) return;
    const researcher = await fetchProfile(token);
    setState((s) => ({ ...s, researcher }));
  }, [state.accessToken, fetchProfile]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshProfile }}>
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
