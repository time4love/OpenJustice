import { DIFF_INPUT_VERSION } from './diffChunking';

// ---------------------------------------------------------------------------
// DOES THIS ROW'S CLASSIFICATION DESCRIBE THE CHUNKS THE ROW NOW HOLDS?
//
// The question `classifierVersion` cannot answer, and the reason this file
// exists. `applyRediff` rewrites a diff's raw chunks and updates
// `diffInputVersion`, deliberately leaving the classification alone so that
// "chunks current, classification not" is visible in the data. The comment on
// that function said the two provenance fields would say so honestly.
//
// THEY DID NOT. The granularity cascade rewrote chunks v2 -> v3 on ten rows
// whose `classifierVersion` was ALREADY `v4-budgeted-best-of-n` — so it stayed
// v4, nothing moved, and the rows came to assert a pairing that never happened:
// a v4 classification over v3 chunks, when the v4 run had read v2 chunks that no
// longer exist. Seven CONFIRMED, anchored records sit downstream of them.
//
// A version for the PROCEDURE is not a version for what the procedure was FED —
// the same shape as the 88 survival verdicts that stayed green because a hash
// over the inputs was blind to a change in the rule. Two fields, two questions:
//
//   diffInputVersion        which rule produced the chunks the row holds NOW
//   classifiedInputVersion  which rule produced the chunks the CLASSIFIER read
//
// Staleness is the mismatch, derived on read rather than stored, so it answers
// for rows written long before the check existed and cannot itself go stale.
//
// THREE STATES, NOT TWO. `UNRECORDED` is its own answer and does not collapse
// into either neighbour, for the same reason `UNAVAILABLE` does not collapse
// into VERIFIED or CONTRADICTED: it is a statement about the RECORD, not about
// the classification, and calling it current would be a claim nothing supports
// while calling it stale would be a claim nothing supports either.
// ---------------------------------------------------------------------------

export type ClassificationInputState =
  /** The classifier read the chunks this row holds. */
  | 'CURRENT'
  /** The chunks were rewritten after the classification. NOT a pass. */
  | 'STALE'
  /** The row has no classification to say anything about. */
  | 'UNCLASSIFIED'
  /**
   * The row predates `classifiedInputVersion`. What the classifier read is
   * unrecorded — which is not the same as stale, and is emphatically not
   * current.
   *
   * DELIBERATELY NOT BACKFILLED. The value is not recoverable from the row:
   * writing `diffInputVersion` into it would assert that every stored
   * classification had read the chunks the row now holds, which is precisely the
   * assumption that produced the ten wrong rows. The ten cannot be separated
   * from the other pre-column rows by any signal the data carries — that is a
   * finding about what was lost, not a gap to paper over.
   */
  | 'UNRECORDED';

export interface DiffClassificationProvenance {
  classifierVersion: string | null;
  diffInputVersion: string | null;
  classifiedInputVersion: string | null;
}

export function classificationInputState(
  diff: DiffClassificationProvenance,
): ClassificationInputState {
  if (diff.classifierVersion === null) return 'UNCLASSIFIED';
  if (diff.classifiedInputVersion === null) return 'UNRECORDED';
  return diff.classifiedInputVersion === diff.diffInputVersion ? 'CURRENT' : 'STALE';
}

/**
 * The per-row view every surface renders, mirroring `diffSurvivalView`.
 *
 * ONE HELPER, so the headline count and the row detail are computed from the
 * same function and cannot disagree — the defect this repository has recorded
 * six times is a right mechanism under a wrong summary, and summaries are what
 * people act on.
 */
export interface ClassificationInputView {
  state: ClassificationInputState;
  /** Which rule produced the chunks the classifier read. Null when unrecorded. */
  classifiedInputVersion: string | null;
  /** Which rule produced the chunks the row holds now. */
  diffInputVersion: string | null;
  /** Why the state is not CURRENT, in the terms a reader has to act on. */
  caveat: string | null;
}

/** The columns a view needs, so no surface has to re-derive the select. */
export const CLASSIFICATION_PROVENANCE_SELECT = {
  classifierVersion: true,
  diffInputVersion: true,
  classifiedInputVersion: true,
} as const;

export function classificationInputView(
  diff: DiffClassificationProvenance,
): ClassificationInputView {
  const state = classificationInputState(diff);
  return {
    state,
    classifiedInputVersion: diff.classifiedInputVersion,
    diffInputVersion: diff.diffInputVersion,
    caveat: caveatFor(state, diff),
  };
}

function caveatFor(
  state: ClassificationInputState,
  diff: DiffClassificationProvenance,
): string | null {
  switch (state) {
    case 'CURRENT':
    case 'UNCLASSIFIED':
      return null;
    case 'STALE':
      return (
        `This classification was made from ${String(diff.classifiedInputVersion)} chunks, and this ` +
        `row's chunks have since been recomputed to ${String(diff.diffInputVersion)}. The stored ` +
        'items describe text the row no longer holds. Reclassifying is a RESEARCH decision, not a ' +
        'repair: it changes what the record says about the edit.'
      );
    case 'UNRECORDED':
      return (
        'This row predates input provenance for its classification, so which chunks the ' +
        'classifier actually read is unrecorded. That is not evidence the classification is ' +
        'stale, and it is not evidence that it is current. It is NOT backfilled: writing the ' +
        "row's current input version into it would assert exactly the pairing that ten rows " +
        'were found asserting falsely.'
      );
  }
}

/** The input rule a classification made right now would be reading. */
export const CURRENT_CLASSIFIER_INPUT_VERSION = DIFF_INPUT_VERSION;
