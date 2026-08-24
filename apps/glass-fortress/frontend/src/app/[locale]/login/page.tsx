'use client';

import { useState, FormEvent, Suspense } from 'react';
import { AuthShell } from '@/components/AuthShell';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { sendMagicLink, getGoogleOAuthUrl } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';
import { Link } from '@/i18n/navigation';

// ---------------------------------------------------------------------------
// Handle setup step — shown after first login when no Researcher record exists
// ---------------------------------------------------------------------------

function HandleSetupStep({ returnTo }: { returnTo: string | null }) {
  const t = useTranslations('auth');
  const { accessToken, login } = useAuth();
  const router = useRouter();
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? t('registerFailed'));
        return;
      }
      // Refresh profile in context then go to profile page (or back to
      // whatever flow — e.g. an OAuth consent screen — sent us here)
      await login(accessToken);
      router.push(returnTo ?? '/profile');
    } catch {
      setError(t('registerFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t('chooseHandle')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('handleHint')}</p>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={t('handlePlaceholder')}
          minLength={2}
          maxLength={30}
          required
          className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || handle.trim().length < 2}
          className="w-full py-2 px-4 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {loading ? t('saving') : t('saveHandle')}
        </button>
      </form>
      <p className="text-xs text-slate-400">{t('handlePrivacyNote')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Magic link + Google login step
// ---------------------------------------------------------------------------

function LoginStep({ returnTo }: { returnTo: string | null }) {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function callbackUrl(): string {
    const base = `${window.location.origin}/auth/callback`;
    return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await sendMagicLink(email.trim(), callbackUrl());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sendFailed'));
    } finally {
      setLoading(false);
    }
  }

  function handleGoogle() {
    window.location.href = getGoogleOAuthUrl(callbackUrl());
  }

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <Image src="/icon_magic_link_sent.png" alt="" width={40} height={40} className="w-10 h-10 mx-auto" />
        <p className="text-sm font-medium text-slate-900">{t('magicLinkSent')}</p>
        <p className="text-sm text-slate-500">{t('magicLinkHint', { email })}</p>
        <button
          onClick={() => setSent(false)}
          className="text-xs text-slate-400 underline hover:text-slate-600"
        >
          {t('tryAgain')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleMagicLink} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('emailLabel')}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full py-2 px-4 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {loading ? t('sending') : t('sendMagicLink')}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-2 bg-white text-xs text-slate-400">{t('or')}</span>
        </div>
      </div>

      <button
        onClick={handleGoogle}
        className="w-full py-2 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {t('continueWithGoogle')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function LoginPageContent() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const searchParams = useSearchParams();
  const step = searchParams.get('step');
  const returnTo = searchParams.get('returnTo');

  return (
    <AuthShell>
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-6">
        <div>
          {/* "Glass Fortress" is internal terminology and was showing here, on
              a page reached from a magic link with no other context. */}
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">← {tCommon('appName')}</Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-3">
            {step === 'handle' ? t('setupTitle') : t('loginTitle')}
          </h1>
          {step !== 'handle' && (
            <p className="text-sm text-slate-500 mt-1">{t('loginSubtitle')}</p>
          )}
        </div>

        {step === 'handle' ? <HandleSetupStep returnTo={returnTo} /> : <LoginStep returnTo={returnTo} />}
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
