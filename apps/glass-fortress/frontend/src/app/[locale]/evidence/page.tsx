'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { apiUrl } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonRows } from '@/components/SkeletonRows';
import {
  UnifiedTimeline,
  TimelineSkeleton,
  type TimelineRecord,
  type NodeLabels,
} from '@/components/EvidenceTimeline';
import type { EvidencePerspective } from '@/types/evidence';

const PAGE_SIZE = 20;
const SEARCH_LIMIT = 20;

function FilterBanner({ children, clearLabel }: { children: React.ReactNode; clearLabel: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm mb-4">
      <span className="text-amber-700">{children}</span>
      <Link href="/evidence" className="ms-auto text-xs text-amber-600 hover:text-amber-800 underline shrink-0">
        {clearLabel}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Mode = 'timeline' | 'search';

export default function EvidencePage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const tTimeline = useTranslations('timeline');

  const searchParams = useSearchParams();
  const entityParam = searchParams.get('entity');
  const hashParam = searchParams.get('hash');

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('timeline');

  // Search-mode state
  const [searchResults, setSearchResults] = useState<TimelineRecord[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Timeline-mode state
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  // ---------------------------------------------------------------------
  // Timeline (chronological, cursor-paginated; optionally filtered by
  // ?entity= or ?hash= — the deep links thesis/citation mentions use)
  // ---------------------------------------------------------------------

  async function fetchTimelinePage(cursor: string | null) {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      if (hashParam) params.set('fileHash', hashParam);
      else if (entityParam) params.set('targetEntity', entityParam);
      const res = await fetch(apiUrl(`/api/evidence/timeline?${params.toString()}`));
      const data = (await res.json()) as {
        results?: TimelineRecord[];
        totalCount?: number;
        nextCursor?: string | null;
        hasMore?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setTimelineError(data.message ?? `Error ${res.status}`);
        return;
      }
      if (cursor === null) {
        setRecords(data.results ?? []);
        setTotalCount(data.totalCount ?? null);
      } else {
        setRecords((prev) => [...prev, ...(data.results ?? [])]);
      }
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch {
      setTimelineError('Could not reach the backend. Is the server running?');
    } finally {
      fetchingRef.current = false;
    }
  }

  useEffect(() => {
    setInitialLoading(true);
    setRecords([]);
    setNextCursor(null);
    setHasMore(false);
    setTimelineError(null);
    void fetchTimelinePage(null).finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityParam, hashParam]);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore && !loadingMore && !fetchingRef.current) {
        setLoadingMore(true);
        void fetchTimelinePage(nextCursor).finally(() => setLoadingMore(false));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMore, loadingMore, nextCursor],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  // ---------------------------------------------------------------------
  // Search (semantic, capped, no pagination) — takes over the feed section
  // below the dashboard while a query is active.
  // ---------------------------------------------------------------------

  async function runSearch(q: string) {
    setMode('search');
    setSearchLoading(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams({ q, limit: String(SEARCH_LIMIT) });
      const res = await fetch(apiUrl(`/api/evidence/search?${params.toString()}`));
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? `Search error ${res.status}`);
      }
      const data = (await res.json()) as { results: TimelineRecord[] };
      setSearchResults(data.results ?? []);
      setSearchedQuery(q);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSearchSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setMode('timeline');
      return;
    }
    void runSearch(q);
  }

  function clearSearch() {
    setQuery('');
    setMode('timeline');
  }

  // ---------------------------------------------------------------------
  // Shared card labels
  // ---------------------------------------------------------------------

  function getPerspectiveLabel(p?: string): string {
    if (!p) return '';
    return tTimeline(`perspective.${p as EvidencePerspective}` as Parameters<typeof tTimeline>[0]);
  }

  function handlePromoted(fileHash: string) {
    const patch = (list: TimelineRecord[]) =>
      list.map((r) =>
        r.metadata.fileHash === fileHash
          ? { ...r, metadata: { ...r.metadata, status: 'CONFIRMED' } }
          : r,
      );
    setRecords(patch);
    setSearchResults(patch);
  }

  const nodeLabels: NodeLabels & { getPerspectiveLabel: (p?: string) => string } = {
    unknownDate: tTimeline('unknownDate'),
    keyFigures: tTimeline('keyFiguresLabel'),
    medicalContext: tTimeline('medicalContextLabel'),
    statisticalClaims: tTimeline('statisticalClaimsLabel'),
    regulatoryMentions: tTimeline('regulatoryMentionsLabel'),
    euaOmitted: tTimeline('euaOmitted'),
    euaMentioned: tTimeline('euaMentioned'),
    perspective: '',
    roleIncriminating: tTimeline('roleIncriminating'),
    roleContextAnchor: tTimeline('roleContextAnchor'),
    targetEntityLabel: tTimeline('targetEntityLabel'),
    viewSource: tTimeline('viewSource'),
    viewDiffHistory: tTimeline('viewDiffHistory'),
    pendingReviewBadge: tTimeline('pendingReviewBadge'),
    pendingReviewNote: tTimeline('pendingReviewNote'),
    promoteToVault: tTimeline('promoteToVault'),
    promoting: tTimeline('promoting'),
    promoteSuccess: tTimeline('promoteSuccess'),
    promoteError: tTimeline('promoteError'),
    relevanceLabel: (pct: number) => tTimeline('relevanceLabel', { pct }),
    getPerspectiveLabel,
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <SiteHeader
        current="evidence"
        tagline={t('tagline')}
        showOperational
        actions={
          <Link
            href="/submit"
            className="hidden sm:flex px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 transition-colors"
          >
            {tc('nav.submitEvidence')}
          </Link>
        }
      />

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Search */}
        <section>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('ledger.searchPlaceholder')}
              className="flex-1 bg-white border border-slate-300 rounded px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 font-mono shadow-sm"
            />
            <button
              type="submit"
              disabled={searchLoading}
              className="px-5 py-2.5 rounded text-sm font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-50 transition-colors shadow-sm"
            >
              {searchLoading ? t('ledger.searchingBtn') : t('ledger.searchBtn')}
            </button>
          </form>
        </section>

        {/* Feed — search results (relevance-ranked, capped) or the full
            chronological timeline (paginated), never both at once. */}
        <section>
          {mode === 'search' ? (
            <>
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  {t('ledger.title')}
                </h2>
                {searchResults.length > 0 && (
                  <span className="text-xs text-slate-400 font-mono">
                    {t('ledger.records', { count: searchResults.length })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mb-4">
                <p className="text-xs text-slate-400 font-mono truncate">&quot;{searchedQuery}&quot;</p>
                <button
                  type="button"
                  onClick={clearSearch}
                  className="ms-auto text-xs text-slate-500 hover:text-slate-700 underline shrink-0"
                >
                  {tTimeline('clearSearch')}
                </button>
              </div>

              {searchLoading && <TimelineSkeleton />}

              {!searchLoading && searchError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                  {searchError}
                </div>
              )}

              {!searchLoading && !searchError && searchResults.length === 0 && (
                <div className="bg-white border border-slate-200 border-dashed rounded-lg p-12 text-center shadow-sm">
                  <p className="text-slate-500 text-sm">{t('ledger.emptyTitle')}</p>
                  <p className="text-slate-400 text-xs mt-1">{t('ledger.emptySub')}</p>
                </div>
              )}

              {!searchLoading && !searchError && searchResults.length > 0 && (
                <UnifiedTimeline records={searchResults} labels={nodeLabels} onPromoted={handlePromoted} />
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  {tTimeline('sectionTitle')}
                </h2>
                {totalCount !== null && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                    {tTimeline('count', { count: totalCount })}
                  </span>
                )}
              </div>

              {hashParam ? (
                <FilterBanner clearLabel={tTimeline('clearFilter')}>
                  {tTimeline('singleRecordBanner')}
                </FilterBanner>
              ) : entityParam ? (
                <FilterBanner clearLabel={tTimeline('clearFilter')}>
                  {tTimeline('entityFilterBanner', { entity: entityParam })}
                </FilterBanner>
              ) : null}

              {timelineError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">{tTimeline('errorTitle')}</p>
                    <p className="text-xs text-red-600 mt-0.5">{timelineError}</p>
                  </div>
                </div>
              )}

              {initialLoading && <TimelineSkeleton />}

              {!initialLoading && !timelineError && records.length === 0 && (
                <EmptyState icon="⏱" title={tTimeline('emptyTitle')} sub={tTimeline('emptySub')} />
              )}

              {!initialLoading && !timelineError && records.length > 0 && (
                <>
                  <UnifiedTimeline records={records} labels={nodeLabels} onPromoted={handlePromoted} />

                  {!hashParam && (
                    <div ref={sentinelRef} className="py-2">
                      {loadingMore && (
                        <SkeletonRows
                          rows={2}
                          connectorHeight="min-h-16"
                          headerBarWidths={['w-20', 'w-28']}
                          bodyLineWidths={['', 'w-5/6']}
                        />
                      )}
                      {!hasMore && records.length > 0 && (
                        <p className="text-center text-xs text-slate-400 py-4">
                          {tTimeline('allRecordsLoaded', { count: records.length })}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
