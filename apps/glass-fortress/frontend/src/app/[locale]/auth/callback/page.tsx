'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Auth Callback
//
// Supabase redirects here after magic link click or Google OAuth.
// The access_token is in the URL fragment (hash) — not query params — so
// this must be a client component (server components cannot read the hash).
//
// Flow:
//   1. Parse access_token from window.location.hash
//   2. Call login() to store token + fetch profile
//   3. If Researcher exists → returnTo (if present, e.g. an OAuth consent
//      screen — see oauth/interaction/[uid]) or /profile
//   4. If no Researcher (404) → /login?step=handle, carrying returnTo along
//   5. On error → /login with error message
//
// returnTo is read from window.location.search, not useSearchParams() — a
// plain query param survives the redirect from LoginStep's callbackUrl()
// fine, and reading it this way (matching how the hash is already parsed
// below) avoids needing a Suspense boundary around this page.
// ---------------------------------------------------------------------------

export default function AuthCallbackPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function handleCallback() {
      const hash = window.location.hash.slice(1); // strip leading #
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const errorDescription = params.get('error_description');
      const returnTo = new URLSearchParams(window.location.search).get('returnTo');

      if (errorDescription) {
        setErrorMsg(errorDescription);
        setStatus('error');
        return;
      }

      if (!accessToken) {
        setErrorMsg('No access token found in callback URL.');
        setStatus('error');
        return;
      }

      // Check if a Researcher record already exists for this user
      const meRes = await fetch(apiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Store token and load profile into context
      await login(accessToken);

      const returnToSuffix = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : '';
      if (meRes.status === 404) {
        // First login — send to handle setup
        router.push(`/login?step=handle${returnToSuffix}`);
      } else {
        // Either confirmed OK, or an unexpected /me error — either way the
        // user is logged in at this point, so proceed the same either way;
        // /profile (or the caller's returnTo) will show approval state.
        router.push(returnTo ?? '/profile');
      }
    }

    handleCallback().catch((err) => {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error during login.');
      setStatus('error');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl border border-red-200 p-8 text-center space-y-4">
          <p className="text-red-600 font-medium">Login failed</p>
          <p className="text-sm text-slate-500">{errorMsg}</p>
          <a href="/login" className="text-sm text-slate-600 underline">Try again</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Signing you in…</p>
      </div>
    </div>
  );
}
