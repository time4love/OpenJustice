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

/**
 * Fetch JSON and turn every failure into a thrown `Error` whose `message` is
 * what the reader should see — which is what `useAsyncData` stores as
 * `state.error`.
 *
 * Three failures, deliberately kept apart:
 *  - the request was aborted (unmount, or a newer request superseded it): the
 *    abort is re-thrown untouched, so the hook can recognise and discard it
 *    rather than rendering it as a real failure;
 *  - the request never reached the backend: `offline`, because how to word that
 *    is a page-level decision, not this helper's;
 *  - the backend answered with a status: its own `message`, falling back to the
 *    status code, so a server-authored explanation is never replaced by a
 *    generic one.
 */
export async function fetchJson<T>(
  path: string,
  { offline, ...init }: RequestInit & { offline: string },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), init);
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new Error(offline);
  }
  let body: T & { message?: string };
  try {
    body = (await res.json()) as T & { message?: string };
  } catch (err) {
    // A gateway erroring out with an HTML page is still a status failure — say
    // so, rather than surfacing a JSON parse error the reader cannot act on.
    if (!res.ok) throw new Error(`Error ${String(res.status)}`);
    throw err;
  }
  if (!res.ok) throw new Error(body.message ?? `Error ${String(res.status)}`);
  return body;
}
