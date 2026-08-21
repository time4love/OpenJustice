'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { SiteHeader } from '@/components/SiteHeader';
import { AuthGuard } from '@/components/AuthGuard';
import { apiUrl } from '@/lib/api';
import { useEnumLabel, type EnumNamespace } from '@/lib/reportEnums';
import {
  evidenceTierFor,
  EVIDENCE_TIERS,
  TIER_FILL,
  TIER_HATCHED,
  type EvidenceTier,
} from '@/lib/reportEvidenceTiers';

// ---------------------------------------------------------------------------
// Phase 9 — the public face of the aggregate layer, and the point of the
// Report model (§0): individually meaningless rows become a pattern.
//
// Researcher-gated for now. The endpoints themselves are public, but a page
// that renders "N reports of X" is what turns aggregate data into a published
// claim, and that is what defamation-risk.md Rule 2 governs. Gating first is
// reversible in the direction that matters.
//
// Two things here are requirements rather than decoration:
//
//   Evidence tiering. Categories do not render with equal visual weight —
//   see reportEvidenceTiers.ts. Colour never carries it alone: each bar is
//   labelled, the legend names each tier in words, and the weakest tier is
//   hatched as well.
//
//   The empty state. Disclosure control means the honest answer at low volume
//   is no cells at all, so "nothing publishable yet" is the DEFAULT state, not
//   an edge case — it is what production shows on day one. It has to read as
//   deliberate, explain the threshold, and never look like a failed request.
//
// Inline SVG rather than a charting library: no dependency to install (npm
// here needs VPN), and it matches how the rest of this app is built — raw
// markup plus Tailwind, no component library.
//
// No dark mode: this app has no dark theme at all (globals.css defines one
// light surface), so a single dark-aware chart would be the inconsistency.
// ---------------------------------------------------------------------------

const SUPPRESSION_THRESHOLD = 10;

type Domain = 'MEDICAL' | 'SOCIAL_ECONOMIC';

interface PatternCell {
  dimensions: Partial<Record<string, string | null>>;
  // Never null: suppressed cells are dropped server-side, not blanked.
  count: number;
}

/** A dimension the reader can break the counts down by. */
interface DimensionOption {
  key: string;
  namespace: EnumNamespace;
  /** Whether this dimension's values carry an evidence tier. */
  tiered: boolean;
}

const MEDICAL_DIMENSIONS: DimensionOption[] = [
  { key: 'symptomCategory', namespace: 'medicalSymptomCategories', tiered: true },
  { key: 'seriousness', namespace: 'medicalSeriousness', tiered: false },
  { key: 'symptomPersistence', namespace: 'symptomPersistence', tiered: false },
  { key: 'vaccineManufacturer', namespace: 'vaccineManufacturers', tiered: false },
  { key: 'reporterAgeRange', namespace: 'reporterAgeRanges', tiered: false },
  { key: 'reporterGender', namespace: 'reporterGenders', tiered: false },
];

const SOCIAL_DIMENSIONS: DimensionOption[] = [
  { key: 'impactCategory', namespace: 'socialEconomicImpactCategories', tiered: true },
  { key: 'vaccinationStatus', namespace: 'vaccinationStatuses', tiered: false },
  { key: 'formalBasisAsserted', namespace: 'formalBasisAsserted', tiered: false },
  { key: 'consequenceSeverity', namespace: 'consequenceSeverity', tiered: false },
  { key: 'outcomeStatus', namespace: 'socialOutcomeStatus', tiered: false },
  { key: 'reporterAgeRange', namespace: 'reporterAgeRanges', tiered: false },
  { key: 'reporterGender', namespace: 'reporterGenders', tiered: false },
];

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

interface Row {
  value: string;
  label: string;
  count: number;
  tier: EvidenceTier;
}

/**
 * The hatch used by the weakest evidence tier, defined once per chart and
 * referenced by every bar. Zero-sized so it occupies no layout.
 */
function HatchDefs({ id }: { id: string }) {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={TIER_FILL.QUALITATIVE} />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeWidth="1.8" />
        </pattern>
      </defs>
    </svg>
  );
}

/**
 * One bar, as inline SVG.
 *
 * No viewBox: the element is sized in real pixels and the rect's width is a
 * percentage of it, so nothing is scaled non-uniformly. A viewBox with
 * preserveAspectRatio="none" would stretch the x axis and turn the rounded
 * corner into an ellipse — the classic distortion in hand-rolled SVG bars.
 *
 * The track behind the bar is drawn too, so a small count still reads as
 * "small share of the largest" rather than as a stray mark floating in space.
 *
 * The bar is anchored to the READING start edge, which SVG will not do on its
 * own: `x="0"` is the left edge whatever the document direction, so in Hebrew a
 * short bar would float away from the labels it belongs to instead of growing
 * out from them.
 */
function Bar({ pct, fill, rtl, height = 18 }: { pct: number; fill: string; rtl: boolean; height?: number }) {
  return (
    <svg width="100%" height={height} className="block" aria-hidden="true">
      <rect x="0" y="0" width="100%" height={height} rx="2" fill="#f1f5f9" />
      <rect x={rtl ? `${100 - pct}%` : 0} y="0" width={`${pct}%`} height={height} rx="2" fill={fill} />
    </svg>
  );
}

/**
 * Rows of label + value + bar.
 *
 * Bar length is the only magnitude encoding; colour carries evidence tier, a
 * different variable, so the two channels never restate each other. Text lives
 * in HTML rather than inside the SVG: it stays selectable and reachable by a
 * screen reader, it wraps correctly in RTL, and it wears text tokens instead of
 * the series colour.
 */
function ChartRows({
  rows,
  tiered,
  unit,
  t,
}: {
  rows: Row[];
  tiered: boolean;
  unit: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const hatchId = useId().replace(/:/g, '');
  const rtl = useLocale() === 'he';
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <>
      <HatchDefs id={hatchId} />
      <ul className="space-y-3">
        {rows.map((row) => {
          const tier = tiered ? row.tier : 'PEER_REVIEWED';
          const fill = tiered && TIER_HATCHED[row.tier] ? `url(#${hatchId})` : TIER_FILL[tier];
          return (
            <li key={row.value}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-sm text-slate-800">{row.label}</span>
                <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                  {row.count.toLocaleString()}
                </span>
              </div>
              <Bar pct={(row.count / max) * 100} fill={fill} rtl={rtl} />
              {tiered && (
                <span className="mt-1 inline-block text-[11px] text-slate-500">
                  {t(`tiers.${row.tier}` as Parameters<typeof t>[0])} · {row.count.toLocaleString()} {unit}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TierLegend({ t }: { t: ReturnType<typeof useTranslations> }) {
  const legendHatchId = useId().replace(/:/g, '');
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <HatchDefs id={legendHatchId} />
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
        {t('tiers.legend')}
      </h3>
      <ul className="space-y-2.5">
        {EVIDENCE_TIERS.map((tier) => (
          <li key={tier} className="flex gap-3 items-start">
            <svg width="16" height="16" className="mt-1 shrink-0" aria-hidden="true">
              <rect
                width="16"
                height="16"
                rx="2"
                fill={TIER_HATCHED[tier] ? `url(#${legendHatchId})` : TIER_FILL[tier]}
                stroke="rgba(0,0,0,0.1)"
              />
            </svg>
            <span className="text-xs leading-relaxed">
              <span className="font-medium text-slate-800">{t(`tiers.${tier}` as Parameters<typeof t>[0])}</span>
              <span className="text-slate-500"> — {t(`tiers.${tier}_note` as Parameters<typeof t>[0])}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
      <p className="text-base font-semibold text-slate-900">{t('empty.heading')}</p>
      <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-prose mx-auto">
        {t('empty.body', { threshold: SUPPRESSION_THRESHOLD })}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs text-amber-700 hover:underline"
        aria-expanded={open}
      >
        {t('empty.why')} {open ? '−' : '+'}
      </button>
      {open && (
        <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-prose mx-auto">
          {t('empty.whyBody', { threshold: SUPPRESSION_THRESHOLD })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PatternsContent() {
  const t = useTranslations('reportPatterns');
  const [domain, setDomain] = useState<Domain | null>(null);
  const [dimension, setDimension] = useState<DimensionOption | null>(null);
  const [cells, setCells] = useState<PatternCell[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [asTable, setAsTable] = useState(false);

  const dimensions = domain === 'MEDICAL' ? MEDICAL_DIMENSIONS : SOCIAL_DIMENSIONS;

  const load = useCallback(async (d: Domain, dim: DimensionOption) => {
    setLoading(true);
    setError(false);
    try {
      const path = d === 'MEDICAL' ? '/api/reports/medical/aggregate' : '/api/reports/social-economic/aggregate';
      const res = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: [dim.key] }),
      });
      if (!res.ok) throw new Error('request failed');
      const body = (await res.json()) as { cells: PatternCell[] };
      setCells(body.cells);
    } catch {
      setError(true);
      setCells(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (domain && dimension) void load(domain, dimension);
  }, [domain, dimension, load]);

  function pickDomain(d: Domain) {
    setDomain(d);
    setDimension((d === 'MEDICAL' ? MEDICAL_DIMENSIONS : SOCIAL_DIMENSIONS)[0]);
    setCells(null);
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader current="home" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500 leading-relaxed">{t('subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            ['MEDICAL', t('domainMedical')],
            ['SOCIAL_ECONOMIC', t('domainSocial')],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => pickDomain(key)}
              aria-pressed={domain === key}
              className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                domain === key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {domain && dimension && (
          <>
            {/* Filters in one row above the chart. */}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="dim" className="text-xs text-slate-500">{t('breakdownBy')}</label>
              <select
                id="dim"
                value={dimension.key}
                onChange={(e) => setDimension(dimensions.find((d) => d.key === e.target.value) ?? dimensions[0])}
                className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                {dimensions.map((d) => (
                  <option key={d.key} value={d.key}>
                    {t(`dimensions.${d.key}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
              {cells && cells.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAsTable((v) => !v)}
                  className="ms-auto text-xs text-amber-700 hover:underline"
                >
                  {asTable ? t('chartView') : t('tableView')}
                </button>
              )}
            </div>

            {loading && <p className="text-sm text-slate-400">{t('loading')}</p>}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                <p className="text-sm text-red-700">{t('loadFailed')}</p>
                <button
                  type="button"
                  onClick={() => void load(domain, dimension)}
                  className="mt-2 text-xs text-red-700 underline"
                >
                  {t('retry')}
                </button>
              </div>
            )}

            {!loading && !error && cells?.length === 0 && <EmptyState t={t} />}

            {!loading && !error && cells && cells.length > 0 && (
              <Results cells={cells} dimension={dimension} domain={domain} asTable={asTable} t={t} />
            )}

            <p className="text-xs text-slate-400 leading-relaxed">{t('caveat')}</p>
          </>
        )}
      </div>
    </main>
  );
}

function Results({
  cells,
  dimension,
  domain,
  asTable,
  t,
}: {
  cells: PatternCell[];
  dimension: DimensionOption;
  domain: Domain;
  asTable: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const label = useEnumLabel(dimension.namespace);

  const rows: Row[] = cells
    // Only cells that actually name this dimension — CUBE also returns the
    // rollup total, which is not a bar.
    .filter((c) => typeof c.dimensions[dimension.key] === 'string')
    .map((c) => {
      const value = c.dimensions[dimension.key] as string;
      return {
        value,
        label: label(value as never),
        count: c.count,
        tier: evidenceTierFor(domain, value),
      };
    })
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) return <EmptyState t={t} />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          {t('chartTitle', { dimension: t(`dimensions.${dimension.key}` as Parameters<typeof t>[0]) })}
        </h2>
        {asTable ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200">
                <th className="text-start font-medium py-1.5">{t('category')}</th>
                <th className="text-end font-medium py-1.5">{t('count')}</th>
                {dimension.tiered && <th className="text-end font-medium py-1.5">{t('tier')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.value} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 text-slate-800">{r.label}</td>
                  <td className="py-1.5 text-end font-mono tabular-nums text-slate-900">{r.count.toLocaleString()}</td>
                  {dimension.tiered && (
                    <td className="py-1.5 text-end text-xs text-slate-500">
                      {t(`tiers.${r.tier}` as Parameters<typeof t>[0])}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ChartRows rows={rows} tiered={dimension.tiered} unit={t('unit')} t={t} />
        )}
      </div>
      {dimension.tiered && <TierLegend t={t} />}
    </div>
  );
}

export default function ReportPatternsPage() {
  return (
    <AuthGuard>
      <PatternsContent />
    </AuthGuard>
  );
}
