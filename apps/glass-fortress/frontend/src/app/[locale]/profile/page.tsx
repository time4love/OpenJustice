'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { apiUrl } from '@/lib/api';
import { Link } from '@/i18n/navigation';

function ProfileContent() {
  const t = useTranslations('auth');
  const { researcher, accessToken, logout, refreshProfile } = useAuth();
  const [generatingToken, setGeneratingToken] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!researcher) return null;

  async function generateToken() {
    setGeneratingToken(true);
    setTokenError('');
    setRevealedToken(null);
    try {
      const res = await fetch(apiUrl('/api/auth/mcp-token'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json() as { token?: string; error?: string; message?: string };
      if (!res.ok) {
        setTokenError(body.error ?? t('tokenGenFailed'));
        return;
      }
      setRevealedToken(body.token ?? null);
      await refreshProfile();
    } catch {
      setTokenError(t('tokenGenFailed'));
    } finally {
      setGeneratingToken(false);
    }
  }

  async function copyToken() {
    if (!revealedToken) return;
    await navigator.clipboard.writeText(revealedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const roleBadgeClass =
    researcher.role === 'ADMIN'
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : 'bg-blue-100 text-blue-800 border-blue-200';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto px-4 py-12 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">← {t('backToHome')}</Link>
          <div className="flex items-center gap-3">
            {researcher.role === 'ADMIN' && (
              <Link href="/admin" className="text-xs text-purple-600 hover:text-purple-800 font-medium">
                Admin
              </Link>
            )}
            <button
              onClick={logout}
              className="text-xs text-slate-400 hover:text-red-600 transition-colors"
            >
              {t('logout')}
            </button>
          </div>
        </div>

        {/* Identity card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">{t('handle')}</p>
              <p className="text-xl font-mono font-semibold text-slate-900 mt-0.5">{researcher.handle}</p>
            </div>
            <span className={`px-2.5 py-1 text-xs font-medium rounded border ${roleBadgeClass}`}>
              {researcher.role}
            </span>
          </div>

          {!researcher.approved && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium">{t('pendingApproval')}</p>
              <p className="text-xs text-amber-600 mt-0.5">{t('pendingApprovalHint')}</p>
            </div>
          )}

          {researcher.approved && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-sm text-emerald-800 font-medium">{t('approved')}</p>
            </div>
          )}
        </div>

        {/* MCP Token section */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{t('mcpTokenTitle')}</h2>
            <p className="text-xs text-slate-500 mt-1">{t('mcpTokenHint')}</p>
          </div>

          {!researcher.approved && (
            <p className="text-sm text-slate-400 italic">{t('tokenRequiresApproval')}</p>
          )}

          {researcher.approved && (
            <>
              {revealedToken ? (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 font-medium">{t('tokenOnce')}</p>
                  <div className="bg-slate-900 rounded-lg p-3 font-mono text-xs text-green-400 break-all">
                    {revealedToken}
                  </div>
                  <button
                    onClick={copyToken}
                    className="text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    {copied ? t('copied') : t('copyToken')}
                  </button>
                  <div className="mt-2 text-xs text-slate-500 space-y-1">
                    <p className="font-medium">{t('claudeConfigTitle')}</p>
                    <pre className="bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto text-slate-700">
{`"glass-fortress": {
  "url": "http://localhost:3001/api/mcp",
  "headers": {
    "Authorization": "Bearer ${revealedToken}"
  }
}`}
                    </pre>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {researcher.hasMcpToken ? t('tokenExists') : t('noToken')}
                    </span>
                  </div>
                  {tokenError && <p className="text-sm text-red-600">{tokenError}</p>}
                  <button
                    onClick={generateToken}
                    disabled={generatingToken}
                    className="py-2 px-4 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {generatingToken
                      ? t('generating')
                      : researcher.hasMcpToken
                      ? t('rotateToken')
                      : t('generateToken')}
                  </button>
                  {researcher.hasMcpToken && (
                    <p className="text-xs text-slate-400">{t('rotateWarning')}</p>
                  )}
                </>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
