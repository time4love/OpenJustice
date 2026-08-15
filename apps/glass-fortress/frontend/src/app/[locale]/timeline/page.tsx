'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';
import { CategoryBadges } from '@/components/CategoryBadges';

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EvidencePerspective = 'Internal Knowledge' | 'Public Statement' | 'Citizen Experience';

type EvidenceRole = 'Incriminating' | 'ContextAnchor';

interface EvidenceMetadata {
  evidenceId: string;
  fileHash: string;
  status?: string;
  evidenceRole?: EvidenceRole;
  investigativeCategories: string[];
  tier: string;
  tierReasoning?: string;
  evidencePerspective?: EvidencePerspective;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  figures?: { id: string; name: string }[];
  medicalConditions?: string[];
  statisticalClaims?: string[];
  regulatoryMentions?: string[];
  euaOmissionStatus?: string;
  sourceUrl?: string | null;
  fileUrl?: string | null;
  urlVersionDiffId?: string | null;
  trackedUrlId?: string | null;
  timestamp: number;
}

interface TimelineRecord {
  content: string;
  metadata: EvidenceMetadata;
  score?: number;
}

// ---------------------------------------------------------------------------
// Perspective styles
// ---------------------------------------------------------------------------

const PERSPECTIVE_STYLES: Record<
  EvidencePerspective,
  { dot: string; card: string; border: string; header: string; badge: string }
> = {
  'Internal Knowledge': {
    dot: 'bg-red-500',
    card: 'bg-red-50/50',
    border: 'border-red-200',
    header: 'bg-red-50 border-red-100',
    badge: 'bg-red-100 text-red-700 border-red-200',
  },
  'Public Statement': {
    dot: 'bg-blue-500',
    card: 'bg-blue-50/50',
    border: 'border-blue-200',
    header: 'bg-blue-50 border-blue-100',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  'Citizen Experience': {
    dot: 'bg-slate-400',
    card: 'bg-slate-50',
    border: 'border-slate-200',
    header: 'bg-slate-100 border-slate-200',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

const FALLBACK_STYLES = {
  dot: 'bg-slate-400',
  card: 'bg-slate-50',
  border: 'border-slate-200',
  header: 'bg-slate-100 border-slate-200',
  badge: 'bg-slate-100 text-slate-600 border-slate-200',
};

function perspectiveStyles(p?: string) {
  return PERSPECTIVE_STYLES[p as EvidencePerspective] ?? FALLBACK_STYLES;
}

function formatHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

// ---------------------------------------------------------------------------
// Locale switcher
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Node labels — passed as a single object to avoid prop drilling
// ---------------------------------------------------------------------------

interface NodeLabels {
  unknownDate: string;
  keyFigures: string;
  medicalContext: string;
  statisticalClaims: string;
  regulatoryMentions: string;
  euaOmitted: string;
  euaMentioned: string;
  perspective: string;
  roleIncriminating: string;
  roleContextAnchor: string;
  viewSource: string;
  viewDiffHistory: string;
  viewCitingTheses: string;
  pendingReviewBadge: string;
  pendingReviewNote: string;
  promoteToVault: string;
  promoting: string;
  promoteSuccess: string;
}

// ---------------------------------------------------------------------------
// Timeline node card
// ---------------------------------------------------------------------------

function PromoteButton({
  fileHash,
  labels,
  onPromoted,
}: {
  fileHash: string;
  labels: NodeLabels;
  onPromoted: () => void;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  async function handlePromote() {
    setState('loading');
    try {
      const res = await fetch(apiUrl('/api/evidence/promote'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileHash }),
      });
      if (res.ok) {
        setState('done');
        setTimeout(onPromoted, 1200);
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  }

  if (state === 'done') {
    return (
      <span className="text-xs font-semibold text-emerald-600">{labels.promoteSuccess}</span>
    );
  }

  return (
    <button
      onClick={() => void handlePromote()}
      disabled={state === 'loading'}
      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white transition-colors"
    >
      {state === 'loading' ? labels.promoting : labels.promoteToVault}
    </button>
  );
}

function TimelineNode({
  record,
  index,
  labels,
  onPromoted,
}: {
  record: TimelineRecord;
  index: number;
  labels: NodeLabels;
  onPromoted: (fileHash: string) => void;
}) {
  const { metadata } = record;
  const styles = perspectiveStyles(metadata.evidencePerspective);
  const isUnknown = metadata.evidenceDate === 'Unknown';
  const isPending = metadata.status === 'PENDING_REVIEW';

  return (
    <div className="flex gap-3 sm:gap-4 mb-5 last:mb-0">
      {/* Spine column — sits on logical start, so right in RTL */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-3 h-3 rounded-full ring-2 ring-slate-50 shadow-sm mt-[1.125rem] shrink-0 ${styles.dot}`}
        />
        <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-8" />
      </div>

      {/* Card — full width on mobile */}
      <div
        className={`flex-1 min-w-0 rounded-xl border shadow-sm overflow-hidden ${styles.card} ${styles.border}`}
      >
        {/* Card header */}
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 border-b ${styles.header}`}
        >
          {/* Date */}
          <span
            className={`font-mono text-xs shrink-0 ${
              isUnknown ? 'text-slate-300 italic' : 'text-slate-500 font-medium'
            }`}
          >
            {isUnknown ? labels.unknownDate : metadata.evidenceDate}
          </span>

          {/* Perspective badge */}
          {metadata.evidencePerspective && (
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${styles.badge}`}
            >
              {labels.perspective}
            </span>
          )}

          {/* Role badge */}
          {metadata.evidenceRole && (
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                metadata.evidenceRole === 'Incriminating'
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {metadata.evidenceRole === 'Incriminating'
                ? labels.roleIncriminating
                : labels.roleContextAnchor}
            </span>
          )}

          {/* Category */}
          <CategoryBadges categories={metadata.investigativeCategories} max={2} />

          {/* Pending badge */}
          {isPending && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
              {labels.pendingReviewBadge}
            </span>
          )}

          {/* Index */}
          <span className="ms-auto text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
        </div>

        {/* Card body */}
        <div className="px-4 py-3 space-y-3">
          {isPending && (
            <div className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300">
              <div className="flex items-start gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                <span className="text-xs text-amber-800 leading-snug">{labels.pendingReviewNote}</span>
              </div>
              <PromoteButton
                fileHash={metadata.fileHash}
                labels={labels}
                onPromoted={() => onPromoted(metadata.fileHash)}
              />
            </div>
          )}
          {metadata.euaOmissionStatus === 'Omits EUA (Misleading)' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-300">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">
                {labels.euaOmitted}
              </span>
            </div>
          )}
          {metadata.euaOmissionStatus === 'Explicitly Mentions EUA' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
              <span className="text-xs font-medium text-slate-600">{labels.euaMentioned}</span>
            </div>
          )}

          <p className="text-sm text-slate-700 leading-relaxed" dir="auto">
            {metadata.summary}
          </p>

          {((metadata.figures?.length ?? 0) > 0 ||
            (metadata.medicalConditions?.length ?? 0) > 0 ||
            (metadata.statisticalClaims?.length ?? 0) > 0 ||
            (metadata.regulatoryMentions?.length ?? 0) > 0) && (
            <div className="space-y-1.5">
              {(metadata.figures?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">
                    {labels.keyFigures}
                  </span>
                  {metadata.figures!.map((f) => (
                    <Link
                      key={f.id}
                      href={`/figures?id=${f.id}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                    >
                      {f.name}
                    </Link>
                  ))}
                </div>
              )}
              {(metadata.medicalConditions?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">
                    {labels.medicalContext}
                  </span>
                  {metadata.medicalConditions!.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {(metadata.statisticalClaims?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">
                    {labels.statisticalClaims}
                  </span>
                  {metadata.statisticalClaims!.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {(metadata.regulatoryMentions?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">
                    {labels.regulatoryMentions}
                  </span>
                  {metadata.regulatoryMentions!.map((m, i) => (
                    <span
                      key={`${m}-${i}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-slate-100/80">
            <Link
              href={`/evidence/${metadata.evidenceId}`}
              className="flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2 transition-colors"
            >
              {metadata.evidenceId.slice(0, 8)}…
            </Link>
            <span className="text-xs text-slate-500">{metadata.targetEntity}</span>
            <span className="font-mono text-xs text-emerald-600" title={metadata.fileHash}>
              {formatHash(metadata.fileHash)}
            </span>
            {(metadata.sourceUrl ?? metadata.fileUrl) && (
              <a
                href={metadata.sourceUrl ?? metadata.fileUrl ?? ''}
                target="_blank"
                rel="noopener noreferrer"
                className="ms-auto flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                {labels.viewSource}
                <span aria-hidden="true">↗</span>
              </a>
            )}
            {metadata.trackedUrlId && (
              <Link
                href={`/forensics/${metadata.trackedUrlId}`}
                className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800 hover:underline transition-colors"
              >
                {labels.viewDiffHistory}
                <span aria-hidden="true">&#x2197;</span>
              </Link>
            )}
            <Link
              href={`/theses?evidence=${encodeURIComponent(metadata.fileHash)}`}
              className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-800 hover:underline transition-colors"
            >
              {labels.viewCitingTheses}
              <span aria-hidden="true">&#x2197;</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified vertical timeline
// ---------------------------------------------------------------------------

function UnifiedTimeline({
  records,
  labels,
  onPromoted,
}: {
  records: TimelineRecord[];
  labels: NodeLabels & { getPerspectiveLabel: (p?: string) => string };
  onPromoted: (fileHash: string) => void;
}) {
  return (
    <div>
      {records.map((record, i) => (
        <TimelineNode
          key={record.metadata.fileHash}
          record={record}
          index={i}
          labels={{ ...labels, perspective: labels.getPerspectiveLabel(record.metadata.evidencePerspective) }}
          onPromoted={onPromoted}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-24 border border-dashed border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="text-3xl mb-4 text-slate-300">⏱</div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center shrink-0">
            <div className="w-3 h-3 rounded-full bg-slate-200 mt-[1.125rem]" />
            <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-24" />
          </div>
          <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
              <div className="h-2.5 bg-slate-200 rounded-full w-20" />
              <div className="h-2.5 bg-slate-200 rounded-full w-28" />
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="h-2 bg-slate-100 rounded" />
              <div className="h-2 bg-slate-100 rounded w-5/6" />
              <div className="h-2 bg-slate-100 rounded w-4/6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TimelinePage() {
  const t = useTranslations('timeline');
  const tc = useTranslations('common');

  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const fetchingRef = useRef(false);

  async function fetchPage(cursor: string | null) {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(apiUrl(`/api/evidence/timeline?${params.toString()}`));
      const data = (await res.json()) as {
        results?: TimelineRecord[];
        totalCount?: number;
        nextCursor?: string | null;
        hasMore?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setError(data.message ?? `Error ${res.status}`);
        return;
      }
      if (cursor === null) {
        // First page — replace everything and set total
        setRecords(data.results ?? []);
        setTotalCount(data.totalCount ?? null);
      } else {
        setRecords((prev) => [...prev, ...(data.results ?? [])]);
      }
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } catch {
      setError('Could not reach the backend. Is the server running?');
    } finally {
      fetchingRef.current = false;
    }
  }

  // Initial load
  useEffect(() => {
    setInitialLoading(true);
    setRecords([]);
    setNextCursor(null);
    setHasMore(false);
    setError(null);
    void fetchPage(null).finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver sentinel
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore && !loadingMore && !fetchingRef.current) {
        setLoadingMore(true);
        void fetchPage(nextCursor).finally(() => setLoadingMore(false));
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

  function getPerspectiveLabel(p?: string): string {
    if (!p) return '';
    return t(`perspective.${p as EvidencePerspective}` as Parameters<typeof t>[0]);
  }

  function handlePromoted(fileHash: string) {
    setRecords((prev) =>
      prev.map((r) =>
        r.metadata.fileHash === fileHash
          ? { ...r, metadata: { ...r.metadata, status: 'CONFIRMED' } }
          : r,
      ),
    );
  }

  const nodeLabels = {
    unknownDate: t('unknownDate'),
    keyFigures: t('keyFiguresLabel'),
    medicalContext: t('medicalContextLabel'),
    statisticalClaims: t('statisticalClaimsLabel'),
    regulatoryMentions: t('regulatoryMentionsLabel'),
    euaOmitted: t('euaOmitted'),
    euaMentioned: t('euaMentioned'),
    perspective: '',
    roleIncriminating: t('roleIncriminating'),
    roleContextAnchor: t('roleContextAnchor'),
    viewSource: t('viewSource'),
    viewDiffHistory: t('viewDiffHistory'),
    viewCitingTheses: t('viewCitingTheses'),
    pendingReviewBadge: t('pendingReviewBadge'),
    pendingReviewNote: t('pendingReviewNote'),
    promoteToVault: t('promoteToVault'),
    promoting: t('promoting'),
    promoteSuccess: t('promoteSuccess'),
    getPerspectiveLabel,
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">⬡</span>
            <div>
              <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
                {tc('appName')}
              </span>
              <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">
                {t('tagline')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 hidden sm:flex">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {tc('operational')}
            </span>
            <TopNav current="timeline" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Count badge */}
        {totalCount !== null && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              {t('count', { count: totalCount })}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">{t('errorTitle')}</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {initialLoading && <TimelineSkeleton />}

        {!initialLoading && !error && records.length === 0 && (
          <EmptyState title={t('emptyTitle')} sub={t('emptySub')} />
        )}

        {!initialLoading && !error && records.length > 0 && (
          <>
            <UnifiedTimeline records={records} labels={nodeLabels} onPromoted={handlePromoted} />

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
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                          <div className="h-2.5 bg-slate-200 rounded-full w-20" />
                          <div className="h-2.5 bg-slate-200 rounded-full w-28" />
                        </div>
                        <div className="px-4 py-3 space-y-2">
                          <div className="h-2 bg-slate-100 rounded" />
                          <div className="h-2 bg-slate-100 rounded w-5/6" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!hasMore && records.length > 0 && (
                <p className="text-center text-xs text-slate-400 py-4">
                  {t('allRecordsLoaded', { count: records.length })}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
