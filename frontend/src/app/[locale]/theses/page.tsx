'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { TopNav } from '@/components/TopNav';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ThesisSummary {
  id: string;
  title: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  taggedFigures: { id: string; name: string }[];
  evidenceCount: number;
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'PUBLISHED'
      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
      : status === 'PENDING_MODERATION'
      ? 'bg-amber-100 text-amber-700 border border-amber-300'
      : status === 'AI_REVIEWED'
      ? 'bg-violet-100 text-violet-700 border border-violet-300'
      : 'bg-slate-100 text-slate-500 border border-slate-300';

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles}`}>
      {status.replace(/_/g, ' ')}
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

  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl('/api/thesis'));
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
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">⬡</span>
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">{tc('appName')}</span>
            <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">{t('tagline')}</span>
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

        {/* States */}
        {loading && (
          <div className="text-slate-500 text-sm">{t('savingBtn')}</div>
        )}

        {error && (
          <div className="text-red-600 text-sm">{t('errorSave')}</div>
        )}

        {!loading && !error && theses.length === 0 && (
          <div className="text-center py-24 space-y-3">
            <p className="text-slate-500 text-lg">{t('noSurvivingClaims')}</p>
            <Link
              href="/theses/new"
              className="inline-block px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white transition-colors"
            >
              {t('newThesisHeading')}
            </Link>
          </div>
        )}

        {/* Theses list */}
        {theses.length > 0 && (
          <div className="space-y-4">
            {theses.map(thesis => (
              <Link
                key={thesis.id}
                href={`/theses/${thesis.id}`}
                className="block bg-white border border-slate-200 hover:border-slate-400 rounded-2xl p-5 transition-colors group shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900 group-hover:text-violet-700 transition-colors">
                    {thesis.title}
                  </h2>
                  <StatusBadge status={thesis.status} />
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
                  {thesis.publishedAt && (
                    <span>
                      {new Date(thesis.publishedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
                    </span>
                  )}
                  <span className="text-slate-300">·</span>
                  <span>{t('evidenceSuggestion')}: {thesis.evidenceCount}</span>
                  {thesis.taggedFigures.length > 0 && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="flex gap-1 flex-wrap">
                        {thesis.taggedFigures.slice(0, 3).map(f => (
                          <span
                            key={f.id}
                            className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full"
                          >
                            @{f.name}
                          </span>
                        ))}
                        {thesis.taggedFigures.length > 3 && (
                          <span className="text-slate-500">+{thesis.taggedFigures.length - 3}</span>
                        )}
                      </span>
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
