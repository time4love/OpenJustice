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
 * Significance is category membership — a change matters to this investigation
 * exactly when it advances one of its standing concerns. Single source of truth,
 * so the flag and the classification can never disagree.
 *
 * MOVED HERE FROM `services/ForensicAgent.ts` (UI-8 chunk 5a), WHICH IS THE
 * WRITER, BECAUSE THE READ PATH NEEDED TO CALL IT. §24 :674 names this function
 * as the significance gate the corpus reads apply, and
 * `evidencePredicates.flaggedByClassifier` now calls it — so leaving it on the
 * classifier would have made a public read of the corpus import the LLM stack
 * (`ForensicAgent` → `LLMFactory` → LangChain) to ask a question about a list's
 * length. Its home is the module that already owns the taxonomy and the other
 * pure function over it, `onChainCategoryLabel`. Nothing about the rule moved.
 *
 * `readonly string[]` AND NOT `readonly InvestigativeCategory[]`, and the
 * widening is what makes the CALL possible rather than a second spelling. A
 * STORED classification's categories are read back as plain strings on purpose
 * (`corpusReads.StoredClassification` parses `z.array(z.string())`), because a
 * row written under an older taxonomy is still a row and must not be narrowed
 * away — the reader would otherwise have to either cast or filter, and filtering
 * would silently change the gate's answer for exactly those rows. The element
 * type contributes nothing to a length test, and the writer's own call site
 * still passes the enum-typed list.
 */
export function deriveSignificance(categories: readonly string[]): boolean {
  return categories.length > 0;
}

// ---------------------------------------------------------------------------
// THE SIGNIFICANCE GATE, READ SIDE — docs/gf-ui-flows.md §24 :663–:680 and
// region 3's ruling (g) at :758.
//
// IT SITS BESIDE `deriveSignificance` ON PURPOSE, so one grep finds both halves
// of a rule whose halves are easy to confuse — and they were confused, in the
// brief that asked for this function.
// ---------------------------------------------------------------------------

/** The classifier's opinion, by the two fields the gate reads — STRUCTURAL, so `corpusReads.Opinion` satisfies it and this module depends on nothing. */
export interface ClassifierOpinion {
  legallySignificant: boolean;
  categories: readonly string[];
}

/**
 * FLAGGED BY THE CLASSIFIER — the gate the corpus reads apply, in THREE arms.
 *
 * **1. A CAPTURE IS NEVER GATED**, and not merely because it carries no opinion:
 * the captures are the ticks between the changes, and a stream that dropped them
 * would leave the changes without the dates that place them.
 *
 * **2. A DIFF WITH NO OPINION IS NEVER GATED EITHER** (the researcher,
 * 2026-09-19). A classifier that has not spoken has not judged the row
 * insignificant, and hiding it would let silence decide. THIS ARM IS LIVE:
 * `corpusReads.diffRow` sets `opinion: null` whenever the current version is
 * undefined — the AWAITING DERIVATION row, which §24 region 4 calls a STATE and
 * not an error.
 *
 * **3. OTHERWISE `legallySignificant`, OR ANY INVESTIGATIVE CATEGORY** — the
 * field is `legallySignificant` and NEVER `editorial`, and the measurement is
 * the reason (§24 :663–:670): of 21 diffs on the real corpus 20 carry
 * `editorial: true`, and EIGHT of those same 20 are ALSO `legallySignificant`
 * with a category. The two are not opposites, so an `editorial` gate would have
 * hidden eight changes the classifier itself flagged — and their absence would
 * have been invisible, because absence in a corpus is invisible by construction.
 *
 * **`deriveSignificance` IS NOT THIS FUNCTION, and the difference is arm 2.**
 * That one is the WRITE-side derivation — how `isLegallySignificant` is computed
 * as a row is stored — and it is one half of arm 3 and nothing else. Calling it
 * as the gate answers `false` on an opinion-less diff, which is exactly the
 * divergence the frontend's own copy of this function records a render case
 * catching, and exactly what ruling (g) forbids: it would DIM a row the
 * researcher ruled is never gated.
 *
 * COPIED, NOT IMPORTED, ACROSS THE WORKSPACE BOUNDARY, WITH ITS SOURCE NAMED —
 * the frontend's `src/lib/corpusSignificance.ts` holds the same three arms under
 * the same name, and `test/investigativeCategories.test.ts` pins the table both
 * must answer. The researcher refused a cross-workspace import on 2026-09-19
 * over a 20-character regex; the accepted pattern is `corpusQuery.ts`' `DAY`.
 */
export function flaggedByClassifier(entry: { kind: 'CAPTURE' } | { kind: 'DIFF'; opinion: ClassifierOpinion | null }): boolean {
  if (entry.kind !== 'DIFF') return true;
  if (entry.opinion === null) return true;
  return entry.opinion.legallySignificant || entry.opinion.categories.length > 0;
}

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
