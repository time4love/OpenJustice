'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { SiteHeader } from '@/components/SiteHeader';
import { useAuth } from '@/context/AuthContext';
import type { ThesisSummary as FullThesisSummary } from '@/types/thesis';
import { strengthBadgeClass } from '@/components/StrengthBadge';
import { fetchTheses } from '@/lib/thesisApi';
import { PublicationBadge } from '@/components/PublicationBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ThesisSummary = Pick<FullThesisSummary, 'id' | 'createdAt' | 'version' | 'publication'>;

interface ThesisCitation {
  id: number;
  fileHashes: string[];
}

interface ThesisSuggestion {
  proposedTitle: string;
  thesisStatement: string;
  narrativeBody: string;
  confidenceLevel: 'WEAK' | 'MODERATE' | 'STRONG';
  summaryHe: string;
  keyFigures: string[];
  supportingHashes: string[];
  citations: ThesisCitation[];
  missingEvidence: string[];
  readyForDraft: {
    title: string;
    body: string;
    evidenceHashes: string[];
    keyFigures: string[];
    citations: ThesisCitation[];
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('theses');
  const styles =
    status === 'COMPLETE'
      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
      : 'bg-amber-100 text-amber-700 border border-amber-300';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles}`}>
      {status === 'COMPLETE' ? t('aiReviewedStatus') : t('pendingAiStatus')}
    </span>
  );
}


// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ThesesPage() {
  const t = useTranslations('theses');
  const locale = useLocale();
  const { researcher } = useAuth();
  const canEdit = researcher?.approved ?? false;

  const searchParams = useSearchParams();
  const evidenceFilter = searchParams.get('evidence');

  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const query = evidenceFilter ? `evidence=${encodeURIComponent(evidenceFilter)}` : undefined;
        setTheses(await fetchTheses(query));
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
      <SiteHeader current="theses" maxWidth="max-w-5xl" tagline={t('tagline')} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Title row */}
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('tagline')}</p>
          </div>
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

        {/* The empty state describes what THIS VIEWER can see, never a fact about
            the world. One string for everyone told a public visitor there are no
            theses while unpublished drafts existed — not a leak, the inverse: a
            false statement made to avoid one. It still reveals no count or title. */}
        {!loading && !error && theses.length === 0 && (
          <div className="text-center py-24 space-y-3">
            <p className="text-slate-500 text-lg">{canEdit ? t('emptyState') : t('emptyStatePublic')}</p>
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
                    {thesis.version?.preview ?? '—'}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <PublicationBadge publication={thesis.publication} />
                    {thesis.version && (
                      <StatusBadge status={thesis.version.status} />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-500">
                  <span>
                    {new Date(thesis.createdAt).toLocaleDateString(
                      locale === 'he' ? 'he-IL' : 'en-US'
                    )}
                  </span>
                  {thesis.version && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>{thesis.version.mentionCount} {t('mentions')}</span>
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
