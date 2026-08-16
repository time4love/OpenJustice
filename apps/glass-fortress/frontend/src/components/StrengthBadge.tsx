// strength comes from ThesisVersion.aiAnalysis.overallStrengthAssessment —
// WEAK | MODERATE | STRONG | COMPELLING.
const STRENGTH_STYLES: Record<string, { badge: string; dot: string }> = {
  WEAK:       { badge: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-400' },
  MODERATE:   { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
  STRONG:     { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  COMPELLING: { badge: 'bg-blue-100 text-blue-700 border-blue-200',  dot: 'bg-blue-500' },
};

export const STRENGTH_RANK: Record<string, number> = {
  COMPELLING: 3,
  STRONG: 2,
  MODERATE: 1,
  WEAK: 0,
};

export function StrengthBadge({ strength }: { strength: string }) {
  const s = STRENGTH_STYLES[strength] ?? STRENGTH_STYLES.MODERATE;
  return (
    <span className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded border text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {strength.charAt(0) + strength.slice(1).toLowerCase()}
    </span>
  );
}
