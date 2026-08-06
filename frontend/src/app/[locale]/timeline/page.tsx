'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvidenceMetadata {
  fileHash: string;
  category: string;
  tier: string;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  submitterAddress?: string;
  timestamp: number;
}

interface TimelineRecord {
  content: string;
  metadata: EvidenceMetadata;
  score?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_STYLES: Record<string, { dot: string; badge: string; border: string }> = {
  'Tier 1: Smoking Gun': {
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200',
    border: 'border-red-200',
  },
  'Tier 2: Material': {
    dot: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    border: 'border-orange-200',
  },
  'Tier 3: Supporting': {
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    border: 'border-amber-200',
  },
  'Tier 4: Anecdotal': {
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600 border-slate-200',
    border: 'border-slate-200',
  },
};

function tierStyles(tier: string) {
  return (
    TIER_STYLES[tier] ?? {
      dot: 'bg-slate-400',
      badge: 'bg-slate-100 text-slate-600 border-slate-200',
      border: 'border-slate-200',
    }
  );
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

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      {(['he', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchLocale(l)}
          className={`px-2 py-1 rounded transition-colors ${
            locale === l
              ? 'bg-slate-200 text-slate-800'
              : 'text-slate-400 hover:text-slate-600'
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
}: {
  record: TimelineRecord;
  index: number;
  unknownDateLabel: string;
}) {
  const { metadata } = record;
  const styles = tierStyles(metadata.tier);
  const isUnknown = metadata.evidenceDate === 'Unknown';

  return (
    /* Outer row: date column | spine | card */
    <div className="flex items-start gap-0">
      {/* Date column — fixed width, right-aligned text */}
      <div className="w-28 shrink-0 pt-3 text-end pe-4">
        <span
          className={`font-mono text-xs leading-tight ${
            isUnknown ? 'text-slate-300 italic' : 'text-slate-500'
          }`}
        >
          {isUnknown ? unknownDateLabel : metadata.evidenceDate}
        </span>
      </div>

      {/* Spine column */}
      <div className="flex flex-col items-center shrink-0">
        {/* Dot */}
        <div
          className={`w-3 h-3 rounded-full border-2 border-slate-50 mt-3 shrink-0 shadow-sm ${styles.dot}`}
        />
        {/* Connector line */}
        <div className="w-px flex-1 bg-slate-200 mt-1 min-h-[2rem]" />
      </div>

      {/* Card */}
      <div
        className={`ms-4 mb-6 flex-1 bg-white border rounded-lg overflow-hidden shadow-sm ${styles.border}`}
      >
        {/* Card header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded border ${styles.badge}`}
            >
              {metadata.tier}
            </span>
            <span className="text-xs text-slate-400 truncate">{metadata.category}</span>
          </div>
          <span className="text-xs text-slate-300 font-mono shrink-0">
            #{index + 1}
          </span>
        </div>

        {/* Card body */}
        <div className="px-4 py-3 space-y-3">
          {/* Summary */}
          <p className="text-sm text-slate-700 leading-relaxed" dir="auto">
            {metadata.summary}
          </p>

          {/* Footer row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              {metadata.targetEntity}
            </span>
            <span
              className="font-mono text-xs text-emerald-600"
              title={metadata.fileHash}
            >
              {formatHash(metadata.fileHash)}
            </span>
          </div>
        </div>
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

  // Load all records on mount
  useEffect(() => {
    void fetchTimeline('');
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void fetchTimeline(entityFilter);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
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

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Filter bar */}
        <form onSubmit={handleSubmit} className="flex items-end gap-3 mb-8">
          <div className="flex-1 max-w-xs space-y-1.5">
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-widest">
              {t('filterLabel')}
            </label>
            <input
              type="text"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              placeholder={t('filterPlaceholder')}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 font-mono shadow-sm"
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
          {records !== null && (
            <span className="text-xs text-slate-400 font-mono pb-2">
              {t('count', { count: records.length })}
            </span>
          )}
        </form>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-5 mb-8 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">{t('errorTitle')}</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse">
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
        )}

        {/* Empty state */}
        {!loading && !error && records !== null && records.length === 0 && (
          <EmptyState title={t('emptyTitle')} sub={t('emptySub')} />
        )}

        {/* Timeline */}
        {!loading && !error && records !== null && records.length > 0 && (
          <div className="relative">
            {/* Global vertical spine behind all nodes */}
            <div
              className="absolute top-0 bottom-0 w-px bg-slate-200"
              style={{ insetInlineStart: 'calc(7rem + 6px)' }}
            />
            <div>
              {records.map((record, i) => (
                <TimelineNode
                  key={record.metadata.fileHash}
                  record={record}
                  index={i}
                  unknownDateLabel={t('unknownDate')}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
