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
//   3. If Researcher exists → /profile
//   4. If no Researcher (404) → /login?step=handle (first-time login)
//   5. On error → /login with error message
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

      if (meRes.status === 404) {
        // First login — send to handle setup
        router.push('/login?step=handle');
      } else if (meRes.ok) {
        router.push('/profile');
      } else {
        // Unexpected error — still logged in, go to profile which will show approval state
        router.push('/profile');
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
