import { EvidenceKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { SurvivalVerdict } from '../lib/diffSurvival';

// ---------------------------------------------------------------------------
// IS THE INPUT BEHIND THIS EVIDENCE RECORD SOUND?
//
// Level 6's unenforced invariant — *every reported flip confirmed against the
// documents at that boundary* — asked one layer up, at the EVIDENCE record
// rather than at the diff. It is what `EVIDENCE_DIFF_INPUT_SOUND`, check 17 of
// the publication gate, is computed from.
//
// REBASED AT EVIDENCE STEP 11b ONTO THE CONTENT VERSION, WHICH IS WHERE A
// SURVIVAL VERDICT NOW LIVES — and evidence A6 says it in one line: check 17
// "judges CURRENT(e.record)'s chunks, so it binds on every DIFF record".
//
// The old shape asked the DIFF ROW for one verdict about the whole diff, and
// asked three more columns whether that verdict was still about the inputs the
// row held. All of that was the row carrying content it should not have: a
// verdict per row cannot say WHICH chunk the documents refute, and the staleness
// question existed only because a re-derivation overwrote the row in place.
// Under A2 a derivation is an APPENDED version, its chunks each carrying their
// own survival, so the current version is the answer and there is no stale one
// to detect. `diffSurvivalView` — the display the deleted audit left behind at
// 11a-evidence — had this as its last consumer and goes with the columns.
//
// WHY THIS EXISTS AS ITS OWN MODULE AND NOT AS A SECOND COPY OF THE RULE.
// The rule lives in `lib/diffSurvival`, which the walk applies per chunk at
// derivation. What was missing was never the rule: it was a CALLER at the
// evidence layer.
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

/** What CURRENT(diff) says about its own chunks — the COMPUTED register, per chunk. */
export interface DiffSurvivalView {
  /** AWAITING_DERIVATION when the walk owes this diff a version at all (A3). */
  state: 'AWAITING_DERIVATION' | 'SURVIVES' | 'CONTRADICTED' | 'UNCHECKABLE';
  /** How many chunks the current version holds — a denominator. */
  chunksChecked: number;
  /** How many of them the documents refute. */
  contradictedCount: number;
  reason?: string;
}

export interface EvidenceInputRow {
  fileHash: string;
  evidenceKind: EvidenceKind;
  /** Null for DOCUMENT evidence — nothing was derived, so there is nothing to check. */
  urlVersionDiffId: string | null;
  /** The diff's Level 5 state, read from CURRENT(diff). Null when not diff-derived. */
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
/**
 * CURRENT(diff)'s per-chunk survival, folded into one verdict about the record.
 *
 * THE FOLD IS DELIBERATELY PESSIMISTIC and in one direction only: one
 * CONTRADICTED chunk contradicts the record, because a thesis citing a change
 * cites the change as a whole. UNCHECKABLE outranks SURVIVES for the same reason
 * the five-state display did — an unavailable check must not count as a result.
 */
function currentDiffSurvival(chunks: unknown): DiffSurvivalView {
  if (chunks === undefined) {
    return {
      state: 'AWAITING_DERIVATION',
      chunksChecked: 0,
      contradictedCount: 0,
      reason:
        'This diff has no content version, so there is nothing to judge yet. The walk owes it a ' +
        'derivation; awaiting is not the same as unsound, and nobody is asked to judge a version ' +
        'that does not exist.',
    };
  }
  const parsed: SurvivalVerdict[] = Array.isArray(chunks)
    ? chunks.flatMap((c) =>
        typeof c === 'object' && c !== null && typeof (c as { survival?: unknown }).survival === 'string'
          ? [(c as { survival: SurvivalVerdict }).survival]
          : [],
      )
    : [];
  const contradicted = parsed.filter((v) => v === 'CONTRADICTED').length;
  if (contradicted > 0) {
    return { state: 'CONTRADICTED', chunksChecked: parsed.length, contradictedCount: contradicted };
  }
  const uncheckable = parsed.filter((v) => v === 'UNCHECKABLE').length;
  if (uncheckable > 0) {
    return {
      state: 'UNCHECKABLE',
      chunksChecked: parsed.length,
      contradictedCount: 0,
      reason: `${String(uncheckable)} of ${String(parsed.length)} chunks could not be checked against the documents.`,
    };
  }
  return { state: 'SURVIVES', chunksChecked: parsed.length, contradictedCount: 0 };
}

function unsoundReasonFor(survival: DiffSurvivalView): string | null {
  switch (survival.state) {
    case 'SURVIVES':
      return null;
    case 'CONTRADICTED':
      return (
        `The archived documents this diff spans refute ${String(survival.contradictedCount)} of ` +
        `${String(survival.chunksChecked)} reported chunks. A record whose own report the documents ` +
        'contradict is evidence of a pipeline defect, not of a change.'
      );
    case 'UNCHECKABLE':
      return (
        "No check of this record's input could be made. " +
        (survival.reason ?? 'The version does not say which cause applied.') +
        ' A thesis may not assert in public a change the platform cannot check.'
      );
    case 'AWAITING_DERIVATION':
      return (
        survival.reason ??
        'This diff has no content version, so its input has never been checked at all.'
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
            kind: true,
            urlVersionDiffId: true,
            urlVersionDiff: {
              select: {
                contentVersions: {
                  select: { chunks: true },
                  orderBy: { derivedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        });

  const rows: EvidenceInputRow[] = records.map((record) => {
    const base = {
      fileHash: record.fileHash,
      evidenceKind: record.kind,
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

    const survival = currentDiffSurvival(record.urlVersionDiff.contentVersions.at(0)?.chunks);
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
