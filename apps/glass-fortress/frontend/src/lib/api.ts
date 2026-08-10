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
