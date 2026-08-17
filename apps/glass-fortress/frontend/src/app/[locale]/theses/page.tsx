'use client';

import { useState, useEffect, FormEvent } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { TopNav } from '@/components/TopNav';
import { useAuth } from '@/context/AuthContext';

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

interface ThesisSuggestion {
  proposedTitle: string;
  thesisStatement: string;
  narrativeBody: string;
  confidenceLevel: 'WEAK' | 'MODERATE' | 'STRONG';
  summaryHe: string;
  keyFigures: string[];
  supportingHashes: string[];
  missingEvidence: string[];
  readyForDraft: {
    title: string;
    body: string;
    evidenceHashes: string[];
    keyFigures: string[];
  };
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
// Generate from Evidence modal
// ---------------------------------------------------------------------------

const CONFIDENCE_STYLES: Record<string, string> = {
  WEAK: 'bg-red-100 text-red-700 border-red-200',
  MODERATE: 'bg-amber-100 text-amber-700 border-amber-200',
  STRONG: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function GenerateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (thesisId: string) => void;
}) {
  const t = useTranslations('theses');
  const [topic, setTopic] = useState('');
  const [state, setState] = useState<'idle' | 'searching' | 'done' | 'error'>('idle');
  const [suggestion, setSuggestion] = useState<ThesisSuggestion | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setState('searching');
    setErrorMsg(null);
    setSuggestion(null);

    try {
      const res = await fetch(apiUrl('/api/thesis/suggest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = (await res.json()) as ThesisSuggestion & { error?: string };
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? t('generateError'));
        setState('error');
        return;
      }
      setSuggestion(data);
      setState('done');
    } catch {
      setErrorMsg(t('generateError'));
      setState('error');
    }
  }

  async function handleCreateDraft() {
    if (!suggestion) return;
    setCreating(true);
    try {
      const res = await fetch(apiUrl('/api/thesis/draft'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suggestion.readyForDraft),
      });
      const data = (await res.json()) as { thesisId?: string; error?: string };
      if (!res.ok || !data.thesisId) {
        setErrorMsg(data.error ?? t('generateError'));
        return;
      }
      onCreated(data.thesisId);
    } catch {
      setErrorMsg(t('generateError'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{t('generateModalTitle')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors text-lg leading-none"
            aria-label={t('generateCancelBtn')}
          >
            &times;
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Topic input */}
          <form onSubmit={handleSearch} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
              {t('generateTopicLabel')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t('generateTopicPlaceholder')}
                disabled={state === 'searching'}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
                dir="auto"
              />
              <button
                type="submit"
                disabled={!topic.trim() || state === 'searching'}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-40 transition-colors"
              >
                {state === 'searching' ? t('generateSearchingBtn') : t('generateSubmitBtn')}
              </button>
            </div>
          </form>

          {/* Error */}
          {state === 'error' && errorMsg && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          {/* Suggestion result */}
          {state === 'done' && suggestion && (
            <div className="space-y-4">
              {/* Title + confidence */}
              <div className="flex flex-wrap items-start gap-2">
                <p className="text-sm font-semibold text-slate-900 flex-1" dir="auto">
                  {suggestion.proposedTitle}
                </p>
                <span
                  className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLES[suggestion.confidenceLevel] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}
                >
                  {t('generateConfidenceLabel')}: {suggestion.confidenceLevel}
                </span>
              </div>

              {/* Summary */}
              <p className="text-xs text-slate-600 leading-relaxed" dir="rtl">
                {suggestion.summaryHe}
              </p>

              {/* Supporting evidence count */}
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  {t('generateSupportingLabel')}: {suggestion.supportingHashes.length}
                </span>
                {suggestion.missingEvidence.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {t('generateMissingLabel')}: {suggestion.missingEvidence.length}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                {errorMsg && <p className="text-xs text-red-600">{errorMsg}</p>}
                <div className="flex gap-2 ms-auto">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    {t('generateCancelBtn')}
                  </button>
                  <button
                    onClick={() => void handleCreateDraft()}
                    disabled={creating}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors"
                  >
                    {creating ? t('generateCreatingBtn') : t('generateCreateDraftBtn')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ThesesPage() {
  const t = useTranslations('theses');
  const tc = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const { researcher } = useAuth();
  const canEdit = researcher?.approved ?? false;

  const searchParams = useSearchParams();
  const evidenceFilter = searchParams.get('evidence');

  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

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

  function handleDraftCreated(thesisId: string) {
    router.push(`/theses/${thesisId}`);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/icon_dove.png" alt="" width={24} height={24} className="w-5 h-5" />
            <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
              {tc('appName')}
            </span>
            <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">
              {t('tagline')}
            </span>
          </Link>
          <TopNav current="theses" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Title row */}
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h1>
            <p className="text-slate-500 text-sm mt-1">{t('tagline')}</p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setGenerateOpen(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-violet-700 border border-violet-300 hover:bg-violet-50 transition-colors"
              >
                &#x2728; {t('generateBtn')}
              </button>
              <Link
                href="/theses/new"
                className="px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white transition-colors"
              >
                + {t('newThesisHeading')}
              </Link>
            </div>
          )}
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
            {canEdit && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setGenerateOpen(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-violet-700 border border-violet-300 hover:bg-violet-50 transition-colors"
                >
                  &#x2728; {t('generateBtn')}
                </button>
                <Link
                  href="/theses/new"
                  className="inline-block px-4 py-2 bg-violet-700 hover:bg-violet-600 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  {t('newThesisHeading')}
                </Link>
              </div>
            )}
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

      {/* Generate from Evidence modal */}
      {generateOpen && (
        <GenerateModal
          onClose={() => setGenerateOpen(false)}
          onCreated={handleDraftCreated}
        />
      )}
    </div>
  );
}
