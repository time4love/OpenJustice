'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiUrl } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// ---------------------------------------------------------------------------
// MCP OAuth login/consent screen (docs/gf-mcp-oauth-dev-plan.md, Phase 3).
//
// This is where an external MCP client (Claude, ChatGPT) sends the user's
// browser mid-authorization. Backend: src/routes/oauthInteractionRoutes.ts.
//
// The GET fetch below is a normal fetch() — it only reads state. The actual
// login/confirm steps further down are real <form method="POST"> submits,
// deliberately NOT fetch() — the backend responds to those with a redirect
// that must resume in the browser's address bar (through oidc-provider,
// possibly all the way to the external client's own redirect_uri), which a
// fetch() would just swallow instead of following visibly. See the backend
// file's own comment for the full reasoning.
// ---------------------------------------------------------------------------

interface InteractionDetails {
  uid: string;
  promptName: string;
  client: { clientId: string; clientName: string } | null;
  scopes: string[];
}

const HUMAN_SCOPES = ['mcp:read', 'mcp:write'] as const;

// Mirrors proxy.ts's withoutLocale() — window.location.pathname here is
// already locale-prefixed (next-intl resolved it before this client component
// ran), but returnTo threads through /login -> Google -> auth/callback's
// locale-aware router.push(returnTo), which prefixes the locale again. Kept
// locale-agnostic here so it's prefixed exactly once, at the very end.
function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}

function scopeLabels(t: ReturnType<typeof useTranslations>, scopes: string[]): string[] {
  return HUMAN_SCOPES.filter((s) => scopes.includes(s)).map((s) =>
    s === 'mcp:read' ? t('scopeReadLabel') : t('scopeWriteLabel'),
  );
}

export function OAuthInteractionClient({ uid }: { uid: string }) {
  const t = useTranslations('oauthInteraction');
  const tAuth = useTranslations('auth');
  const searchParams = useSearchParams();
  const loginError = searchParams.get('loginError');
  const { accessToken, researcher, loading: authLoading } = useAuth();

  const [details, setDetails] = useState<InteractionDetails | null>(null);
  const [detailsError, setDetailsError] = useState(false);
  const [denying, setDenying] = useState(false);

  const loginFormRef = useRef<HTMLFormElement>(null);
  const confirmFormRef = useRef<HTMLFormElement>(null);
  const denyFormRef = useRef<HTMLFormElement>(null);

  // Redirect to login (preserving this page as returnTo) once we know for
  // sure there's no session — not while auth is still loading.
  useEffect(() => {
    if (authLoading || accessToken) return;
    const returnTo = stripLocale(window.location.pathname);
    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, [authLoading, accessToken]);

  // Fetch interaction details once we have a session and an approved account.
  useEffect(() => {
    if (!accessToken || !researcher?.approved || loginError) return;
    let cancelled = false;
    fetch(apiUrl(`/oauth/interaction/${uid}`))
      .then((res) => {
        if (!res.ok) throw new Error('expired');
        return res.json() as Promise<InteractionDetails>;
      })
      .then((data) => {
        if (!cancelled) setDetails(data);
      })
      .catch(() => {
        if (!cancelled) setDetailsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, researcher?.approved, uid, loginError]);

  // Auto-advance the 'login' prompt — no user input needed, identity already
  // comes from the GF session above. A real form submit, not fetch(); see
  // the file-level comment.
  useEffect(() => {
    if (details?.promptName === 'login') loginFormRef.current?.submit();
  }, [details]);

  if (authLoading || (accessToken && researcher === null)) {
    return <CenteredMessage text={t('loading')} spinner />;
  }

  if (!accessToken) {
    return <CenteredMessage text={t('redirectingToLogin')} spinner />;
  }

  if (loginError) {
    const key = ['invalid_token', 'no_account', 'not_approved', 'missing_token'].includes(loginError)
      ? loginError
      : 'missing_token';
    return (
      <CenteredCard title={t('loginErrorTitle')}>
        <p className="text-sm text-slate-500">{t(`loginError_${key}`)}</p>
        <Link href="/login" className="text-sm text-slate-600 underline">
          {t('backToLogin')}
        </Link>
      </CenteredCard>
    );
  }

  if (!researcher?.approved) {
    return (
      <CenteredCard title={tAuth('pendingApproval')}>
        <p className="text-sm text-slate-500">{tAuth('pendingApprovalHint')}</p>
      </CenteredCard>
    );
  }

  if (detailsError) {
    return (
      <CenteredCard title={t('expiredTitle')}>
        <p className="text-sm text-slate-500">{t('expiredHint')}</p>
      </CenteredCard>
    );
  }

  if (!details || details.promptName === 'login') {
    return (
      <>
        <CenteredMessage text={t('connecting')} spinner />
        <form ref={loginFormRef} method="POST" action={apiUrl(`/oauth/interaction/${uid}/login`)} hidden>
          <input type="hidden" name="accessToken" value={accessToken} />
        </form>
      </>
    );
  }

  const labels = scopeLabels(t, details.scopes);
  const clientName = details.client?.clientName ?? details.client?.clientId ?? '';

  return (
    <CenteredCard title="">
      <p className="text-base font-medium text-slate-900">{t('clientWantsAccess', { client: clientName })}</p>
      <ul className="text-sm text-slate-600 list-disc ps-5 space-y-1">
        {labels.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>

      <div className="flex gap-3 pt-2">
        <form ref={confirmFormRef} method="POST" action={apiUrl(`/oauth/interaction/${uid}/confirm`)}>
          <input type="hidden" name="accessToken" value={accessToken} />
          <input type="hidden" name="decision" value="allow" />
          <button
            type="submit"
            className="py-2 px-4 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-700 transition-colors"
          >
            {t('approve')}
          </button>
        </form>
        <form
          ref={denyFormRef}
          method="POST"
          action={apiUrl(`/oauth/interaction/${uid}/confirm`)}
          onSubmit={() => setDenying(true)}
        >
          <input type="hidden" name="accessToken" value={accessToken} />
          <input type="hidden" name="decision" value="deny" />
          <button
            type="submit"
            disabled={denying}
            className="py-2 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {denying ? t('denying') : t('deny')}
          </button>
        </form>
      </div>
    </CenteredCard>
  );
}

// ---------------------------------------------------------------------------
// Shared layout bits — matching login/page.tsx's card styling
// ---------------------------------------------------------------------------

function CenteredCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-4">
        {title && <h1 className="text-xl font-semibold text-slate-900">{title}</h1>}
        {children}
      </div>
    </div>
  );
}

function CenteredMessage({ text, spinner }: { text: string; spinner?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        {spinner && <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />}
        <p className="text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}
