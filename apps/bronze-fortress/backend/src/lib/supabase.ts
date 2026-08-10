// Thin wrapper around the Supabase Auth REST API.
// Avoids the @supabase/supabase-js SDK entirely — the SDK initialises a
// Realtime WebSocket client on construction, which fails in Node.js < 22.
// We only need auth.getUser(), which is a single HTTP GET.

const SUPABASE_URL = process.env['SUPABASE_URL'];
const SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export interface SupabaseUser {
  id: string;
  email?: string;
}

interface GetUserResult {
  data: { user: SupabaseUser | null };
  error: Error | null;
}

// Verifies a Supabase JWT by calling GET /auth/v1/user.
// Equivalent to supabaseAdmin.auth.getUser(token) but without the SDK.
export const supabaseAdmin = {
  auth: {
    async getUser(token: string): Promise<GetUserResult> {
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SERVICE_ROLE_KEY!,
          },
        });
        if (!res.ok) {
          return { data: { user: null }, error: new Error(`Auth failed: ${res.status}`) };
        }
        const user = (await res.json()) as SupabaseUser;
        return { data: { user }, error: null };
      } catch (err) {
        return { data: { user: null }, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
  },
};
