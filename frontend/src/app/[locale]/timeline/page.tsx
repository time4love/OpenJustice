'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EvidencePerspective = 'Internal Knowledge' | 'Public Statement' | 'Citizen Experience';

interface EvidenceMetadata {
  fileHash: string;
  category: string;
  tier: string;
  tierReasoning?: string;
  evidencePerspective?: EvidencePerspective;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  keyFigures?: string[];
  medicalConditions?: string[];
  timestamp: number;
}

interface TimelineRecord {
  content: string;
  metadata: EvidenceMetadata;
  score?: number;
}

type ViewMode = 'internal' | 'public' | 'combined';

// ---------------------------------------------------------------------------
// Perspective styles — primary visual signal in Phase 15
// ---------------------------------------------------------------------------

const PERSPECTIVE_STYLES: Record<
  EvidencePerspective,
  { dot: string; badge: string; border: string; header: string }
> = {
  'Internal Knowledge': {
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200',
    border: 'border-red-200',
    header: 'bg-red-50 border-red-100',
  },
  'Public Statement': {
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    border: 'border-blue-200',
    header: 'bg-blue-50 border-blue-100',
  },
  'Citizen Experience': {
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    border: 'border-amber-200',
    header: 'bg-amber-50 border-amber-100',
  },
};

const FALLBACK_STYLES = {
  dot: 'bg-slate-400',
  badge: 'bg-slate-100 text-slate-600 border-slate-200',
  border: 'border-slate-200',
  header: 'bg-slate-50 border-slate-100',
};

function perspectiveStyles(p?: string) {
  return (p && PERSPECTIVE_STYLES[p as EvidencePerspective]) ?? FALLBACK_STYLES;
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
// Timeline node card
// ---------------------------------------------------------------------------

function TimelineNode({
  record,
  index,
  unknownDateLabel,
  keyFiguresLabel,
  medicalContextLabel,
  perspectiveLabel,
}: {
  record: TimelineRecord;
  index: number;
  unknownDateLabel: string;
  keyFiguresLabel: string;
  medicalContextLabel: string;
  perspectiveLabel: string;
}) {
  const { metadata } = record;
  const styles = perspectiveStyles(metadata.evidencePerspective);
  const isUnknown = metadata.evidenceDate === 'Unknown';

  return (
    <div className="flex items-start gap-0">
      {/* Date column */}
      <div className="w-28 shrink-0 pt-3 text-end pe-4">
        <span
          className={`font-mono text-xs leading-tight ${
            isUnknown ? 'text-slate-300 italic' : 'text-slate-500'
          }`}
        >
          {isUnknown ? unknownDateLabel : metadata.evidenceDate}
        </span>
      </div>

      {/* Spine */}
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-3 h-3 rounded-full border-2 border-slate-50 mt-3 shrink-0 shadow-sm ${styles.dot}`} />
        <div className="w-px flex-1 bg-slate-200 mt-1 min-h-[2rem]" />
      </div>

      {/* Card */}
      <div className={`ms-4 mb-6 flex-1 bg-white border rounded-lg overflow-hidden shadow-sm ${styles.border}`}>
        {/* Card header */}
        <div className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${styles.header}`}>
          <div className="flex items-center gap-2 min-w-0">
            {metadata.evidencePerspective && (
              <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded border ${styles.badge}`}>
                {perspectiveLabel}
              </span>
            )}
            <span className="text-xs text-slate-400 truncate">{metadata.category}</span>
          </div>
          <span className="text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
        </div>

        {/* Card body */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-sm text-slate-700 leading-relaxed" dir="auto">
            {metadata.summary}
          </p>

          {((metadata.keyFigures?.length ?? 0) > 0 || (metadata.medicalConditions?.length ?? 0) > 0) && (
            <div className="space-y-1.5">
              {(metadata.keyFigures?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">
                    {keyFiguresLabel}
                  </span>
                  {metadata.keyFigures!.map((f, i) => (
                    <span key={`${f}-${i}`} className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {(metadata.medicalConditions?.length ?? 0) > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0">
                    {medicalContextLabel}
                  </span>
                  {metadata.medicalConditions!.map((c, i) => (
                    <span key={`${c}-${i}`} className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-500">{metadata.targetEntity}</span>
            <span className="font-mono text-xs text-emerald-600" title={metadata.fileHash}>
              {formatHash(metadata.fileHash)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single-column timeline
// ---------------------------------------------------------------------------

function SingleTimeline({
  records,
  unknownDateLabel,
  keyFiguresLabel,
  medicalContextLabel,
  getPerspectiveLabel,
  spineOffset = 'calc(7rem + 6px)',
}: {
  records: TimelineRecord[];
  unknownDateLabel: string;
  keyFiguresLabel: string;
  medicalContextLabel: string;
  getPerspectiveLabel: (p?: string) => string;
  spineOffset?: string;
}) {
  return (
    <div className="relative">
      <div
        className="absolute top-0 bottom-0 w-px bg-slate-200"
        style={{ insetInlineStart: spineOffset }}
      />
      <div>
        {records.map((record, i) => (
          <TimelineNode
            key={record.metadata.fileHash}
            record={record}
            index={i}
            unknownDateLabel={unknownDateLabel}
            keyFiguresLabel={keyFiguresLabel}
            medicalContextLabel={medicalContextLabel}
            perspectiveLabel={getPerspectiveLabel(record.metadata.evidencePerspective)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contrast timeline — split-pane: Internal Knowledge | Public Statements
// ---------------------------------------------------------------------------

function ContrastTimeline({
  internalRecords,
  publicRecords,
  contrastLeft,
  contrastRight,
  unknownDateLabel,
  keyFiguresLabel,
  medicalContextLabel,
  getPerspectiveLabel,
  emptyContrast,
  emptyContrastSub,
}: {
  internalRecords: TimelineRecord[];
  publicRecords: TimelineRecord[];
  contrastLeft: string;
  contrastRight: string;
  unknownDateLabel: string;
  keyFiguresLabel: string;
  medicalContextLabel: string;
  getPerspectiveLabel: (p?: string) => string;
  emptyContrast: string;
  emptyContrastSub: string;
}) {
  if (internalRecords.length === 0 && publicRecords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center px-8 py-24 border border-dashed border-slate-200 rounded-lg bg-white shadow-sm">
        <div className="text-3xl mb-4 text-slate-300">⚖</div>
        <p className="text-sm font-medium text-slate-500 mb-1">{emptyContrast}</p>
        <p className="text-xs text-slate-400 max-w-sm leading-relaxed">{emptyContrastSub}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left column — Internal Knowledge */}
      <div>
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-red-100">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
          <span className="text-xs font-semibold text-red-700 uppercase tracking-widest">{contrastLeft}</span>
          <span className="ms-auto text-xs text-slate-400 font-mono">{internalRecords.length}</span>
        </div>
        {internalRecords.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-8 text-center">—</p>
        ) : (
          <SingleTimeline
            records={internalRecords}
            unknownDateLabel={unknownDateLabel}
            keyFiguresLabel={keyFiguresLabel}
            medicalContextLabel={medicalContextLabel}
            getPerspectiveLabel={getPerspectiveLabel}
            spineOffset="calc(7rem + 6px)"
          />
        )}
      </div>

      {/* Right column — Public Statements */}
      <div>
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-blue-100">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-widest">{contrastRight}</span>
          <span className="ms-auto text-xs text-slate-400 font-mono">{publicRecords.length}</span>
        </div>
        {publicRecords.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-8 text-center">—</p>
        ) : (
          <SingleTimeline
            records={publicRecords}
            unknownDateLabel={unknownDateLabel}
            keyFiguresLabel={keyFiguresLabel}
            medicalContextLabel={medicalContextLabel}
            getPerspectiveLabel={getPerspectiveLabel}
            spineOffset="calc(7rem + 6px)"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-24 border border-dashed border-slate-200 rounded-lg bg-white shadow-sm">
      <div className="text-3xl mb-4 text-slate-300">⏱</div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{sub}</p>
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
  const [view, setView] = useState<ViewMode>('combined');

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

  // Derive filtered records from the full set based on selected view
  const internalRecords = records?.filter(
    (r) => r.metadata.evidencePerspective === 'Internal Knowledge',
  ) ?? [];
  const publicRecords = records?.filter(
    (r) => r.metadata.evidencePerspective === 'Public Statement',
  ) ?? [];
  const citizenRecords = records?.filter(
    (r) => r.metadata.evidencePerspective === 'Citizen Experience',
  ) ?? [];

  const visibleRecords =
    view === 'internal' ? internalRecords
    : view === 'public'  ? publicRecords
    : records ?? [];

  // Translate perspective enum values to locale strings
  function getPerspectiveLabel(p?: string): string {
    if (!p) return '';
    const key = p as EvidencePerspective;
    return t(`perspective.${key}` as Parameters<typeof t>[0]);
  }

  const VIEW_TABS: { key: ViewMode; label: string }[] = [
    { key: 'internal', label: t('viewToggle.internal') },
    { key: 'public',   label: t('viewToggle.public') },
    { key: 'combined', label: t('viewToggle.combined') },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
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
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
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

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Controls row: filter + view toggle */}
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
                className="w-56 bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 font-mono shadow-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded text-sm font-semibold bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
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

          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {VIEW_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  view === key
                    ? key === 'internal'
                      ? 'bg-red-600 text-white'
                      : key === 'public'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Record count + perspective counts */}
          {records !== null && (
            <div className="flex items-center gap-3 ms-auto pb-0.5">
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {internalRecords.length}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                {publicRecords.length}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {citizenRecords.length}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {t('count', { count: records.length })}
              </span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">{t('errorTitle')}</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className={`animate-pulse ${view === 'combined' ? 'grid grid-cols-2 gap-4' : ''}`}>
            {(view === 'combined' ? [0, 1] : [0]).map((col) => (
              <div key={col} className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-0">
                    <div className="w-28 shrink-0 pt-3 pe-4">
                      <div className="h-2 bg-slate-200 rounded ms-auto w-20" />
                    </div>
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-3 h-3 rounded-full bg-slate-200 mt-3" />
                      <div className="w-px flex-1 bg-slate-200 mt-1 min-h-[5rem]" />
                    </div>
                    <div className="ms-4 flex-1 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <div className="h-3 bg-slate-200 rounded w-32" />
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
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && records !== null && visibleRecords.length === 0 && view !== 'combined' && (
          <EmptyState title={t('emptyTitle')} sub={t('emptySub')} />
        )}

        {/* Timeline content */}
        {!loading && !error && records !== null && (
          <>
            {view === 'combined' ? (
              <ContrastTimeline
                internalRecords={internalRecords}
                publicRecords={publicRecords}
                contrastLeft={t('contrastLeft')}
                contrastRight={t('contrastRight')}
                unknownDateLabel={t('unknownDate')}
                keyFiguresLabel={t('keyFiguresLabel')}
                medicalContextLabel={t('medicalContextLabel')}
                getPerspectiveLabel={getPerspectiveLabel}
                emptyContrast={t('emptyContrast')}
                emptyContrastSub={t('emptyContrastSub')}
              />
            ) : (
              visibleRecords.length > 0 && (
                <SingleTimeline
                  records={visibleRecords}
                  unknownDateLabel={t('unknownDate')}
                  keyFiguresLabel={t('keyFiguresLabel')}
                  medicalContextLabel={t('medicalContextLabel')}
                  getPerspectiveLabel={getPerspectiveLabel}
                />
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
