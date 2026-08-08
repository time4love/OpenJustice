'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FalsificationAttempt {
  claim: string;
  counterArgument: string;
  evidenceGap: string;
}

interface FalsificationResult {
  survivingClaims: string[];
  falsificationAttempts: FalsificationAttempt[];
  weakestLink: string;
  recommendedEvidence: string[];
}

interface Thesis {
  id: string;
  title: string;
  content: string;
  status: string;
  authorAddress: string;
  publishedAt: string | null;
  createdAt: string;
  aiFeedback: FalsificationResult | null;
  taggedEvidence: { id: string; summary: string; category: string; evidenceDate: string }[];
  taggedFigures: { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('theses');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl(`/api/thesis/${id}`));
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { thesis: Thesis };
        setThesis(data.thesis);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // -----------------------------------------------------------------------
  // Render content from TipTap JSON (plain text fallback for display)
  // -----------------------------------------------------------------------
  function renderContent(raw: string): string {
    try {
      const doc = JSON.parse(raw) as { content?: { content?: { text?: string }[] }[] };
      return (
        doc.content
          ?.flatMap(block => block.content?.map(n => n.text ?? '') ?? [])
          .join('') ?? raw
      );
    } catch {
      return raw;
    }
  }

  // -----------------------------------------------------------------------
  // Loading / error
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">{t('savingBtn')}</p>
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400">{t('errorEvaluate')}</p>
          <Link href="/theses" className="text-slate-400 hover:text-white text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
        </div>
      </div>
    );
  }

  const evaluation = thesis.aiFeedback;

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/theses" className="text-slate-400 hover:text-white text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-700">·</span>
          <span className="text-slate-500 text-xs">{tc('appName')}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Status badge */}
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${
              thesis.status === 'PUBLISHED'
                ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50'
                : thesis.status === 'PENDING_MODERATION'
                ? 'bg-amber-900/50 text-amber-300 border border-amber-700/50'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {thesis.status.replace('_', ' ')}
          </span>
          {thesis.publishedAt && (
            <span className="text-slate-500 text-xs">
              {new Date(thesis.publishedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white leading-tight">{thesis.title}</h1>

        {/* Author */}
        {thesis.authorAddress && (
          <p className="text-slate-500 text-sm font-mono">{thesis.authorAddress}</p>
        )}

        {/* Body */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
            {renderContent(thesis.content)}
          </p>
        </div>

        {/* Tagged figures */}
        {thesis.taggedFigures.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('figureSuggestion')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {thesis.taggedFigures.map(f => (
                <Link
                  key={f.id}
                  href={`/figures?id=${f.id}`}
                  className="bg-violet-900/50 hover:bg-violet-800/60 text-violet-300 text-xs px-3 py-1 rounded-full transition-colors"
                >
                  @{f.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Tagged evidence */}
        {thesis.taggedEvidence.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('evidenceSuggestion')} ({thesis.taggedEvidence.length})
            </h3>
            <div className="space-y-2">
              {thesis.taggedEvidence.map(ev => (
                <div
                  key={ev.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex gap-3 items-start"
                >
                  <span className="bg-amber-900/50 text-amber-300 text-xs px-2 py-0.5 rounded-full shrink-0">
                    {ev.category}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-300 truncate">{ev.summary}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{ev.evidenceDate}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Falsification results */}
        {evaluation && (
          <section className="space-y-5 pt-4 border-t border-slate-800">
            <h2 className="text-lg font-bold text-white">{t('evaluationTitle')}</h2>

            {/* Surviving claims */}
            {evaluation.survivingClaims.length > 0 ? (
              <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">
                  {t('survivingClaimsLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {evaluation.survivingClaims.map((claim, i) => (
                    <li key={i} className="text-sm text-emerald-200 flex gap-2">
                      <span className="text-emerald-500 shrink-0">✓</span>
                      <span>{claim}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4 text-sm text-red-300">
                {t('noSurvivingClaims')}
              </div>
            )}

            {/* Falsification attempts */}
            {evaluation.falsificationAttempts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {t('falsificationLabel')}
                </h3>
                {evaluation.falsificationAttempts.map((attempt, i) => (
                  <div
                    key={i}
                    className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {t('claimLabel')}
                      </span>
                      <p className="text-sm text-white mt-0.5">{attempt.claim}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-red-400 uppercase tracking-wide">
                        {t('counterArgLabel')}
                      </span>
                      <p className="text-sm text-red-300 mt-0.5">{attempt.counterArgument}</p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                        {t('evidenceGapLabel')}
                      </span>
                      <p className="text-sm text-amber-300 mt-0.5">{attempt.evidenceGap}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Weakest link */}
            <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wide">
                {t('weakestLinkLabel')}
              </h3>
              <p className="text-sm text-red-200 mt-1">{evaluation.weakestLink}</p>
            </div>

            {/* Recommended evidence */}
            {evaluation.recommendedEvidence.length > 0 && (
              <div className="bg-violet-950/30 border border-violet-800/40 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-violet-400 uppercase tracking-wide">
                  {t('recommendedEvidenceLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {evaluation.recommendedEvidence.map((rec, i) => (
                    <li key={i} className="text-sm text-violet-200 flex gap-2">
                      <span className="text-violet-500 shrink-0">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
