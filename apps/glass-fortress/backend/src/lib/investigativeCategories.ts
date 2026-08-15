import { z } from 'zod';

// ---------------------------------------------------------------------------
// Investigative categories
//
// The standing concerns of the Covid investigation. Shared by every path that
// creates evidence — forensic page diffs (ForensicAgent) and documents, articles
// and whistleblower uploads (IntakeAgent) — so a filter by concern returns the
// whole corpus rather than one slice of it.
//
// Deliberately independent of any Thesis. Evidence is normally created BEFORE
// the thesis that cites it, so classification must be answerable the moment
// evidence arrives, with no thesis in existence.
//
// This is NOT "which thesis does this support". That question is relational —
// one record may support several theses, and a thesis written later must be able
// to claim evidence recorded earlier — so it is computed per (evidence, thesis)
// pair elsewhere, never frozen onto the evidence record.
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

/** Hebrew labels used when writing human-readable reasoning onto evidence records. */
export const INVESTIGATIVE_CATEGORY_LABELS: Record<InvestigativeCategory, string> = {
  WITHHOLDING_INFORMATION: 'הסתרת מידע על סיכונים או תופעות לוואי',
  INFORMED_CONSENT: 'פגיעה בהסכמה מדעת',
  COERCION_MANDATE: 'כפייה או התניית זכויות בחיסון',
  EXPERIMENTAL_STATUS_CONCEALMENT: 'הסתרת מעמד הניסויי / אישור חירום',
  SAFETY_CLAIM_ALTERATION: 'שינוי טענות בטיחות',
  STATISTICAL_MANIPULATION: 'שינוי נתונים סטטיסטיים',
  ACCOUNTABILITY_EROSION: 'טשטוש אחריות ודיווח',
};

/**
 * The zod field every classifying agent embeds in its output schema.
 * One definition so the two agents cannot drift apart on what they accept.
 */
export const investigativeCategoriesField = z
  .array(z.enum(INVESTIGATIVE_CATEGORIES))
  .describe(
    'Every standing investigative concern this evidence materially supports. ' +
      'Return an EMPTY ARRAY when it supports none — that is a correct and expected ' +
      'answer, and it is what keeps the evidence corpus usable. Do not add a category ' +
      'because the content is merely interesting, unusual, or government-related: it ' +
      'must materially advance one of the listed concerns.',
  );

/**
 * The taxonomy as it appears in system prompts. Shared so ForensicAgent and
 * IntakeAgent classify against identical definitions.
 */
export const INVESTIGATIVE_CATEGORY_PROMPT_BLOCK = `STANDING INVESTIGATIVE CONCERNS:
- WITHHOLDING_INFORMATION — risk, adverse-event, or efficacy information removed, buried, or made materially harder to find.
- INFORMED_CONSENT — informed-consent disclosures, contraindications, or the right to refuse removed, weakened, or absent where required (Nuremberg Code Art. 1).
- COERCION_MANDATE — mandate or coercive language; access to work, education, travel, or services conditioned on vaccination (Nuremberg Code Art. 1, voluntary consent).
- EXPERIMENTAL_STATUS_CONCEALMENT — EUA, emergency-use, provisional, or experimental-status qualifiers removed, softened, or omitted where material.
- SAFETY_CLAIM_ALTERATION — a biological or safety claim changed or asserted without basis, e.g. how long mRNA persists, effects on the immune system, transmission blocking.
- STATISTICAL_MANIPULATION — efficacy figures, adverse-event counts, or case data altered, restated, selectively presented, or removed.
- ACCOUNTABILITY_EROSION — named officials, accountability statements, or adverse-event reporting channels removed or obscured.

CLASSIFICATION STANDARD:
A concern applies only when the content MATERIALLY ADVANCES it. Ask: could a lawyer put this specific content in front of a court as evidence for this specific concern? If not, do not list the concern.

Do NOT list a concern because content is merely interesting, unusual, poorly explained, or issued by a government body. Precision is the priority: every false positive dilutes the corpus, wastes legal review, and damages credibility in court. When genuinely uncertain, leave it out.`;

/**
 * The label registered on-chain alongside an evidence hash.
 *
 * EvidenceRegistry.submit takes a generic `string category` and is shared with
 * Bronze Fortress, so the contract stays ignorant of this taxonomy — Glass
 * Fortress supplies its own label. Sorted and joined so the same classification
 * always produces the same on-chain string, whatever order the model returned.
 *
 * Empty is meaningful rather than missing: a ContextAnchor establishes a baseline
 * without itself advancing any concern.
 */
export function onChainCategoryLabel(
  categories: readonly InvestigativeCategory[],
  evidenceRole: string,
): string {
  if (categories.length > 0) return [...categories].sort().join(',');
  return evidenceRole === 'ContextAnchor' ? 'CONTEXT_ANCHOR' : 'UNCLASSIFIED';
}

/**
 * Hebrew tier reasoning for evidence promoted from a forensic page diff.
 *
 * States what the change was and which concerns it advances. Says nothing about
 * intent, motive, or knowledge — those are inferences for a court to draw, and
 * asserting them on an automatically created record is exposure with no upside.
 */
export function forensicTierReasoning(
  url: string,
  afterDate: string,
  categories: readonly InvestigativeCategory[],
): string {
  if (categories.length === 0) {
    return `שינוי מתועד בדף ממשלתי רשמי (${url}) בתאריך ${afterDate}.`;
  }
  const labels = categories.map((c) => INVESTIGATIVE_CATEGORY_LABELS[c]).join('; ');
  return (
    `שינוי מתועד בדף ממשלתי רשמי (${url}) בתאריך ${afterDate}. ` +
    `רלוונטי לתחומי החקירה: ${labels}.`
  );
}
