'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types matching the versioned thesis API
// ---------------------------------------------------------------------------

interface ThesisMention {
  id: string;
  type: 'KEY_FIGURE' | 'EVIDENCE' | 'TRACKED_URL';
  refId: string;
}

interface CounterArgument {
  claim: string;
  counterArgument: string;
  strengthOfCounter: string;
}

interface EvidenceGap {
  description: string;
  impact: string;
}

interface AIAnalysis {
  counterArguments: CounterArgument[];
  evidenceGaps: EvidenceGap[];
  alternativeInterpretations: string[];
  overallStrengthAssessment: 'WEAK' | 'MODERATE' | 'STRONG' | 'COMPELLING';
  summaryHe: string;
}

interface HeadVersion {
  id: string;
  status: 'PENDING_AI' | 'COMPLETE';
  contentHash: string;
  userContent: Record<string, unknown>;
  aiAnalysis: AIAnalysis | null;
  mentions: ThesisMention[];
  createdAt: string;
}

interface Thesis {
  id: string;
  headVersionId: string | null;
  createdAt: string;
  headVersion: HeadVersion | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractText(doc: unknown): string {
  function walk(node: Record<string, unknown>): string {
    if (node.type === 'text') return String(node.text ?? '');
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (node.type === 'keyFigureMention') return `@${String(attrs?.['label'] ?? attrs?.['id'] ?? '')}`;
    if (node.type === 'evidenceMention') return `#${String(attrs?.['label'] ?? attrs?.['id'] ?? '')}`;
    if (node.type === 'trackedUrlMention') return `#${String(attrs?.['label'] ?? attrs?.['id'] ?? '')}`;
    const content = node.content;
    if (!Array.isArray(content)) return '';
    const sep = ['paragraph', 'heading', 'blockquote', 'listItem'].includes(String(node.type ?? '')) ? '\n' : ' ';
    return (content as unknown[]).map(c => walk(c as Record<string, unknown>)).join(sep);
  }
  return walk(doc as Record<string, unknown>).replace(/\n{3,}/g, '\n\n').trim();
}

const STRENGTH_STYLES: Record<string, string> = {
  WEAK: 'bg-red-50 border-red-200 text-red-700',
  MODERATE: 'bg-amber-50 border-amber-200 text-amber-700',
  STRONG: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  COMPELLING: 'bg-violet-50 border-violet-200 text-violet-700',
};

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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">{t('savingBtn')}</p>
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-600">{t('errorEvaluate')}</p>
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
        </div>
      </div>
    );
  }

  const hv = thesis.headVersion;
  const analysis = hv?.aiAnalysis ?? null;
  const bodyText = hv ? extractText(hv.userContent) : '';
  const keyFigureMentions = hv?.mentions.filter(m => m.type === 'KEY_FIGURE') ?? [];
  const evidenceMentions = hv?.mentions.filter(m => m.type === 'EVIDENCE') ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 text-xs">{tc('appName')}</span>
          <div className="ms-auto flex items-center gap-2">
            <Link
              href={`/theses/${id}/edit`}
              className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 rounded-lg text-xs font-medium text-white transition-colors"
            >
              {t('editBtn')}
            </Link>
            <Link
              href={`/theses/${id}/history`}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors"
            >
              {t('historyBtn')}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Status + date */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span
            className={`font-semibold px-3 py-1 rounded-full border ${
              hv?.status === 'COMPLETE'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-amber-100 text-amber-700 border-amber-300'
            }`}
          >
            {hv?.status === 'COMPLETE' ? 'AI reviewed' : 'Pending AI'}
          </span>
          <span>
            {new Date(thesis.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
          </span>
        </div>

        {/* Thesis body */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{bodyText}</p>
        </div>

        {/* Mentioned key figures */}
        {keyFigureMentions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('keyFiguresLabel')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {keyFigureMentions.map(m => (
                <span
                  key={m.id}
                  className="bg-violet-100 text-violet-700 text-xs px-3 py-1 rounded-full"
                >
                  @{m.refId}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mentioned evidence */}
        {evidenceMentions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('evidenceSuggestion')} ({evidenceMentions.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {evidenceMentions.map(m => (
                <Link
                  key={m.id}
                  href={`/timeline?hash=${m.refId}`}
                  className="bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs px-3 py-1 rounded-full transition-colors"
                >
                  #{m.refId.slice(0, 8)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* AI analysis — DevilsAdvocate */}
        {analysis && (
          <section className="space-y-5 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">{t('aiAnalysisTitle')}</h2>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                  STRENGTH_STYLES[analysis.overallStrengthAssessment] ?? ''
                }`}
              >
                {analysis.overallStrengthAssessment}
              </span>
            </div>

            {/* Hebrew summary */}
            {analysis.summaryHe && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4" dir="rtl">
                <p className="text-sm text-slate-700 leading-relaxed">{analysis.summaryHe}</p>
              </div>
            )}

            {/* Counter-arguments */}
            {analysis.counterArguments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('counterArgumentsLabel')}
                </h3>
                {analysis.counterArguments.map((ca, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm"
                  >
                    <p className="text-sm text-slate-900 font-medium">{ca.claim}</p>
                    <p className="text-sm text-red-700">{ca.counterArgument}</p>
                    <span className="inline-block text-xs text-slate-400 font-medium">
                      {ca.strengthOfCounter}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Evidence gaps */}
            {analysis.evidenceGaps.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('evidenceGapsLabel')}
                </h3>
                {analysis.evidenceGaps.map((gap, i) => (
                  <div
                    key={i}
                    className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1"
                  >
                    <p className="text-sm text-amber-800">{gap.description}</p>
                    <p className="text-xs text-amber-600">{gap.impact}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Alternative interpretations */}
            {analysis.alternativeInterpretations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('alternativeInterpretationsLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {analysis.alternativeInterpretations.map((interp, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-slate-400 shrink-0">↔</span>
                      <span>{interp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Pending AI notice */}
        {hv?.status === 'PENDING_AI' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm">
            {t('pendingAiNotice')}
          </div>
        )}
      </main>
    </div>
  );
}
