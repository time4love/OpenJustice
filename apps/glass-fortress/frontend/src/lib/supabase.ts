// ---------------------------------------------------------------------------
// Supabase Auth REST client — no SDK required.
// Uses raw fetch against Supabase's /auth/v1/* endpoints.
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.
// ---------------------------------------------------------------------------

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  return { url, key };
}

function authHeaders(anonKey: string, accessToken?: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    apikey: anonKey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export interface SupabaseUser {
  id: string;
  email?: string;
}

/**
 * Send a magic-link email. Resolves on success, throws on error.
 *
 * redirectTo, when given, MUST be a query param on the request URL, not a
 * JSON body field — GoTrue's redirect resolution (getRedirectTo in its own
 * source) reads it via r.Header.Get("redirect_to") or r.Form.Get("redirect_to"),
 * and Go's ParseForm() never parses a JSON body, only the URL's query string
 * (or an actual x-www-form-urlencoded body, which this isn't). Matches how
 * getGoogleOAuthUrl below already passes redirect_to, for the same reason.
 */
export async function sendMagicLink(email: string, redirectTo?: string): Promise<void> {
  const { url, key } = getConfig();
  const endpoint = redirectTo
    ? `${url}/auth/v1/otp?${new URLSearchParams({ redirect_to: redirectTo }).toString()}`
    : `${url}/auth/v1/otp`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify({ email, type: 'magiclink' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { msg?: string }).msg ?? 'Failed to send magic link');
  }
}

/** Return the URL to redirect the user to for Google OAuth. */
export function getGoogleOAuthUrl(redirectTo: string): string {
  const { url, key } = getConfig();
  const params = new URLSearchParams({ provider: 'google', redirect_to: redirectTo });
  // Append apikey as query param so the Supabase edge function can validate
  return `${url}/auth/v1/authorize?${params.toString()}&apikey=${key}`;
}

/** Fetch the currently authenticated user using an access token. */
export async function getSupabaseUser(accessToken: string): Promise<SupabaseUser | null> {
  const { url, key } = getConfig();
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: authHeaders(key, accessToken),
  });
  if (!res.ok) return null;
  return res.json() as Promise<SupabaseUser>;
}
