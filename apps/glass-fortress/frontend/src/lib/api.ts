/**
 * Base URL for all backend API calls.
 *
 * - Development / Vercel preview (env var unset):
 *     Empty string → fetch('/api/...') → Next.js rewrite proxies to BACKEND_URL
 *
 * - Production (env var set in Vercel dashboard):
 *     Requests go directly from the browser to the backend service, bypassing
 *     the Next.js proxy.  CORS must allow the Vercel frontend origin.
 *
 * Usage:
 *   import { apiUrl } from '@/lib/api';
 *   fetch(apiUrl('/api/evidence/search?q=...'))
 */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  // Avoid double-slashes when base has a trailing slash
  return base.replace(/\/$/, '') + path;
}

/**
 * Authorization header for the signed-in researcher, if any. The token is the
 * Supabase session AuthContext stores; thesis reads are viewer-dependent on the
 * backend (the public gets the published version, a researcher the head), so
 * every thesis fetch sends it when present. Empty on the server and when
 * signed out.
 */
export function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem('gf_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
