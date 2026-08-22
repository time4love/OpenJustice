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
 * v2-item-level: categories moved from the diff to the individual item, with
 * relocations excluded from the derived set. Judging diffs as a whole let a
 * consequential change be masked by routine ones bundled with it.
 */
export const CLASSIFIER_VERSION = 'v2-item-level';

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
