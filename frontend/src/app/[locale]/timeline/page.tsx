'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EvidencePerspective = 'Internal Knowledge' | 'Public Statement' | 'Citizen Experience';

type EvidenceRole = 'Incriminating' | 'ContextAnchor';

interface EvidenceMetadata {
  fileHash: string;
  evidenceRole?: EvidenceRole;
  category: string;
  tier: string;
  tierReasoning?: string;
  evidencePerspective?: EvidencePerspective;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  keyFigures?: string[];
  medicalConditions?: string[];
  statisticalClaims?: string[];
  regulatoryMentions?: string[];
  euaOmissionStatus?: string;
  sourceUrl?: string | null;
  fileUrl?: string | null;
  timestamp: number;
}

interface TimelineRecord {
  content: string;
  metadata: EvidenceMetadata;
  score?: number;
}

type ViewMode = 'all' | 'internal' | 'public';

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
}

// ---------------------------------------------------------------------------
// Timeline node card
// ---------------------------------------------------------------------------

function TimelineNode({
  record,
  index,
  labels,
}: {
  record: TimelineRecord;
  index: number;
  labels: NodeLabels;
}) {
  const { metadata } = record;
  const styles = perspectiveStyles(metadata.evidencePerspective);
  const isUnknown = metadata.evidenceDate === 'Unknown';

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
          {metadata.category && metadata.category !== 'Factual Baseline' && (
            <span className="text-xs text-slate-400 min-w-0 truncate">{metadata.category}</span>
          )}

          {/* Index */}
          <span className="ms-auto text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
        </div>

        {/* Card body */}
        <div className="px-4 py-3 space-y-3">
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

          {((metadata.keyFigures?.length ?? 0) > 0 ||
            (metadata.medicalConditions?.length ?? 0) > 0 ||
            (metadata.statisticalClaims?.length ?? 0) > 0 ||
            (metadata.regulatoryMentions?.length ?? 0) > 0) && (
            <div className="space-y-1.5">
              {(metadata.keyFigures?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">
                    {labels.keyFigures}
                  </span>
                  {metadata.keyFigures!.map((f, i) => (
                    <span
                      key={`${f}-${i}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200"
                    >
                      {f}
                    </span>
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
}: {
  records: TimelineRecord[];
  labels: NodeLabels & { getPerspectiveLabel: (p?: string) => string };
}) {
  return (
    <div>
      {records.map((record, i) => (
        <TimelineNode
          key={record.metadata.fileHash}
          record={record}
          index={i}
          labels={{ ...labels, perspective: labels.getPerspectiveLabel(record.metadata.evidencePerspective) }}
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

  const [entityFilter, setEntityFilter] = useState('');
  const [records, setRecords] = useState<TimelineRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('all');

  async function fetchTimeline(entity: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (entity.trim()) params.set('targetEntity', entity.trim());
      const res = await fetch(apiUrl(`/api/evidence/timeline?${params.toString()}`));
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setError(data.message ?? `Error ${res.status}`);
        setRecords(null);
        return;
      }
      const data = (await res.json()) as { results: TimelineRecord[] };
      setRecords(data.results);
    } catch {
      setError('Could not reach the backend. Is the server running?');
      setRecords(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchTimeline('');
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void fetchTimeline(entityFilter);
  }

  // Per-perspective counts for filter tab badges
  const internalCount = records?.filter((r) => r.metadata.evidencePerspective === 'Internal Knowledge').length ?? 0;
  const publicCount = records?.filter((r) => r.metadata.evidencePerspective === 'Public Statement').length ?? 0;

  const visibleRecords =
    view === 'internal'
      ? (records?.filter((r) => r.metadata.evidencePerspective === 'Internal Knowledge') ?? [])
      : view === 'public'
        ? (records?.filter((r) => r.metadata.evidencePerspective === 'Public Statement') ?? [])
        : (records ?? []);

  function getPerspectiveLabel(p?: string): string {
    if (!p) return '';
    return t(`perspective.${p as EvidencePerspective}` as Parameters<typeof t>[0]);
  }

  const VIEW_TABS: { key: ViewMode; label: string; count: number; activeClass: string }[] = [
    {
      key: 'all',
      label: t('viewToggle.all'),
      count: records?.length ?? 0,
      activeClass: 'bg-slate-800 text-white border-slate-700',
    },
    {
      key: 'internal',
      label: t('viewToggle.internal'),
      count: internalCount,
      activeClass: 'bg-red-600 text-white border-red-700',
    },
    {
      key: 'public',
      label: t('viewToggle.public'),
      count: publicCount,
      activeClass: 'bg-blue-600 text-white border-blue-700',
    },
  ];

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
            <nav className="flex items-center gap-1">
              <Link
                href="/"
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition-colors"
              >
                {tc('nav.evidenceVault')}
              </Link>
              <span className="px-3 py-1.5 rounded text-xs font-medium bg-slate-900 text-white border border-slate-700">
                {tc('nav.timeline')}
              </span>
              <Link
                href="/case-builder"
                className="px-3 py-1.5 rounded text-xs font-medium text-slate-600 border border-transparent hover:bg-slate-100 hover:text-slate-900 hover:border-slate-200 transition-colors"
              >
                {tc('nav.caseBuilder')}
              </Link>
            </nav>
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Controls row */}
        <div className="flex flex-wrap items-end gap-4">
          {/* Entity filter */}
          <form onSubmit={handleSubmit} className="flex items-end gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-widest">
                {t('filterLabel')}
              </label>
              <input
                type="text"
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                placeholder={t('filterPlaceholder')}
                className="w-52 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 font-mono shadow-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                  {t('loadingBtn')}
                </span>
              ) : (
                t('loadBtn')
              )}
            </button>
          </form>

          {/* Perspective filter tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {VIEW_TABS.map(({ key, label, count, activeClass }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${
                  view === key ? activeClass : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
                {records !== null && (
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      view === key ? 'opacity-70' : 'text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

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

        {/* Loading skeleton */}
        {loading && <TimelineSkeleton />}

        {/* Empty state */}
        {!loading && !error && records !== null && visibleRecords.length === 0 && (
          <EmptyState title={t('emptyTitle')} sub={t('emptySub')} />
        )}

        {/* Unified timeline */}
        {!loading && !error && records !== null && visibleRecords.length > 0 && (
          <UnifiedTimeline records={visibleRecords} labels={nodeLabels} />
        )}
      </div>
    </main>
  );
}
