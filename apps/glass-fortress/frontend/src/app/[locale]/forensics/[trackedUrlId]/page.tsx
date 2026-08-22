'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { apiUrl } from '@/lib/api';
import { SkeletonRows } from '@/components/SkeletonRows';
import { DiffCard, type DiffRecord, type PromotedEvidence } from '@/components/DiffCard';
import { TrajectoryPanel } from '@/components/TrajectoryPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffPage {
  trackedUrlId: string;
  url: string;
  title: string | null;
  createdAt: string;
  totalCount: number;
  significantCount: number;
  diffs: DiffRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  error?: string;
  message?: string;
}

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <SkeletonRows
      rows={3}
      headerBarWidths={['w-24']}
      bodyLineWidths={['w-3/4', 'w-1/2']}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrackedUrlPage() {
  const t = useTranslations('forensics');
  const params = useParams<{ trackedUrlId: string }>();
  const trackedUrlId = params?.trackedUrlId ?? '';

  // Meta (url, title, totals) from the first page response. Both counts are
  // server-computed over the whole timeline — see below for why neither may be
  // derived from `diffs`.
  const [meta, setMeta] = useState<Pick<
    DiffPage,
    'url' | 'title' | 'createdAt' | 'totalCount' | 'significantCount'
  > | null>(null);
  const [diffs, setDiffs] = useState<DiffRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived, not tracked: every terminal outcome of the first fetch sets one of
  // these — meta on success, error on either failure path — so a separate
  // boolean could only ever restate them, and setting it from inside the effect
  // was a cascading render for no information gained.
  const initialLoading = meta === null && error === null;
  const [reportLoading, setReportLoading] = useState(false);

  // Sentinel ref for IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guard against duplicate fetches
  const fetchingRef = useRef(false);

  // A plain <a href={apiUrl(...)}> navigation doesn't go through the patched
  // fetch() that attaches the staging access-gate header (stagingApiAuth.ts
  // only wraps `window.fetch`), so on staging this always 401'd. Fetching the
  // report HTML through the real fetch() and opening it as a blob URL keeps
  // the same "opens in a new tab, browser print-dialog saves as PDF" UX while
  // actually carrying the auth header.
  async function openReport() {
    setReportLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/forensics/tracked/${trackedUrlId}/report`));
      if (!res.ok) throw new Error();
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      // The report is a convenience export, not core page functionality —
      // fail silently rather than block the rest of the page on it.
    } finally {
      setReportLoading(false);
    }
  }

  async function fetchPage(cursor: string | null) {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const url = cursor
        ? apiUrl(`/api/forensics/tracked/${trackedUrlId}?cursor=${cursor}&limit=${PAGE_SIZE}`)
        : apiUrl(`/api/forensics/tracked/${trackedUrlId}?limit=${PAGE_SIZE}`);
      const res = await fetch(url);
      const json = (await res.json()) as DiffPage;
      if (!res.ok) {
        setError(json.message ?? `Error ${res.status}`);
        return;
      }
      // Functional update — sets meta only on the first page; safe against stale closures
      setMeta((prev) =>
        prev ?? {
          url: json.url,
          title: json.title,
          createdAt: json.createdAt,
          totalCount: json.totalCount,
          significantCount: json.significantCount,
        },
      );
      setDiffs((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        return [...prev, ...json.diffs.filter((d) => !seen.has(d.id))];
      });
      setNextCursor(json.nextCursor);
      setHasMore(json.hasMore);
    } catch {
      setError('Could not reach the backend.');
    } finally {
      fetchingRef.current = false;
    }
  }

  // Initial load
  useEffect(() => {
    if (!trackedUrlId) return;
    void fetchPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedUrlId]);

  // IntersectionObserver — fires when the sentinel enters the viewport
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore && !loadingMore && !fetchingRef.current) {
        setLoadingMore(true);
        void fetchPage(nextCursor).finally(() => setLoadingMore(false));
      }
    },
    // nextCursor and hasMore must be deps so the callback sees current values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMore, loadingMore, nextCursor],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '200px', // start loading 200px before reaching the bottom
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  function handlePromoted(diffId: string, evidence: PromotedEvidence) {
    setDiffs((prev) => prev.map((d) => (d.id === diffId ? { ...d, promotedEvidence: evidence } : d)));
  }

  const diffLabels = {
    deletionsLabel: t('deletionsLabel'),
    additionsLabel: t('additionsLabel'),
    forensicLabel: t('forensicLabel'),
    viewSnapshot: t('viewSnapshot'),
    viewBeforeSnapshot: t('viewBeforeSnapshot'),
    promoteBtn: t('promoteBtn'),
    promotingBtn: t('promotingBtn'),
    alreadyPromoted: t('alreadyPromoted'),
    promoteSuccess: t('promoteSuccess'),
    promoteError: t('promoteError'),
    flaggedBadge: t('flaggedBadge'),
    auditBadge: t('auditBadge'),
    showChanges: t('showChanges'),
    hideChanges: t('hideChanges'),
    addToThesis: {
      addBtn: t('addToThesisBtn'),
      saving: t('addToThesisSaving'),
      done: t('addToThesisDone'),
      pick: t('addToThesisPick'),
      loading: t('addToThesisLoading'),
      empty: t('addToThesisEmpty'),
      untitled: (id: string) => t('addToThesisUntitled', { id }),
    },
  };

  // Server-computed over the whole timeline, NOT counted from `diffs`.
  //
  // `diffs` holds only the pages loaded so far (PAGE_SIZE at a time), so
  // counting it produced a number that described the reader's scroll position
  // rather than the scan. With two pages loaded this badge said "3 legally
  // significant changes were identified" for a page that had 5 — and the
  // number grew silently as more loaded. On an evidence platform, a summary
  // that under-reports findings is a correctness bug.
  const flaggedCount = meta?.significantCount ?? 0;

  const visibleDiffs = diffs.filter(
    (d) =>
      d.isLegallySignificant ||
      d.deletedItems.length > 0 ||
      d.addedItems.length > 0 ||
      d.rawDeletedChunks.length > 0 ||
      d.rawAddedChunks.length > 0,
  );

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <SiteHeader current="forensics" maxWidth="max-w-4xl" tagline={t('drillDownTagline')} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Back link */}
        <Link
          href="/forensics"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          {t('drillDownBack')}
        </Link>

        {/* Heading */}
        {meta && (
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-slate-900">{t('drillDownHeading')}</h1>
            <p className="font-mono text-xs text-slate-500 break-all">{meta.url}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {/* Initial loading skeleton */}
        {initialLoading && <Skeleton />}

        {/* Results */}
        {!initialLoading && meta && (
          <>
            {meta.totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-8 py-20 border border-dashed border-slate-200 rounded-xl bg-white shadow-sm">
                <p className="text-sm font-medium text-slate-500">{t('noChangesTitle')}</p>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    {t('auditTotal', { count: meta.totalCount })}
                  </span>
                  {flaggedCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      {t('resultsHeading', { count: flaggedCount })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void openReport()}
                    disabled={reportLoading}
                    className="ms-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    {t('downloadPdf')}
                  </button>
                </div>

                {/* Claim trajectories.
                    Above the diff timeline on purpose: a diff is one step, a
                    trajectory is the shape those steps make, and a reader who
                    scrolls the steps first has already formed a view of them
                    individually. */}
                <TrajectoryPanel
                  trackedUrlId={trackedUrlId}
                  labels={{
                    heading: t('trajectoryHeading'),
                    explainer: t('trajectoryExplainer'),
                    empty: t('trajectoryEmpty'),
                    notComputed: t('trajectoryNotComputed'),
                    movedTogether: (count: number) => t('trajectoryMovedTogether', { count }),
                    flips: (count: number) => t('trajectoryFlips', { count }),
                    present: t('trajectoryPresent'),
                    removed: t('trajectoryRemoved'),
                    finalRemoved: t('trajectoryFinalRemoved'),
                    finalPresent: t('trajectoryFinalPresent'),
                    openSnapshot: t('trajectoryOpenSnapshot'),
                    showClaims: (count: number) => t('trajectoryShowClaims', { count }),
                    hideClaims: t('trajectoryHideClaims'),
                    verifyHint: t('trajectoryVerifyHint'),
                  }}
                />

                {/* Diff timeline */}
                <div>
                  {visibleDiffs.map((diff, i) => (
                    <DiffCard
                      key={diff.id}
                      diff={diff}
                      index={i}
                      labels={diffLabels}
                      onPromoted={handlePromoted}
                    />
                  ))}
                </div>

                {/* Sentinel + load-more indicator */}
                <div ref={sentinelRef} className="py-2">
                  {loadingMore && (
                    <div className="animate-pulse space-y-5">
                      {[1, 2].map((i) => (
                        <div key={i} className="flex gap-4">
                          <div className="flex flex-col items-center shrink-0">
                            <div className="w-3 h-3 rounded-full bg-slate-200 mt-[1.125rem]" />
                            <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-16" />
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
                  )}
                  {!hasMore && diffs.length > 0 && (
                    <p className="text-center text-xs text-slate-400 py-4">
                      {t('allDiffsLoaded', { count: diffs.length })}
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
