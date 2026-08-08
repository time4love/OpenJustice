'use client';

import { use, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VersionSummary {
  id: string;
  parentVersionId: string | null;
  status: 'PENDING_AI' | 'COMPLETE';
  contentHash: string;
  preview: string;
  mentionCount: number;
  isHead: boolean;
  createdAt: string;
}

interface HistoryResponse {
  thesisId: string;
  headVersionId: string | null;
  versions: VersionSummary[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ThesisHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('theses');
  const locale = useLocale();

  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl(`/api/thesis/${id}/versions`));
        if (!res.ok) throw new Error();
        setData((await res.json()) as HistoryResponse);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link
            href={`/theses/${id}`}
            className="text-slate-600 hover:text-slate-900 text-sm transition-colors"
          >
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 text-sm font-medium">{t('historyBtn')}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('historyHeading')}</h1>

        {loading && (
          <p className="text-slate-500 text-sm">{t('savingBtn')}</p>
        )}

        {error && (
          <p className="text-red-600 text-sm">{t('errorEvaluate')}</p>
        )}

        {data && data.versions.length === 0 && (
          <p className="text-slate-500 text-sm">{t('historyEmpty')}</p>
        )}

        {/* Version list — oldest first, newest (head) at bottom */}
        {data && data.versions.length > 0 && (
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute start-[19px] top-6 bottom-6 w-px bg-slate-200" aria-hidden />

            <ol className="space-y-4">
              {data.versions.map((v, index) => (
                <li key={v.id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div
                    className={`relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      v.isHead
                        ? 'border-violet-600 bg-violet-600'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {v.isHead && <span className="h-2 w-2 rounded-full bg-white" />}
                  </div>

                  {/* Card */}
                  <div
                    className={`flex-1 rounded-2xl border p-4 shadow-sm ${
                      v.isHead
                        ? 'border-violet-300 bg-violet-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* Version header */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs font-mono text-slate-400">
                        v{index + 1}
                      </span>
                      {v.isHead && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-300">
                          {t('currentVersion')}
                        </span>
                      )}
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          v.status === 'COMPLETE'
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            : 'bg-amber-100 text-amber-700 border-amber-300'
                        }`}
                      >
                        {v.status === 'COMPLETE' ? 'AI reviewed' : 'Pending AI'}
                      </span>
                      <span className="ms-auto text-xs text-slate-400">
                        {new Date(v.createdAt).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>

                    {/* Preview */}
                    <p className="text-sm text-slate-700 leading-relaxed line-clamp-3">
                      {v.preview || '—'}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                      <span>{v.mentionCount} {t('mentions')}</span>
                      <span className="font-mono truncate max-w-[120px]">{v.contentHash.slice(0, 12)}…</span>
                      {v.isHead && (
                        <Link
                          href={`/theses/${id}/edit`}
                          className="ms-auto text-violet-600 hover:text-violet-700 font-medium transition-colors"
                        >
                          {t('editBtn')} →
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>
    </div>
  );
}
