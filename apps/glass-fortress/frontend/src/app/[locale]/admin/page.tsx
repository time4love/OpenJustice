'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth, type ResearcherProfile } from '@/context/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { apiUrl, fetchJson } from '@/lib/api';
import { useAsyncData, type AsyncFetcher } from '@/hooks/useAsyncData';
import { Link } from '@/i18n/navigation';

type ResearcherRow = Pick<ResearcherProfile, 'id' | 'handle' | 'role' | 'approved' | 'createdAt'>;

function AdminContent() {
  const t = useTranslations('admin');
  const { accessToken, researcher } = useAuth();
  const [updating, setUpdating] = useState<string | null>(null);

  // The dependency is the resolved *string*, never `t` itself: the fetcher's
  // identity is the cache key, and a `t` that is not referentially stable would
  // make it a new key on every render — an endless refetch loop.
  const offlineMessage = t('loadFailed');
  const fetchResearchers = useMemo<AsyncFetcher<ResearcherRow[]> | null>(
    () =>
      accessToken
        ? (signal) =>
            fetchJson<ResearcherRow[]>('/api/auth/researchers', {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal,
              offline: offlineMessage,
            })
        : null,
    [accessToken, offlineMessage],
  );
  const { state, reload } = useAsyncData(fetchResearchers);

  const rows = state.status === 'ok' ? state.data : [];
  // `idle` means the token has not arrived yet, which the reader experiences as
  // still loading — but it is not an empty researcher list, and must not render
  // as one.
  const loading = state.status === 'loading' || state.status === 'idle';

  async function patch(id: string, updates: Partial<{ approved: boolean; role: 'RESEARCHER' | 'ADMIN' }>) {
    if (!accessToken) return;
    setUpdating(id);
    try {
      const res = await fetch(apiUrl(`/api/auth/researchers/${id}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(updates),
      });
      // Re-read rather than patching the row in place: the server decides what
      // the row now is, and `reload` leaves the table on screen while it lands.
      if (res.ok) await reload();
    } finally {
      setUpdating(null);
    }
  }

  // Admin-only guard at the component level (AuthGuard only checks login)
  if (researcher?.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-500">{t('adminOnly')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <Link href="/profile" className="text-xs text-slate-400 hover:text-slate-600">← {t('back')}</Link>
            <h1 className="text-xl font-semibold text-slate-900 mt-2">{t('title')}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t('subtitle')}</p>
          </div>
          <button
            onClick={() => { void reload(); }}
            className="text-xs text-slate-400 hover:text-slate-700 underline"
          >
            {t('refresh')}
          </button>
        </div>

        {state.status === 'error' && <p className="text-sm text-red-600">{state.error.message}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-400">{t('noResearchers')}</p>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {rows.map((row) => {
              const isUpdating = updating === row.id;
              const isSelf = row.id === researcher.id;
              return (
                <div key={row.id} className="px-5 py-4 flex items-center gap-4">
                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-slate-900 truncate">
                        {row.handle}
                      </span>
                      {isSelf && (
                        <span className="text-xs text-slate-400">{t('you')}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t('joined')} {new Date(row.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Approval badge */}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                    row.approved
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {row.approved ? t('approved') : t('pending')}
                  </span>

                  {/* Role badge */}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                    row.role === 'ADMIN'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {row.role}
                  </span>

                  {/* Actions */}
                  {!isSelf && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => patch(row.id, { approved: !row.approved })}
                        disabled={isUpdating}
                        className={`text-xs px-2.5 py-1 rounded border font-medium transition-colors disabled:opacity-50 ${
                          row.approved
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {isUpdating ? '…' : row.approved ? t('revoke') : t('approve')}
                      </button>
                      <button
                        onClick={() => patch(row.id, { role: row.role === 'ADMIN' ? 'RESEARCHER' : 'ADMIN' })}
                        disabled={isUpdating}
                        className="text-xs px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors disabled:opacity-50"
                      >
                        {isUpdating ? '…' : row.role === 'ADMIN' ? t('demote') : t('makeAdmin')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AuthGuard>
      <AdminContent />
    </AuthGuard>
  );
}
