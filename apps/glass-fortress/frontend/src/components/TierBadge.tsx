// Canonical evidence-tier labels — must match EVIDENCE_TIER in
// apps/glass-fortress/backend/src/services/IntakeAgent.ts. Evidence.evidenceTier
// is a plain string column (not a DB enum), so styleFor() falls back gracefully
// for any unrecognized value rather than throwing.
export type EvidenceTier =
  | 'Tier 1: Smoking Gun'
  | 'Tier 2: Material'
  | 'Tier 3: Supporting'
  | 'Tier 4: Anecdotal';

interface TierStyle {
  badge: string;
  dot: string;
  accent: string; // CSS color value, for border-s-4 accent borders
}

const TIER_STYLES: Record<EvidenceTier, TierStyle> = {
  'Tier 1: Smoking Gun': {
    badge: 'bg-red-50 text-red-700 border border-red-200',
    dot: 'bg-red-500',
    accent: 'var(--color-red-500)',
  },
  'Tier 2: Material': {
    badge: 'bg-orange-50 text-orange-700 border border-orange-200',
    dot: 'bg-orange-500',
    accent: 'var(--color-orange-500)',
  },
  'Tier 3: Supporting': {
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
    accent: 'var(--color-amber-500)',
  },
  'Tier 4: Anecdotal': {
    badge: 'bg-slate-100 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
    accent: 'var(--color-slate-300)',
  },
};

const FALLBACK_STYLE: TierStyle = TIER_STYLES['Tier 4: Anecdotal'];

function styleFor(tier: string): TierStyle {
  return TIER_STYLES[tier as EvidenceTier] ?? FALLBACK_STYLE;
}

export function tierAccentColor(tier: string): string {
  return styleFor(tier).accent;
}

export function tierDotColor(tier: string): string {
  return styleFor(tier).dot;
}

export function TierBadge({ tier }: { tier: string }) {
  const s = styleFor(tier);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {tier}
    </span>
  );
}
