import { createHash } from 'crypto';
import { FORENSIC_DIFF_CLASSIFICATION_PROMPT } from '../prompts/forensicDiffClassification';

// ---------------------------------------------------------------------------
// Provenance for a stored classification.
//
// isLegallySignificant, investigativeCategories and aiSignificance are LLM
// output written to a column and never recomputed on read. The moment the
// prompt changes they mean different things on different rows, and nothing can
// tell a stale row from a fresh one.
//
// Two values, doing two jobs:
//
//   CLASSIFIER_VERSION is human-readable and is what reclassification targets
//   ("bring everything below v2 up to date"). Bump it whenever a change alters
//   what the classifier would decide.
//
//   classifierPromptHash is the proof. A version string is a promise — edit the
//   prompt without bumping it and every row claims a version that no longer
//   describes what judged it, which is the same defect as CONFIRMED without an
//   anchor. The hash is checkable: if the prompt at that version in git does not
//   hash to the stored value, something else judged the row.
//
// The prompt text itself is deliberately NOT stored per row. It lives in git,
// versioned and diffable, and the hash recovers it exactly. Storing it on every
// one of thousands of rows would store badly what git stores well.
//
// Note also what this is NOT. Classification is editorial triage about what
// deserves attention, not evidence. Chain of custody belongs to
// UrlSnapshot.contentHash and Evidence.fileHash. Classification needs
// provenance, not immutability.
// ---------------------------------------------------------------------------

/**
 * Bump on any change that alters what the classifier would decide.
 *
 * v4-budgeted-best-of-n: the classifier is given an explicit output budget, and a
 * diff is drawn up to MAX_CLASSIFICATION_DRAWS times with the best-covered draw
 * kept.
 *
 * THE PROMPT HASH DOES NOT MOVE ACROSS v3 -> v4. The prompt text is byte-identical;
 * what changed is the budget the answer is written into and how many answers are
 * taken. classifierPromptHash proves the question, and is blind to both.
 *
 * Measured on the corpus's largest diff (68 chunks): under the provider's default
 * budget, three draws covered 57%, 76% and 75% of chunks; with an explicit budget
 * two of three reached 99% and 100%. The stored v3 row for that diff described 63%
 * of its own input. After v4 it describes 99%, with the single remaining chunk
 * reported rather than silent.
 *
 * WHY THIS AXIS AND NOT ANOTHER FIELD. The budget and the draw policy are code
 * constants: they move only when someone commits a change, which is exactly what a
 * version string tracks. classifierModel earned a separate axis because an env var
 * can change the model with no commit at all; nothing like that is true here.
 *
 * The version is NOT named after the budget's value on purpose. A number in the
 * name becomes false the moment someone tunes it without renaming, and the rule at
 * the top of this comment already requires a bump for tuning.
 *
 * Note what the absence of this bump cost: with every row already at v3, the
 * targeting filter (NOT classifierVersion = CLASSIFIER_VERSION) selected nothing,
 * and re-running the corpus under the new behaviour required --force. A version
 * whose job is to answer "which rows are stale?" answered "none" about rows that
 * were.
 *
 * v3-self-contained-summary: legalSignificance may no longer describe, quote or
 * refer to any other evidence record. Correlated evidence still reaches the
 * classifier and may still decide WHETHER an item is flagged, but it can no
 * longer enter the prose.
 *
 * The prior instruction told the model to "EXPLICITLY cross-reference" correlated
 * evidence in legalSignificance, and offered as its model output "they silently
 * deleted the mRNA safety claim 3 weeks after this internal report surfaced" —
 * which is an argument, not a description of a page change. That prose becomes
 * Evidence.summary verbatim, so an evidence record's public text asserted things
 * unverifiable against its own source, and every thesis-stage agent read it as an
 * independent observation. A thesis could then be corroborated by its own
 * premise, reflected back through a forensic record.
 *
 * Every row at v2-item-level or earlier was produced under that instruction. That
 * is a fact recoverable from classifierPromptHash, not an assumption.
 *
 * v2-item-level: categories moved from the diff to the individual item, with
 * relocations excluded from the derived set. Judging diffs as a whole let a
 * consequential change be masked by routine ones bundled with it.
 */
export const CLASSIFIER_VERSION = 'v4-budgeted-best-of-n';

/**
 * Provenance for the summary alone.
 *
 * Separate from CLASSIFIER_VERSION because the two move independently:
 * `forensics:resummarize` rewrites aiSignificance from already-extracted items
 * without re-judging them, so a row can hold a self-contained summary over
 * v2-extracted items. One version string covering both would have to lie about
 * one of them.
 */
export const SUMMARY_VERSION = 'v3-self-contained-summary';

/**
 * SHA-256 of the composed prompt actually sent to the model.
 *
 * Composed, not the literal source: the prompt interpolates
 * INVESTIGATIVE_CATEGORY_PROMPT_BLOCK, so a change to the taxonomy changes what
 * the classifier was told and must change this hash too.
 */
export function classifierPromptHash(): string {
  return createHash('sha256').update(FORENSIC_DIFF_CLASSIFICATION_PROMPT, 'utf8').digest('hex');
}
