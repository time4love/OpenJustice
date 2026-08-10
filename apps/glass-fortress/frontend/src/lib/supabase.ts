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

/** Send a magic-link email. Resolves on success, throws on error. */
export async function sendMagicLink(email: string): Promise<void> {
  const { url, key } = getConfig();
  const res = await fetch(`${url}/auth/v1/otp`, {
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
