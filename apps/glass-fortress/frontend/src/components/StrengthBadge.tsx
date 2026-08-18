'use client';

import { useTranslations } from 'next-intl';

// strength comes from ThesisVersion.aiAnalysis.overallStrengthAssessment —
// WEAK | MODERATE | STRONG | COMPELLING. `pill`/`heLabel` back the larger
// pill-style presentation used on the public /call/[thesisId] hero — kept as
// their own fields (rather than reusing `badge`/`dot`) so consolidating this
// single WEAK..COMPELLING source of truth didn't also silently change either
// page's existing visual design. `heLabel` stays a plain (non-locale-aware)
// Hebrew string deliberately: /call/[thesisId] hardcodes dir="rtl" and
// Hebrew copy throughout regardless of the active locale (a deliberate
// product decision for that public page, not an oversight), so it must not
// switch to English via the `strengths` i18n namespace used elsewhere below.
const STRENGTH_STYLES: Record<string, { badge: string; dot: string; pill: string; heLabel: string }> = {
  WEAK:       { badge: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-400',    pill: 'bg-red-100 text-red-700 border-red-200',     heLabel: 'חלש' },
  MODERATE:   { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400', pill: 'bg-amber-100 text-amber-700 border-amber-200', heLabel: 'בינוני' },
  STRONG:     { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', heLabel: 'חזק' },
  COMPELLING: { badge: 'bg-blue-100 text-blue-700 border-blue-200',  dot: 'bg-blue-500',    pill: 'bg-violet-100 text-violet-700 border-violet-200', heLabel: 'משכנע' },
};

export const STRENGTH_RANK: Record<string, number> = {
  COMPELLING: 3,
  STRONG: 2,
  MODERATE: 1,
  WEAK: 0,
};

function styleFor(strength: string) {
  return STRENGTH_STYLES[strength] ?? STRENGTH_STYLES.MODERATE;
}

export function strengthPillClass(strength: string): string {
  return styleFor(strength).pill;
}

export function strengthHeLabel(strength: string): string {
  return styleFor(strength).heLabel;
}

export function strengthBadgeClass(strength: string): string {
  return styleFor(strength).badge;
}

/** Locale-aware label for a WEAK..COMPELLING strength value, via the `strengths` namespace. */
export function strengthLabel(t: ReturnType<typeof useTranslations<'strengths'>>, strength: string): string {
  return t.has(strength) ? t(strength) : strength;
}

export function StrengthBadge({ strength }: { strength: string }) {
  const t = useTranslations('strengths');
  const s = styleFor(strength);
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded border text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {strengthLabel(t, strength)}
    </span>
  );
}
