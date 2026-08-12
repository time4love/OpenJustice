'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EvidenceTier =
  | 'Tier 1: Smoking Gun'
  | 'Tier 2: Material'
  | 'Tier 3: Supporting'
  | 'Tier 4: Anecdotal';

type Category =
  | 'Side Effect Withholding'
  | 'Regulatory Misleading'
  | 'Coercion'
  | 'Other';

interface EvidenceMetadata {
  fileHash: string;
  category: Category;
  tier: EvidenceTier;
  summary: string;
  targetEntity: string;
  submitterAddress?: string;
  timestamp: number;
}

interface SearchResult {
  content: string;
  metadata: EvidenceMetadata;
  score?: number;
}

interface SearchResponse {
  query: string;
  count: number;
  results: SearchResult[];
}

// ---------------------------------------------------------------------------
// Stats type
// ---------------------------------------------------------------------------

interface EvidenceStats {
  total: number;
  byTier: Partial<Record<EvidenceTier, number>>;
  byCategory: Partial<Record<Category, number>>;
}

// ---------------------------------------------------------------------------
// Tier accent colors (for the start-border on evidence cards)
// ---------------------------------------------------------------------------

const TIER_ACCENT: Record<EvidenceTier, string> = {
  'Tier 1: Smoking Gun': 'var(--color-red-500)',
  'Tier 2: Material': 'var(--color-orange-500)',
  'Tier 3: Supporting': 'var(--color-amber-500)',
  'Tier 4: Anecdotal': 'var(--color-slate-300)',
};

function tierStyle(tier: EvidenceTier): { badge: string; dot: string } {
  switch (tier) {
    case 'Tier 1: Smoking Gun':
      return { badge: 'bg-red-50 text-red-700 border border-red-200', dot: 'bg-red-500' };
    case 'Tier 2: Material':
      return { badge: 'bg-orange-50 text-orange-700 border border-orange-200', dot: 'bg-orange-500' };
    case 'Tier 3: Supporting':
      return { badge: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500' };
    case 'Tier 4: Anecdotal':
      return { badge: 'bg-slate-100 text-slate-600 border border-slate-200', dot: 'bg-slate-400' };
  }
}

function categoryStyle(cat: Category): string {
  switch (cat) {
    case 'Side Effect Withholding':
      return 'bg-purple-50 text-purple-700 border border-purple-200';
    case 'Regulatory Misleading':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'Coercion':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'Other':
      return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}

function formatHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: number;
  sub?: string;
  colorClass: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={`text-3xl font-mono font-bold ${colorClass}`}>{value.toLocaleString()}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

function CategoryBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 w-48 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-slate-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-500 w-8 text-end">{value}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: EvidenceTier }) {
  const s = tierStyle(tier);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {tier}
    </span>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryStyle(category)}`}>
      {category}
    </span>
  );
}

function EntityBadge({ entity }: { entity: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
      ⚖ {entity}
    </span>
  );
}

function EvidenceCard({ result }: { result: SearchResult }) {
  const { metadata, score } = result;

  return (
    <div
      style={{ borderInlineStartColor: TIER_ACCENT[metadata.tier] }}
      className="bg-white border border-slate-200 border-s-4 rounded-lg p-5 space-y-3 shadow-sm"
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <EntityBadge entity={metadata.targetEntity} />
        <TierBadge tier={metadata.tier} />
        <CategoryBadge category={metadata.category} />
        {score !== undefined && (
          <span className="ms-auto text-xs font-mono text-slate-400">
            relevance {(score * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-700 leading-relaxed">{metadata.summary}</p>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-100">
        <span className="font-mono text-xs text-slate-400" title={metadata.fileHash}>
          {formatHash(metadata.fileHash)}
        </span>
        {metadata.timestamp > 0 && (
          <span className="text-xs text-slate-400">{formatTimestamp(metadata.timestamp)}</span>
        )}
        {metadata.submitterAddress && (
          <span className="font-mono text-xs text-slate-300" title={metadata.submitterAddress}>
            {formatHash(metadata.submitterAddress)}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ZERO_STATS: EvidenceStats = {
  total: 0,
  byTier: {},
  byCategory: {},
};

export default function VaultPage() {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<EvidenceStats>(ZERO_STATS);
  const [statsLoading, setStatsLoading] = useState(true);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, limit: '20' });
      const res = await fetch(apiUrl(`/api/evidence/search?${params.toString()}`));
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? `Search error ${res.status}`);
      }
      const data = (await res.json()) as SearchResponse;
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void search('');
    fetch(apiUrl('/api/evidence/stats'))
      .then((r) => r.ok ? r.json() as Promise<EvidenceStats> : Promise.reject(r.status))
      .then((data) => setStats(data))
      .catch(() => {/* silently keep zero stats on error */})
      .finally(() => setStatsLoading(false));
  }, [search]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void search(query);
  }

  const categoryValues = Object.values(stats.byCategory);
  const categoryMax = categoryValues.length > 0 ? Math.max(...categoryValues) : 1;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
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
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {tc('operational')}
            </span>
            <TopNav current="vault" />
            <Link
              href="/submit"
              className="hidden sm:flex px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 transition-colors"
            >
              {tc('nav.submitEvidence')}
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Analytics — Tier Stat Cards */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            {t('analytics.title')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label={t('analytics.total')}
              value={statsLoading ? 0 : stats.total}
              sub={t('analytics.totalSub')}
              colorClass="text-slate-900"
            />
            <StatCard
              label={t('analytics.tier1')}
              value={statsLoading ? 0 : (stats.byTier['Tier 1: Smoking Gun'] ?? 0)}
              sub={t('analytics.tier1Sub')}
              colorClass="text-red-600"
            />
            <StatCard
              label={t('analytics.tier2')}
              value={statsLoading ? 0 : (stats.byTier['Tier 2: Material'] ?? 0)}
              sub={t('analytics.tier2Sub')}
              colorClass="text-orange-600"
            />
            <StatCard
              label={t('analytics.tier3')}
              value={statsLoading ? 0 : (stats.byTier['Tier 3: Supporting'] ?? 0)}
              sub={t('analytics.tier3Sub')}
              colorClass="text-amber-600"
            />
            <StatCard
              label={t('analytics.tier4')}
              value={statsLoading ? 0 : (stats.byTier['Tier 4: Anecdotal'] ?? 0)}
              sub={t('analytics.tier4Sub')}
              colorClass="text-slate-500"
            />
          </div>
        </section>

        {/* Analytics — Category Breakdown */}
        <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-5">
            {t('categories.title')}
          </h2>
          <div className="space-y-3">
            {(['Side Effect Withholding', 'Regulatory Misleading', 'Coercion', 'Other'] as Category[]).map(
              (cat) => (
                <CategoryBar
                  key={cat}
                  label={cat}
                  value={statsLoading ? 0 : (stats.byCategory[cat] ?? 0)}
                  max={categoryMax}
                />
              ),
            )}
          </div>
        </section>

        {/* Evidence Ledger */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              {t('ledger.title')}
            </h2>
            {results.length > 0 && (
              <span className="text-xs text-slate-400 font-mono">
                {t('ledger.records', { count: results.length })}
              </span>
            )}
          </div>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="flex gap-2 mb-5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('ledger.searchPlaceholder')}
              className="flex-1 bg-white border border-slate-300 rounded px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-300/50 font-mono shadow-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded text-sm font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? t('ledger.searchingBtn') : t('ledger.searchBtn')}
            </button>
          </form>

          {/* States */}
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-32 bg-white border border-slate-200 rounded-lg animate-pulse shadow-sm"
                />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="bg-white border border-slate-200 border-dashed rounded-lg p-12 text-center shadow-sm">
              <p className="text-slate-500 text-sm">{t('ledger.emptyTitle')}</p>
              <p className="text-slate-400 text-xs mt-1">{t('ledger.emptySub')}</p>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="space-y-3">
              {results.map((result, i) => (
                <EvidenceCard key={result.metadata.fileHash ?? i} result={result} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
