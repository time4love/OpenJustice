'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { apiUrl } from '@/lib/api';
import { StrengthBadge } from '@/components/StrengthBadge';
import type { ThesisSummary } from '@/types/thesis';

// ---------------------------------------------------------------------------
// Call card
// ---------------------------------------------------------------------------

function CallCard({ thesis, t }: {
  thesis: ThesisSummary;
  t: ReturnType<typeof useTranslations<'call'>>;
}) {
  const strength = thesis.headVersion?.strength;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4 hover:border-slate-400 hover:shadow-md transition-all">
      {/* Title + strength */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900 text-sm leading-snug">
          {thesis.title ?? t('defaultTitle')}
        </h3>
        {strength && <StrengthBadge strength={strength} />}
      </div>

      {/* Preview */}
      {thesis.headVersion?.preview && (
        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed flex-1">
          {thesis.headVersion.preview}
        </p>
      )}

      {/* Meta row */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto gap-3">
        <div className="flex items-center gap-3">
          {thesis.openGapCount > 0 && (
            <span className="text-xs font-semibold text-red-600">
              {t('indexGaps', { count: thesis.openGapCount })}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {thesis.headVersion?.mentionCount ?? 0} {t('statEvidence')}
          </span>
        </div>
        <Link
          href={`/call/${thesis.id}`}
          className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
        >
          {t('indexViewCase')}
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CallIndexPage() {
  const t = useTranslations('call');

  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/thesis'))
      .then((r) => r.ok ? r.json() as Promise<{ theses: ThesisSummary[] }> : Promise.reject(r.status))
      .then((data) => {
        const sorted = data.theses
          .filter((thesis) => thesis.headVersion?.status === 'COMPLETE')
          .sort((a, b) => b.openGapCount - a.openGapCount);
        setTheses(sorted);
      })
      .catch(() => setError(t('loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <SiteHeader current="call" />

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{t('indexTitle')}</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">{t('indexSubtitle')}</p>
          {!loading && theses.length > 0 && (
            <p className="text-xs text-slate-400 font-mono mt-2">
              {t('indexAllCases', { count: theses.length })}
            </p>
          )}
        </div>

        {/* States */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-52 bg-white border border-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && theses.length === 0 && (
          <div className="bg-white border border-slate-200 border-dashed rounded-xl p-16 text-center">
            <p className="text-slate-500 text-sm">{t('indexEmpty')}</p>
          </div>
        )}

        {!loading && !error && theses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {theses.map((thesis) => (
              <CallCard key={thesis.id} thesis={thesis} t={t} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
