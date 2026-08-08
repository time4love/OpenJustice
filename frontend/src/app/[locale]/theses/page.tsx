'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { TopNav } from '@/components/TopNav';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeadVersionSummary {
  id: string;
  status: string;
  preview: string;
  mentionCount: number;
  createdAt: string;
}

interface ThesisSummary {
  id: string;
  createdAt: string;
  headVersion: HeadVersionSummary | null;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'COMPLETE'
      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
      : 'bg-amber-100 text-amber-700 border border-amber-300';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles}`}>
      {status === 'COMPLETE' ? 'AI reviewed' : 'Pending AI'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ThesesPage() {
  const t = useTranslations('theses');
  const tc = useTranslations('common');
  const locale = useLocale();

  const searchParams = useSearchParams();
  const evidenceFilter = searchParams.get('evidence');

  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const url = evidenceFilter
          ? apiUrl(`/api/thesis?evidence=${encodeURIComponent(evidenceFilter)}`)
          : apiUrl('/api/thesis');
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { theses: ThesisSummary[] };
        setTheses(data.theses);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [evidenceFilter]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">⬡</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
            <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">
              {t('tagline')}
            </span>
          </div>
          <TopNav current="theses" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Title row */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('tagline')}</p>
          </div>
          <Link
            href="/theses/new"
            className="shrink-0 px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white transition-colors"
          >
            + {t('newThesisHeading')}
          </Link>
        </div>

        {/* Evidence filter banner */}
        {evidenceFilter && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm">
            <span className="text-amber-700">{t('filteredByEvidence')}</span>
            <span className="font-mono text-xs text-amber-600">{evidenceFilter.slice(0, 12)}…</span>
            <Link href="/theses" className="ms-auto text-xs text-amber-600 hover:text-amber-800 underline">
              {t('clearFilter')}
            </Link>
          </div>
        )}

        {loading && <div className="text-slate-500 text-sm">{t('savingBtn')}</div>}

        {error && <div className="text-red-600 text-sm">{t('errorSave')}</div>}

        {!loading && !error && theses.length === 0 && (
          <div className="text-center py-24 space-y-3">
            <p className="text-slate-500 text-lg">{t('emptyState')}</p>
            <Link
              href="/theses/new"
              className="inline-block px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white transition-colors"
            >
              {t('newThesisHeading')}
            </Link>
          </div>
        )}

        {theses.length > 0 && (
          <div className="space-y-4">
            {theses.map(thesis => (
              <Link
                key={thesis.id}
                href={`/theses/${thesis.id}`}
                className="block bg-white border border-slate-200 hover:border-slate-400 rounded-2xl p-5 transition-colors group shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-slate-700 text-sm leading-relaxed line-clamp-2 flex-1">
                    {thesis.headVersion?.preview ?? '—'}
                  </p>
                  {thesis.headVersion && (
                    <StatusBadge status={thesis.headVersion.status} />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
                  <span>
                    {new Date(thesis.createdAt).toLocaleDateString(
                      locale === 'he' ? 'he-IL' : 'en-US'
                    )}
                  </span>
                  {thesis.headVersion && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>{thesis.headVersion.mentionCount} {t('mentions')}</span>
                    </>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
