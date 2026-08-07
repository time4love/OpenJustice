'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromotedEvidence {
  id: string;
  fileHash: string;
}

interface DiffRecord {
  id: string;
  beforeDate: string;
  date: string;
  snapshotUrl: string;
  deletedClaims: string[];
  addedClaims: string[];
  legalSignificance: string;
  isLegallySignificant: boolean;
  promotedEvidence: PromotedEvidence | null;
}

interface TrackedUrlResponse {
  trackedUrlId: string;
  url: string;
  title: string | null;
  createdAt: string;
  count: number;
  diffs: DiffRecord[];
  error?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Locale switcher
// ---------------------------------------------------------------------------

function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      {(['he', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => router.replace(pathname, { locale: l })}
          className={`px-2 py-1 rounded transition-colors ${
            locale === l ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-3 h-3 rounded-full bg-slate-200 mt-[1.125rem]" />
            <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-24" />
          </div>
          <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <div className="h-2.5 bg-slate-200 rounded-full w-24" />
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="h-2 bg-slate-100 rounded w-3/4" />
              <div className="h-2 bg-slate-100 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promote button — handles the on-chain registration of a single diff
// ---------------------------------------------------------------------------

function PromoteButton({
  diffId,
  promoted,
  labels,
  onPromoted,
}: {
  diffId: string;
  promoted: PromotedEvidence | null;
  labels: {
    promoteBtn: string;
    promotingBtn: string;
    alreadyPromoted: string;
    promoteSuccess: string;
    promoteError: string;
  };
  onPromoted: (diffId: string, evidence: PromotedEvidence) => void;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>(
    promoted ? 'done' : 'idle',
  );
  const [err, setErr] = useState<string | null>(null);

  async function handlePromote() {
    setState('loading');
    setErr(null);
    try {
      const res = await fetch(apiUrl('/api/forensics/promote'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urlVersionDiffId: diffId }),
      });
      const data = (await res.json()) as {
        promoted?: boolean;
        fileHash?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        if (res.status === 409) {
          setState('done');
          return;
        }
        setErr(data.message ?? labels.promoteError);
        setState('error');
        return;
      }
      setState('done');
      if (data.fileHash) {
        onPromoted(diffId, { id: '', fileHash: data.fileHash });
      }
    } catch {
      setErr(labels.promoteError);
      setState('error');
    }
  }

  if (state === 'done' || promoted) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        {labels.promoteSuccess}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => { void handlePromote(); }}
        disabled={state === 'loading'}
        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        dir="auto"
      >
        {state === 'loading' ? labels.promotingBtn : labels.promoteBtn}
      </button>
      {state === 'error' && err && (
        <p className="text-xs text-red-600" dir="auto">
          {err}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff card — visual hierarchy based on AI significance flag
// ---------------------------------------------------------------------------

function DiffCard({
  diff,
  index,
  labels,
  onPromoted,
}: {
  diff: DiffRecord;
  index: number;
  labels: {
    deletionsLabel: string;
    additionsLabel: string;
    forensicLabel: string;
    viewSnapshot: string;
    promoteBtn: string;
    promotingBtn: string;
    alreadyPromoted: string;
    promoteSuccess: string;
    promoteError: string;
    flaggedBadge: string;
    auditBadge: string;
  };
  onPromoted: (diffId: string, evidence: PromotedEvidence) => void;
}) {
  const sig = diff.isLegallySignificant;

  // Visual tokens driven by significance
  const dotClass = sig
    ? 'bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.5)]'
    : 'bg-slate-400';
  const cardClass = sig
    ? 'border-red-400 shadow-md bg-red-50/30'
    : 'border-slate-200 shadow-sm bg-white';
  const headerClass = sig
    ? 'border-b border-red-200 bg-red-50'
    : 'border-b border-slate-100 bg-slate-50';
  const footerClass = sig ? 'border-t border-red-100/60' : 'border-t border-slate-100';

  return (
    <div className="flex gap-3 sm:gap-4 mb-5 last:mb-0">
      {/* Spine */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-3 h-3 rounded-full ring-2 ring-slate-50 mt-[1.125rem] shrink-0 ${dotClass}`}
        />
        <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-8" />
      </div>

      {/* Card */}
      <div className={`flex-1 min-w-0 rounded-xl border overflow-hidden ${cardClass}`}>
        {/* Header */}
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 ${headerClass}`}>
          <span className="font-mono text-xs text-slate-400 shrink-0">{diff.beforeDate}</span>
          <span className="text-xs text-slate-300 shrink-0">→</span>
          <span className="font-mono text-xs text-slate-600 font-medium shrink-0">{diff.date}</span>
          {sig ? (
            <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-300 uppercase tracking-wide">
              {labels.flaggedBadge}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200 uppercase tracking-wide">
              {labels.auditBadge}
            </span>
          )}
          <span className="ms-auto text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Deletions — always shown */}
          {diff.deletedClaims.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-red-600 uppercase tracking-widest">
                {labels.deletionsLabel}
              </span>
              <div className="space-y-1">
                {diff.deletedClaims.map((claim, i) => (
                  <div
                    key={`del-${i}`}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200"
                  >
                    <span className="mt-0.5 text-red-400 shrink-0 select-none">&#x2014;</span>
                    <p
                      className="text-sm text-red-700 leading-relaxed line-through decoration-red-400"
                      dir="auto"
                    >
                      {claim}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additions — always shown */}
          {diff.addedClaims.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                {labels.additionsLabel}
              </span>
              <div className="space-y-1">
                {diff.addedClaims.map((claim, i) => (
                  <div
                    key={`add-${i}`}
                    className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200"
                  >
                    <span className="mt-0.5 text-emerald-500 shrink-0 select-none">+</span>
                    <p className="text-sm text-emerald-800 leading-relaxed" dir="auto">
                      {claim}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Forensic Analysis — only shown for flagged diffs */}
          {sig && diff.legalSignificance && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {labels.forensicLabel}
              </span>
              <p
                className="text-sm text-slate-700 leading-relaxed border-s-2 border-red-400 ps-3"
                dir="auto"
              >
                {diff.legalSignificance}
              </p>
            </div>
          )}

          {/* Footer — archive link + promote button (on ALL cards) */}
          <div className={`flex flex-wrap items-center justify-between gap-3 pt-1 ${footerClass}`}>
            <PromoteButton
              diffId={diff.id}
              promoted={diff.promotedEvidence}
              labels={labels}
              onPromoted={onPromoted}
            />
            <a
              href={diff.snapshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              {labels.viewSnapshot}
              <span aria-hidden="true">&#x2197;</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrackedUrlPage() {
  const t = useTranslations('forensics');
  const tc = useTranslations('common');
  const params = useParams<{ trackedUrlId: string }>();
  const trackedUrlId = params?.trackedUrlId ?? '';

  const [data, setData] = useState<TrackedUrlResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackedUrlId) return;
    setLoading(true);
    fetch(apiUrl(`/api/forensics/tracked/${trackedUrlId}`))
      .then(async (res) => {
        const json = (await res.json()) as TrackedUrlResponse;
        if (!res.ok) {
          setError(json.message ?? `Error ${res.status}`);
          return;
        }
        setData(json);
      })
      .catch(() => setError('Could not reach the backend.'))
      .finally(() => setLoading(false));
  }, [trackedUrlId]);

  function handlePromoted(diffId: string, evidence: PromotedEvidence) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        diffs: prev.diffs.map((d) =>
          d.id === diffId ? { ...d, promotedEvidence: evidence } : d,
        ),
      };
    });
  }

  const diffLabels = {
    deletionsLabel: t('deletionsLabel'),
    additionsLabel: t('additionsLabel'),
    forensicLabel: t('forensicLabel'),
    viewSnapshot: t('viewSnapshot'),
    promoteBtn: t('promoteBtn'),
    promotingBtn: t('promotingBtn'),
    alreadyPromoted: t('alreadyPromoted'),
    promoteSuccess: t('promoteSuccess'),
    promoteError: t('promoteError'),
    flaggedBadge: t('flaggedBadge'),
    auditBadge: t('auditBadge'),
  };

  const flaggedCount = data?.diffs.filter((d) => d.isLegallySignificant).length ?? 0;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">&#x29C6;</span>
            <div>
              <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
                {tc('appName')}
              </span>
              <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">
                {t('drillDownTagline')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition-colors"
              >
                {tc('nav.evidenceVault')}
              </Link>
              <Link
                href="/timeline"
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition-colors"
              >
                {tc('nav.timeline')}
              </Link>
              <Link
                href="/forensics"
                className="px-3 py-1.5 rounded text-xs font-medium bg-slate-900 text-white border border-slate-700"
              >
                {tc('nav.forensics')}
              </Link>
            </nav>
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Back link */}
        <Link
          href="/forensics"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          {t('drillDownBack')}
        </Link>

        {/* Heading */}
        {data && (
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-slate-900">{t('drillDownHeading')}</h1>
            <p className="font-mono text-xs text-slate-500 break-all">{data.url}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && <Skeleton />}

        {/* Results */}
        {!loading && data && (
          <>
            {data.count === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-8 py-20 border border-dashed border-slate-200 rounded-xl bg-white shadow-sm">
                <p className="text-sm font-medium text-slate-500">{t('noChangesTitle')}</p>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    {t('auditTotal', { count: data.count })}
                  </span>
                  {flaggedCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {t('resultsHeading', { count: flaggedCount })}
                    </span>
                  )}
                </div>

                {/* Full audit timeline */}
                <div>
                  {data.diffs.map((diff, i) => (
                    <DiffCard
                      key={diff.id}
                      diff={diff}
                      index={i}
                      labels={diffLabels}
                      onPromoted={handlePromoted}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
