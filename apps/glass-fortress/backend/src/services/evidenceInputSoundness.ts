import { EvidenceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  diffSurvivalView,
  promotionBlockFor,
  SURVIVAL_VIEW_SELECT,
  type DiffSurvivalView,
} from './auditDiffSurvival';

// ---------------------------------------------------------------------------
// IS THE INPUT BEHIND THIS EVIDENCE RECORD SOUND?
//
// Level 6's unenforced invariant — *every reported flip confirmed against the
// documents at that boundary* — asked one layer up, at the EVIDENCE record
// rather than at the diff. It is what `EVIDENCE_DIFF_INPUT_SOUND`, check 17 of
// the publication gate, is computed from.
//
// WHY THIS EXISTS AS ITS OWN MODULE AND NOT AS A SECOND COPY OF THE RULE.
// The rule already lives in `lib/diffSurvival` and is rendered once, by
// `diffSurvivalView`. Promotion consumes it through `promotionBlockFor`. What
// was missing was never the rule: it was a CALLER at the evidence layer.
// `assessPublication` read `status` and `onChainTxHash` and nothing else, so a
// record promoted before Level 5's gate existed — or one whose diff became
// CONTRADICTED afterwards — was citable in a published thesis. Measured on
// staging 2026-08-30: 7 diffs CONTRADICTED, and memory records 6 of them
// backing CONFIRMED, anchored evidence.
//
// SO THIS ANSWERS FROM STORED STATE, NOT FROM THE ARCHIVE. `UrlSnapshot.text`
// is the whole document derived from the anchored `document` bytes, not the
// Readability extraction, and `checkDiffSurvival` already tests every ADDED
// chunk against the raw BEFORE document and every REMOVED chunk against the raw
// AFTER one. Re-fetching the Archive to ask the same question would be a second
// implementation of the definition of an unsound input, and would make a hard
// publication check fail whenever a free external service was down.
//
// The two formulations are the same question. An ADDED chunk exists precisely
// because the EXTRACTION lacked it at the before capture; finding it in the raw
// document there IS the extraction divergence at that boundary. That is the
// signal the 3-record sample separated the one false summary by.
//
// WHAT IT DOES NOT COVER, said out loud because the summary a researcher reads
// must not imply more: DOCUMENT evidence has no snapshot-derived input and gets
// no check here at all. It is the least-covered class in the corpus and the one
// the thesis published on 2026-08-30 cites.
// ---------------------------------------------------------------------------

export interface EvidenceInputRow {
  fileHash: string;
  evidenceType: EvidenceType;
  /** Null for DOCUMENT evidence — nothing was derived, so there is nothing to check. */
  urlVersionDiffId: string | null;
  /** The diff's Level 5 state. Null when the record is not diff-derived. */
  survival: DiffSurvivalView | null;
  /** Why this record's input is not sound. Absent when it is, or when it is out of scope. */
  unsoundReason?: string;
}

export interface EvidenceInputSoundnessReport {
  rows: EvidenceInputRow[];
  /** Cited records that are diff-derived — the denominator this check judges. */
  inScope: number;
  /** Cited records that are not, and therefore say nothing about the verdict. */
  outOfScope: number;
  unsound: EvidenceInputRow[];
  /**
   * False when nothing cited is diff-derived.
   *
   * A pass earned by having nothing in scope is not the same as a pass, and the
   * surface must be able to say which one it is — the same admission check 6
   * makes about the tier threshold, and the shape the integrity board demotes
   * as VACUOUS when a check hides it.
   */
  binding: boolean;
  passed: boolean;
}

/**
 * WHY A RECORD'S INPUT IS NOT SOUND, or null when it is.
 *
 * FOUR OF THE FIVE STATES FAIL, and only one of them is a refutation. That is
 * deliberate and it is where this rule departs from `promotionBlockFor`, which
 * blocks on CONTRADICTED alone: refusing to PROMOTE an unchecked diff would halt
 * work over a question nobody has asked yet, while PUBLISHING on one asserts in
 * public that a change happened when the platform has no current answer about
 * whether it did. Unavailable is not a pass — least of all on the way out.
 *
 * The CONTRADICTED sentence is borrowed from `promotionBlockFor` rather than
 * rewritten, so the two gates can never describe a contradiction differently.
 */
function unsoundReasonFor(survival: DiffSurvivalView): string | null {
  switch (survival.state) {
    case 'SURVIVES':
      return null;
    case 'CONTRADICTED':
      // Non-null by construction: promotionBlockFor returns a sentence for
      // exactly this state. Asserted rather than defaulted — a fallback here
      // would invent a second wording for the one verdict that refutes.
      return (
        promotionBlockFor(survival) ??
        'This diff is CONTRADICTED by the archived documents it spans.'
      );
    case 'UNCHECKABLE':
      return (
        'No check of this record\'s input could be made. ' +
        (survival.reason ?? 'The stored row does not say which cause applied.') +
        ' A thesis may not assert in public a change the platform cannot check.'
      );
    case 'UNCHECKED':
      return (
        'The diff behind this record has never been checked against the documents it spans. ' +
        'Never checked is not the same as supported.'
      );
    case 'STALE':
      return (
        'The stored check behind this record is about inputs the diff no longer holds, so the ' +
        'platform has no current answer about it. Run forensics:backfill-survival to recompute it.'
      );
  }
}

/**
 * The soundness of every cited record's input, one query.
 *
 * Takes file hashes rather than loaded rows on purpose. The publication gate
 * already holds a narrower selection of the same evidence, and threading it
 * through would couple this rule to that caller's `select` — which is how a
 * surface comes to render a verdict it fetched three of the six columns for.
 *
 * Hashes with no record are ABSENT from `rows` rather than reported unsound:
 * "cited but not in the vault" is check 5's question and it already blocks on
 * it. Answering it a second time here, in different words, would give a
 * researcher two refusals for one defect.
 */
export async function assessEvidenceInputSoundness(
  fileHashes: readonly string[],
): Promise<EvidenceInputSoundnessReport> {
  const records =
    fileHashes.length === 0
      ? []
      : await prisma.evidence.findMany({
          where: { fileHash: { in: [...fileHashes] } },
          select: {
            fileHash: true,
            evidenceType: true,
            urlVersionDiffId: true,
            urlVersionDiff: { select: SURVIVAL_VIEW_SELECT },
          },
        });

  const rows: EvidenceInputRow[] = records.map((record) => {
    const base = {
      fileHash: record.fileHash,
      evidenceType: record.evidenceType,
      urlVersionDiffId: record.urlVersionDiffId,
    };

    if (record.urlVersionDiffId === null) return { ...base, survival: null };

    // A foreign key makes this unreachable, and it is reported rather than
    // dropped anyway: a record whose diff cannot be loaded is a record whose
    // input cannot be judged, and a subject quietly filtered out of a pass is a
    // subject reported as nothing to check.
    if (record.urlVersionDiff === null) {
      return {
        ...base,
        survival: null,
        unsoundReason:
          `This record names diff ${record.urlVersionDiffId}, which could not be loaded, so its ` +
          'input cannot be judged at all.',
      };
    }

    const survival = diffSurvivalView(record.urlVersionDiff);
    const unsoundReason = unsoundReasonFor(survival);
    return { ...base, survival, ...(unsoundReason === null ? {} : { unsoundReason }) };
  });

  // Scope is "names a diff", NOT "is typed FORENSIC_DIFF". The two agree today,
  // and the derivation is what makes a record checkable — a DOCUMENT-typed row
  // carrying a diff id would still have an input this rule can judge, and a
  // FORENSIC_DIFF row without one would not.
  const inScope = rows.filter((r) => r.urlVersionDiffId !== null);
  const unsound = inScope.filter((r) => r.unsoundReason !== undefined);

  return {
    rows,
    inScope: inScope.length,
    outOfScope: rows.length - inScope.length,
    unsound,
    binding: inScope.length > 0,
    passed: unsound.length === 0,
  };
}
