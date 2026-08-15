// ---------------------------------------------------------------------------
// Investigative categories — client mirror of the backend taxonomy.
//
// Must stay in step with
// apps/glass-fortress/backend/src/lib/investigativeCategories.ts. The API returns
// these values verbatim on every evidence record.
//
// This is the single classification axis for evidence. It answers "what is this
// about", and nothing else: `evidenceRole` says what job the evidence does,
// `evidenceTier` how much weight it carries, `evidencePerspective` what kind of
// knowledge it is. A record may advance several concerns, or none.
// ---------------------------------------------------------------------------

export const INVESTIGATIVE_CATEGORIES = [
  'WITHHOLDING_INFORMATION',
  'INFORMED_CONSENT',
  'COERCION_MANDATE',
  'EXPERIMENTAL_STATUS_CONCEALMENT',
  'SAFETY_CLAIM_ALTERATION',
  'STATISTICAL_MANIPULATION',
  'ACCOUNTABILITY_EROSION',
] as const;

export type InvestigativeCategory = (typeof INVESTIGATIVE_CATEGORIES)[number];

/** Translation key under the `categories` namespace for a given concern. */
export function categoryMessageKey(category: InvestigativeCategory): string {
  return `categories.${category}`;
}

/**
 * Badge colours. Related concerns share a hue so a row of chips reads as a
 * shape rather than a rainbow: concealment purple, consent/coercion rose,
 * claims and figures blue, accountability amber.
 */
export function categoryStyle(category: InvestigativeCategory): string {
  switch (category) {
    case 'WITHHOLDING_INFORMATION':
    case 'EXPERIMENTAL_STATUS_CONCEALMENT':
      return 'bg-purple-50 text-purple-700 border border-purple-200';
    case 'INFORMED_CONSENT':
    case 'COERCION_MANDATE':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    case 'SAFETY_CLAIM_ALTERATION':
    case 'STATISTICAL_MANIPULATION':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'ACCOUNTABILITY_EROSION':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
  }
}

/** Narrows an API-supplied string array to known concerns, dropping anything stale. */
export function asInvestigativeCategories(values: readonly string[]): InvestigativeCategory[] {
  return values.filter((v): v is InvestigativeCategory =>
    (INVESTIGATIVE_CATEGORIES as readonly string[]).includes(v),
  );
}
