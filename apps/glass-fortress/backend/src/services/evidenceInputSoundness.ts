import { EvidenceKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { SurvivalVerdict } from '../lib/diffSurvival';
import { currentVersionOf, type ContentVersionProvenance } from './evidencePredicates';

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
// AND REBASED AGAIN AT EVIDENCE STEP 15 ONTO **CURRENT(diff)**, WHICH IS WHAT A6
// :1210 ASKED FOR ALL ALONG. 11b moved the verdict onto the version; it left the
// SELECT reading the NEWEST version by `derivedAt`, and newest is not CURRENT.
// A re-walk supersedes an endpoint's text and derives a new version; `DIFF_VERSION`
// then moves and the walk derives another. Newest-by-`derivedAt` is whichever row
// was written last, which after a partial re-derivation is not the one CURRENT
// resolves to — and where the walk owes a version at all, `take: 1` returned a
// STALE row and reported SURVIVES where A3 says AWAITING_DERIVATION. That is the
// direction that PUBLISHES A FALSE CLAIM, which is why it is a gate's defect
// rather than a read's.
//
// THE SELECT AND THE REPORT SHAPE MOVED; THE FOLD DID NOT. CONTRADICTED,
// UNCHECKABLE and AWAITING_DERIVATION all still FAIL. `docs/gf-refactor-plan.md`
// §4 rule 3 and `docs/gf-thesis-refactor-plan.md` §5 scope this rewrite to
// "rebased onto CURRENT(diff)'s per-chunk survival … exactly as A6 words it" —
// the rebase, not the fold — and the 2026-08-30 measurement corroborates the
// verdicts rather than deciding them. `currentVersionOf` is CALLED, never
// re-spelled: three equalities asked as one, in the one module that spells them.
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
  /** The DIFF-derived records it judged, BY NAME — A6 :1201-:1202's subjects. */
  examined: EvidenceInputRow[];
  /**
   * The records it stepped over, NAMED AND NOT COUNTED.
   *
   * It was a number until evidence step 15. A number cannot say WHICH record was
   * stepped over, and the gate's own shape needs the names: §2b's `examined` is
   * "per subject, always present even at zero", so a check that reported "one
   * record out of scope" would leave the row above it unable to name what it did
   * not judge.
   */
  outOfScope: EvidenceInputRow[];
  unsound: EvidenceInputRow[];
  /**
   * PASS · FAIL · EXAMINED_NONE — three-valued, and `binding`/`passed` went with
   * the second value's arrival.
   *
   * A6 :1222 and document A6 :1533 forbid a non-binding pass and require a check
   * with no subject to report that it examined none. Two booleans cannot say it:
   * `(binding: false, passed: true)` reads as a pass everywhere it is rendered,
   * which is precisely what check 6 did before it was retired with the tier.
   */
  verdict: 'PASS' | 'FAIL' | 'EXAMINED_NONE';
}

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
        'No content version of this diff is CURRENT: either the walk has derived none, or an ' +
        "endpoint's text has moved and the versions it holds were derived from text this pair no " +
        'longer has. The walk owes it a derivation; awaiting is not the same as unsound, and ' +
        'nobody is asked to judge a version that does not exist.',
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

/**
 * WHY A RECORD'S INPUT IS NOT SOUND, or null when it is.
 *
 * THREE OF THE FOUR STATES FAIL, and only one of them is a refutation. That is
 * deliberate and it is where this rule departs from `promotionBlockFor`, which
 * blocks on CONTRADICTED alone: refusing to PROMOTE an unchecked diff would halt
 * work over a question nobody has asked yet, while PUBLISHING on one asserts in
 * public that a change happened when the platform has no current answer about
 * whether it did. Unavailable is not a pass — least of all on the way out.
 *
 * (It read "FOUR OF THE FIVE" until evidence step 15, which was true of the
 * five-state display the rule was measured against on 2026-08-30 — SURVIVES ·
 * CONTRADICTED · UNCHECKABLE · UNCHECKED · STALE. `UNCHECKED` and `STALE` retired
 * at 11b into AWAITING_DERIVATION, and `DiffSurvivalView.state` has been four
 * values since. This docblock also sat above `currentDiffSurvival`, which it does
 * not describe; it is on the function it is about.)
 *
 * The CONTRADICTED sentence is borrowed from `promotionBlockFor` rather than
 * rewritten, so the two gates can never describe a contradiction differently.
 */
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
                // BOTH ENDPOINTS' CURRENT TEXT, because CURRENT(diff) is three
                // equalities over them and the version's provenance — not a row
                // order. `orderBy` and `take` are GONE with the defect: every
                // stored version is loaded and `currentVersionOf` chooses.
                beforeSnapshot: { select: { textHash: true, textExtractionVersion: true } },
                afterSnapshot: { select: { textHash: true, textExtractionVersion: true } },
                contentVersions: {
                  select: {
                    contentVersionHash: true,
                    beforeTextHash: true,
                    afterTextHash: true,
                    diffVersion: true,
                    chunks: true,
                  },
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

    // CURRENT(diff), THROUGH THE ONE FUNCTION THAT SPELLS IT. A local comparison
    // of the three equalities here would be the second spelling of CURRENT the
    // one-symbol scan exists to catch — and it is the same predicate the gate,
    // the reviews list and the flag already ask.
    const diff = record.urlVersionDiff;
    const current = currentVersionOf<ContentVersionProvenance & { chunks: unknown }>({
      kind: 'DIFF',
      before: diff.beforeSnapshot,
      after: diff.afterSnapshot,
      versions: diff.contentVersions,
    });
    // `chunksOf` is NOT called here, and that is declared rather than overlooked:
    // this fold reads the `survival` field alone and tolerates a shape `chunksOf`
    // would throw on. Widening it is a behaviour change to a check the gate
    // blocks on, and it belongs to whoever next touches `lib/diffSurvival`.
    // NARROWED ON THE DISCRIMINANT, which is what the union asks of every reader:
    // `Current`'s defined arm splits CAPTURE and DIFF, and only the second
    // carries the version. The CAPTURE arm cannot arise here — this call hands
    // `kind: 'DIFF'` — and reading the discriminant is cheaper than a cast that
    // would assert a shape this function has not checked.
    const currentChunks = current.defined && current.kind === 'DIFF' ? current.version.chunks : undefined;
    const survival = currentDiffSurvival(currentChunks);
    const unsoundReason = unsoundReasonFor(survival);
    return { ...base, survival, ...(unsoundReason === null ? {} : { unsoundReason }) };
  });

  // Scope is "names a diff", NOT "is typed FORENSIC_DIFF". The two agree today,
  // and the derivation is what makes a record checkable — a DOCUMENT-typed row
  // carrying a diff id would still have an input this rule can judge, and a
  // FORENSIC_DIFF row without one would not.
  const examined = rows.filter((r) => r.urlVersionDiffId !== null);
  const outOfScope = rows.filter((r) => r.urlVersionDiffId === null);
  const unsound = examined.filter((r) => r.unsoundReason !== undefined);

  return {
    rows,
    examined,
    outOfScope,
    unsound,
    // A CHECK WITH NO SUBJECT SAYS SO. It is not a pass earned by having nothing
    // to judge, and it is not a failure either.
    verdict: unsound.length > 0 ? 'FAIL' : examined.length > 0 ? 'PASS' : 'EXAMINED_NONE',
  };
}
