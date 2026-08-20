/**
 * Attaches `X-Staging-Token: <token>` to every fetch aimed at the backend
 * API, without touching the ~50 call sites that call `fetch(apiUrl(...))`
 * directly across the app. Patches the global fetch once, at module load,
 * imported for its side effect from ClientProviders.
 *
 * Deliberately not the `Authorization` header — callers (e.g. researcher
 * login/admin pages sending a Supabase access token) may already need
 * `Authorization` for their own auth, and this patch must not clobber it.
 *
 * A no-op unless NEXT_PUBLIC_STAGING_API_TOKEN is configured — see
 * .env.example for why this value is public (ships in the JS bundle) rather
 * than a real secret, and STAGING_API_TOKEN in the backend .env.example for
 * the matching server-side check.
 */
function installStagingApiAuth(): void {
  if (typeof window === 'undefined') return;

  const token = process.env.NEXT_PUBLIC_STAGING_API_TOKEN;
  if (!token) return;

  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isBackendCall = apiBase ? url.startsWith(apiBase) : url.startsWith('/api/');
    if (!isBackendCall) return originalFetch(input, init);

    const headers = new Headers(init?.headers);
    headers.set('X-Staging-Token', token);
    return originalFetch(input, { ...init, headers });
  };
}

installStagingApiAuth();
