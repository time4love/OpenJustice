'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthMessage, AuthShell } from '@/components/AuthShell';
import { Link, useRouter } from '@/i18n/navigation';
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
  // This page was the last English text in a Hebrew-first flow: "Login failed",
  // "Try again", "Signing you in…" — reached from a magic link, so often the
  // very first page a researcher saw.
  const t = useTranslations('auth');
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
        setErrorMsg(t('callbackNoToken'));
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
      <AuthShell>
        <div className="w-full max-w-sm bg-white rounded-xl border border-red-200 p-8 text-center space-y-4">
          <p className="text-red-600 font-medium">{t('callbackFailedTitle')}</p>
          <p className="text-sm text-slate-500">{errorMsg}</p>
          <Link href="/login" className="text-sm text-slate-600 underline">{t('callbackBackToLogin')}</Link>
        </div>
      </AuthShell>
    );
  }

  return <AuthMessage text={t('callbackSigningIn')} spinner />;
}
