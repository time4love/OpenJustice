'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';
import { ClaimBlock } from '@/components/ClaimBlock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PromotedEvidence {
  id: string;
  fileHash: string;
}

interface DiffItem {
  summary: string;
  exactQuote: string;
}

interface DiffRecord {
  id: string;
  beforeDate: string;
  date: string;
  snapshotUrl: string;
  deletedItems: DiffItem[];
  addedItems: DiffItem[];
  rawDeletedChunks: string[];
  rawAddedChunks: string[];
  legalSignificance: string;
  isLegallySignificant: boolean;
  promotedEvidence: PromotedEvidence | null;
}

interface DiffPage {
  trackedUrlId: string;
  url: string;
  title: string | null;
  createdAt: string;
  totalCount: number;
  diffs: DiffRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  error?: string;
  message?: string;
}

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appendEvidenceMention(
  doc: Record<string, unknown>,
  fileHash: string,
  label: string,
): Record<string, unknown> {
  const content = [...((doc.content as unknown[]) ?? [])];
  content.push({
    type: 'paragraph',
    content: [{ type: 'evidenceMention', attrs: { id: fileHash, label: label.slice(0, 30) } }],
  });
  return { ...doc, content };
}

// ---------------------------------------------------------------------------
// AddToThesisButton — fetch thesis list, pick one, append evidence mention
// ---------------------------------------------------------------------------

interface ThesisSummary { id: string; createdAt: string; headVersion: { preview: string } | null; }

function AddToThesisButton({ fileHash, evidenceSummary }: { fileHash: string; evidenceSummary: string }) {
  const [state, setState] = useState<'idle' | 'open' | 'saving' | 'done'>('idle');
  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  async function openPicker() {
    if (state === 'open') { setState('idle'); return; }
    setState('open');
    if (theses.length > 0) return;
    setLoadingList(true);
    try {
      const res = await fetch(apiUrl('/api/thesis'));
      const data = (await res.json()) as { theses: ThesisSummary[] };
      setTheses(data.theses ?? []);
    } finally {
      setLoadingList(false);
    }
  }

  async function addTo(thesis: ThesisSummary) {
    setState('saving');
    try {
      const res = await fetch(apiUrl(`/api/thesis/${thesis.id}`));
      const data = (await res.json()) as { thesis: { headVersion: { userContent: Record<string, unknown> } | null } };
      const currentContent = data.thesis.headVersion?.userContent ?? { type: 'doc', content: [] };
      const newContent = appendEvidenceMention(currentContent, fileHash, evidenceSummary);
      await fetch(apiUrl(`/api/thesis/${thesis.id}/version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: newContent }),
      });
      setState('done');
    } catch {
      setState('open');
    }
  }

  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        ✓ Added to thesis
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => { void openPicker(); }}
        disabled={state === 'saving'}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-100 hover:bg-violet-200 text-violet-700 disabled:opacity-40 transition-colors"
      >
        {state === 'saving' ? 'Saving…' : 'Add to Thesis'}
      </button>

      {state === 'open' && (
        <div className="absolute bottom-full mb-2 end-0 z-30 w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600">Pick a thesis</p>
          </div>
          {loadingList && <p className="text-xs text-slate-400 px-3 py-3">Loading…</p>}
          {!loadingList && theses.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-3">No theses found</p>
          )}
          {!loadingList && theses.map(th => (
            <button
              key={th.id}
              onClick={() => { void addTo(th); }}
              className="w-full text-start px-3 py-2.5 hover:bg-violet-50 border-b border-slate-100 last:border-0 transition-colors"
            >
              <p className="text-xs font-medium text-slate-700 truncate">
                {th.headVersion?.preview?.slice(0, 50) || `Thesis ${th.id.slice(0, 8)}`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(th.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locale switcher
// ---------------------------------------------------------------------------

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
    showChanges: string;
    hideChanges: string;
  };
  onPromoted: (diffId: string, evidence: PromotedEvidence) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sig = diff.isLegallySignificant;

  const hasDeletions = diff.deletedItems.length > 0 || diff.rawDeletedChunks.length > 0;
  const hasAdditions = diff.addedItems.length > 0 || diff.rawAddedChunks.length > 0;
  const hasChanges = hasDeletions || hasAdditions;

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
          {/* AI Forensic Analysis — always visible for flagged diffs */}
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

          {/* Expand/collapse toggle — only when there are diffs to show */}
          {hasChanges && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                expanded
                  ? sig
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : sig
                    ? 'bg-red-50/60 text-red-500 hover:bg-red-100'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span>{expanded ? labels.hideChanges : labels.showChanges}</span>
              <svg
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Collapsible diff details */}
          {expanded && hasChanges && (
            <div className="space-y-4">
              {/* Deletions */}
              {hasDeletions && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-red-600 uppercase tracking-widest">
                    {labels.deletionsLabel}
                  </span>
                  <div className="space-y-2">
                    {diff.deletedItems.length > 0
                      ? diff.deletedItems.map((item, i) => (
                          <ClaimBlock
                            key={`del-${i}`}
                            claim={item.summary}
                            rawChunk={item.exactQuote || undefined}
                            type="deleted"
                          />
                        ))
                      : diff.rawDeletedChunks.map((chunk, i) => (
                          <ClaimBlock key={`del-raw-${i}`} claim={null} rawChunk={chunk} type="deleted" />
                        ))}
                  </div>
                </div>
              )}

              {/* Additions */}
              {hasAdditions && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                    {labels.additionsLabel}
                  </span>
                  <div className="space-y-2">
                    {diff.addedItems.length > 0
                      ? diff.addedItems.map((item, i) => (
                          <ClaimBlock
                            key={`add-${i}`}
                            claim={item.summary}
                            rawChunk={item.exactQuote || undefined}
                            type="added"
                          />
                        ))
                      : diff.rawAddedChunks.map((chunk, i) => (
                          <ClaimBlock key={`add-raw-${i}`} claim={null} rawChunk={chunk} type="added" />
                        ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer — archive link + promote button + add to thesis (always visible) */}
          <div className={`flex flex-wrap items-center justify-between gap-3 pt-1 ${footerClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              <PromoteButton
                diffId={diff.id}
                promoted={diff.promotedEvidence}
                labels={labels}
                onPromoted={onPromoted}
              />
              {diff.promotedEvidence && (
                <AddToThesisButton
                  fileHash={diff.promotedEvidence.fileHash}
                  evidenceSummary={diff.legalSignificance.slice(0, 40) || diff.promotedEvidence.fileHash.slice(0, 12)}
                />
              )}
            </div>
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

  // Meta (url, title, totalCount) from the first page response
  const [meta, setMeta] = useState<Pick<DiffPage, 'url' | 'title' | 'createdAt' | 'totalCount'> | null>(null);
  const [diffs, setDiffs] = useState<DiffRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Derived rather than tracked separately: we haven't gotten a response yet.
  const initialLoading = meta === null && error === null;

  // Sentinel ref for IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guard against duplicate fetches
  const fetchingRef = useRef(false);

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
      setMeta((prev) => prev ?? { url: json.url, title: json.title, createdAt: json.createdAt, totalCount: json.totalCount });
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
    async function load() {
      await fetchPage(null);
    }
    void load();
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
    promoteBtn: t('promoteBtn'),
    promotingBtn: t('promotingBtn'),
    alreadyPromoted: t('alreadyPromoted'),
    promoteSuccess: t('promoteSuccess'),
    promoteError: t('promoteError'),
    flaggedBadge: t('flaggedBadge'),
    auditBadge: t('auditBadge'),
    showChanges: t('showChanges'),
    hideChanges: t('hideChanges'),
  };

  const flaggedCount = diffs.filter((d) => d.isLegallySignificant).length;

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
            <TopNav current="forensics" />
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
                  <a
                    href={apiUrl(`/api/forensics/tracked/${trackedUrlId}/report`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ms-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                  >
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    {t('downloadPdf')}
                  </a>
                </div>

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
