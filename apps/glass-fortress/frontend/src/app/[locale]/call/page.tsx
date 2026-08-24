'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { SiteHeader } from '@/components/SiteHeader';
import { ThesisHighlightCard } from '@/components/ThesisHighlightCard';
import { Link } from '@/i18n/navigation';
import type { ThesisSummary } from '@/types/thesis';
import { fetchTheses } from '@/lib/thesisApi';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CallIndexPage() {
  const t = useTranslations('call');
  const tHome = useTranslations('home');

  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTheses()
      .then((theses) => {
        const sorted = theses
          .filter((thesis) => thesis.version?.status === 'COMPLETE')
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
              <ThesisHighlightCard
                key={thesis.id}
                thesis={thesis}
                labels={{
                  noTitle: t('defaultTitle'),
                  gapsLabel: thesis.openGapCount > 0
                    ? t('indexGaps', { count: thesis.openGapCount })
                    : undefined,
                  mentionsLabel: t('statEvidence'),
                  viewLabel: t('indexViewCase'),
                }}
              />
            ))}

            {/* Researcher access CTA — same card as the homepage's "Get Involved" section */}
            <div className="h-full bg-white border-2 border-slate-200 rounded-2xl p-8 flex flex-col gap-4">
              <Image
                src="/icon_research.png"
                alt=""
                width={64}
                height={64}
                className="w-14 h-14 drop-shadow-[0_6px_10px_rgba(15,23,42,0.15)]"
              />
              <h3 className="text-xl font-bold text-slate-900">{tHome('door2Title')}</h3>
              <p className="text-slate-500 text-sm leading-relaxed flex-1">{tHome('door2Body')}</p>
              <Link
                href="/researchers"
                className="self-start px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                {tHome('door2Btn')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
