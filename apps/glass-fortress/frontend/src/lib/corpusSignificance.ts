import type { CorpusEntry } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE SIGNIFICANCE GATE — docs/gf-ui-flows.md §24 :663–:680 (amended 2026-09-18, the researcher);
// docs/gf-ui-refactor-plan.md UI-7's two-weights bullet; evidence A4 :1086–:1087.
//
// THE FIELD IS `legallySignificant`, NEVER `editorial`, AND THE MEASUREMENT IS THE REASON. Of 21 diffs on the
// real corpus, 20 carry `editorial: true` — and EIGHT of those same 20 are ALSO `legallySignificant` with an
// investigative category. The two are not opposites: most real changes are an editorial rewrite AND material.
// An `editorial` gate would therefore have hidden eight changes the classifier itself flagged, and their
// absence would have been invisible, because absence in a corpus is invisible by construction.
//
// A DIFF WITH NO OPINION IS NEVER GATED (the researcher, 2026-09-19). A classifier that has not spoken has
// not judged the row insignificant, and hiding it would let silence decide. A diff awaiting derivation is the
// commonest such row, and §24's region 4 calls that a STATE and not an error.
//
// A CAPTURE IS NEVER GATED EITHER, and not merely because it carries no opinion: the captures are the ticks
// between the changes, and a stream that dropped them would leave the changes without the dates that place
// them.
//
// THIS MODULE IS PURE. It imports a TYPE and nothing else — no React, no messages, no `window` — so the rule
// can be held by a case that renders nothing, which is what lets the gate be asserted by VALUE.
// ---------------------------------------------------------------------------

/**
 * Did the classifier FLAG this row? `legallySignificant`, or any investigative category — the backend's own
 * `deriveSignificance`, and §24's own wording ("`legallySignificant` / `categories.length > 0`").
 */
export function flaggedByClassifier(entry: CorpusEntry): boolean {
  if (entry.kind !== 'DIFF') return true;
  if (entry.opinion === null) return true;
  return entry.opinion.legallySignificant || entry.opinion.categories.length > 0;
}

/**
 * The stream as it is drawn: what is shown, and HOW MANY ARE HIDDEN — one pass, so the count line can never
 * disagree with the list it describes. §24 requires both halves together: a hidden row that announces itself
 * can be audited, one that does not, cannot.
 */
export function partitionBySignificance(entries: readonly CorpusEntry[]): { shown: CorpusEntry[]; hidden: CorpusEntry[] } {
  const shown: CorpusEntry[] = [];
  const hidden: CorpusEntry[] = [];
  for (const entry of entries) (flaggedByClassifier(entry) ? shown : hidden).push(entry);
  return { shown, hidden };
}
