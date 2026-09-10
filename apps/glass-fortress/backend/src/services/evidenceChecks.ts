import {
  publishableEvidence,
  type Conjunct,
  type ConjunctId,
  type ExaminedMention,
} from './evidencePredicates';

// ---------------------------------------------------------------------------
// THE SIX CHECKS OF A6 — docs/gf-evidence-flows.md A6, in thesis A6's order.
//
// THE WHOLE MODULE IS A MAPPING. It calls `publishableEvidence(versionId)` ONCE
// and renders its output as six check rows; it computes no predicate, and it
// READS NO DATABASE. A6 :1217: "The predicate and the gate are ONE
// implementation: the checks CALL the predicates of A3 and never re-derive
// them." A gate that could load would be the one function `publishable` loaded
// two ways, which is the drift that sentence is written against — so the loading
// is `publishableEvidence`'s and the mapping is this module's, and that is what
// makes "the gate is a projection of one evaluation" true in the code rather
// than in a paragraph.
//
// WHAT THIS FILE MAY NOT CONTAIN: a Prisma client import, a Prisma delegate by
// name, or a predicate declaration under either spelling. Held by a scan at
// §7.5 with four decoys and a non-firing control.
//
// WHY THE IDS AND THE PROSE ARE HERE RATHER THAN IN `evidencePredicates.ts`:
// `publishable` is A3's PREDICATE and these are A6's GATE ROWS with a surface's
// vocabulary. Putting the ids and the sentences inside the predicates module
// would put a surface's words inside a predicate. The consumer is thesis step
// 23's `check_publication_readiness`, which is not built here.
//
// THE SEAM THIS MODULE DOES NOT CROSS: IT RENDERS ROWS, AND EVALUABILITY IS
// `publishableEvidence`'s. That function answers a DISCRIMINATED UNION — a
// version citing a DOCUMENT record that failed nothing is `evaluable: false`,
// because four of six conjuncts examined nothing and no conjunct failed — and
// THE SIX ROWS CANNOT CARRY THAT. Mapped alone they read as two PASSes, four
// EXAMINED_NONEs and no failure, which is a clean bill over a version the
// predicate has just said it cannot grade.
//
// The rows are not wrong: each says exactly what it examined, which is what A6
// :1201-:1202 asks of a check. What they cannot say is the thing one level up,
// and A6 gives them no field for it. So the consumer — thesis step 23's
// `check_publication_readiness` — MUST ASK FOR BOTH, the checks for what to show
// and `publishableEvidence` for whether the version could be answered for at
// all; and the instrument at §4c routes `evaluable: false` to exit 1 under its
// own heading, NOT_ANSWERABLE, never among the failures. A surface that rendered
// these rows alone would be R38 round 3's M6 one level along: an answer about a
// citation nobody graded. Held by a case in
// `test/evidence/evidenceChecks.test.ts`, which asserts what this output does NOT
// claim.
//
// CHECK 6 — `EVIDENCE_TIER` — IS RETIRED, AND THE RETIREMENT IS RECORDED RATHER
// THAN LEFT AS AN ABSENCE. A6 :1209: "RETIRED with the tier (§3)." It gated on
// `evidenceTier >= 2` and REPORTED ITSELF NON-BINDING — a check that announced
// its own vacuity and passed anyway, which is the reason §0b's rule exists at
// all. The tier left the evidence row at 11b and there is nothing to delete for
// it; what would otherwise be lost is the memory, so that the id does not return
// one day as a new check with the same shape. `CheckId` has SIX members and
// `EVIDENCE_TIER` is not one of them.
// ---------------------------------------------------------------------------

/** A6's checks, by the id thesis A6 gives each — ids 5 to 10, and no seventh. */
export type CheckId =
  | 'EVIDENCE_VERIFIED' // 5
  | 'EVIDENCE_PINNED_CURRENT' // 6
  | 'EVIDENCE_ARGUED' // 7
  | 'EVIDENCE_NOT_WITHDRAWN' // 8
  | 'EVIDENCE_DERIVED' // 9
  | 'EVIDENCE_DIFF_INPUT_SOUND'; // 10 — check 17 by its old number

export interface EvidenceCheck {
  id: CheckId;
  /**
   * HARD, EVERY ONE. There is no advisory evidence check and no non-binding
   * pass: A6 :1222 and document A6 :1533 say so from both sides, and the arm
   * that once excused the DOCUMENT class FELL when that class gained its
   * predicates.
   */
  kind: 'hard';
  /**
   * PASS · FAIL · EXAMINED_NONE, and the third is not a pass.
   *
   * `binding: boolean` beside `passed: boolean` cannot say it: `(false, true)`
   * reads as a pass everywhere it is rendered, which is exactly what check 6 did
   * before it was retired with the tier.
   */
  verdict: 'PASS' | 'FAIL' | 'EXAMINED_NONE';
  /** WHAT IT EXAMINED — A6 :1201-:1202, per subject, present even at zero. */
  examined: ExaminedMention[];
  /** The subjects that failed, each with the sentence naming why. */
  failures: { mentionId: string; fileHash: string; detail: string }[];
}

/**
 * THE MAPPING, AS DATA — thesis A6 :1592-:1597's order, and §0a's reconciliation.
 *
 * A3 states FIVE clauses and A6 states SIX checks, so this is not a bijection
 * with A3 — but it IS one with the CONJUNCTS, because the sixth conjunct is the
 * precondition A6 promotes. Written as a table so that the order is a value an
 * equality can police, rather than six `if`s nobody can compare with the
 * appendix; the `id` order below is NOT `CONJUNCT_ORDER`, and that difference is
 * the whole of §0a.
 */
const CHECKS: readonly { id: CheckId; conjunct: ConjunctId; why: string }[] = [
  {
    id: 'EVIDENCE_VERIFIED',
    conjunct: 'VERIFIED',
    why: 'VERIFIED(e) for every cited record, reading the stored attribution verdict per capture',
  },
  {
    id: 'EVIDENCE_PINNED_CURRENT',
    conjunct: 'CITATION_CURRENT',
    // A6 :1211 asks this "for every EVIDENCE mention AND EVERY GAP RESOLUTION".
    // IT EXAMINES MENTIONS ONLY, and the second subject is answered through the
    // first: evidence A2 rules that "a gap resolved by the corpus names a mention
    // of the head version, AND THE PIN IS THE MENTION'S", thesis A2's
    // `ThesisGapDecision.citedName` carries no hash of its own, and the tree's
    // `ThesisGapResolution` holds no `contentVersionHash` for a check to compare.
    // Stated here so a later reader does not read the clause as unimplemented.
    why: 'CITATION_CURRENT(m) for every EVIDENCE mention; a stale pin names the pinned and current hashes',
  },
  {
    id: 'EVIDENCE_ARGUED',
    conjunct: 'ARGUED',
    // A6 :1212's FOURTH clause — "the version cited equals what the argument was
    // made against" — IS NOT CHECKED HERE, and the gate is weaker than A6 until
    // thesis step 20. A debate carries no content-version hash, so a fourth
    // clause here would have to re-derive what the argument was made against,
    // which is the second spelling A6 forbids one line above. The invariant is
    // maintained by the WRITE: thesis T2 copies `debateSessionId` forward only
    // while (fileHash, pin) is unchanged, and `promote_from_debate` refuses
    // STALE_PIN. That writer arrives at thesis step 20.
    why: "ARGUED(m): the mention's debate is PROMOTED for this thesis and this record",
  },
  {
    id: 'EVIDENCE_NOT_WITHDRAWN',
    conjunct: 'RECORD_PROMOTED',
    why: 'the record exists and its status is PROMOTED; a withdrawn one names its reason',
  },
  {
    id: 'EVIDENCE_DERIVED',
    conjunct: 'DERIVED',
    why: 'CURRENT is defined for every cited record — the failure says the walk owes a version',
  },
  {
    id: 'EVIDENCE_DIFF_INPUT_SOUND',
    conjunct: 'INPUT_SOUND',
    why: "check 17, over CURRENT(e.record)'s chunks; a record naming no diff reports it examined none",
  },
];

/**
 * The six checks for one thesis version.
 *
 * ONE CALL, SIX ROWS. `publishableEvidence` does every read — including loading
 * the version's EVIDENCE mentions — and this maps its per-mention reports onto
 * the check rows. It is called ONCE for a version with three mentions, not three
 * times.
 *
 * THE FOLD, STATED ONCE: a check is FAIL if any subject failed; EXAMINED_NONE if
 * it had no subject at all, or if EVERY subject it had reported that it examined
 * none; PASS if at least one subject was examined and none failed. The middle
 * arm is the one a boolean cannot express, and it is why the verdict is
 * three-valued (§0b).
 */
export async function evidenceChecks(versionId: string): Promise<EvidenceCheck[]> {
  const report = await publishableEvidence(versionId);

  return CHECKS.map(({ id, conjunct }) => {
    const examined: ExaminedMention[] = [];
    const failures: EvidenceCheck['failures'] = [];
    let anyExamined = false;

    for (const mention of report.mentions) {
      examined.push(mention.examined);
      const verdict = verdictFor(mention.conjuncts, conjunct, id);
      if (verdict.verdict === 'FAIL') {
        failures.push({
          mentionId: mention.examined.mentionId,
          fileHash: mention.examined.fileHash,
          detail: verdict.detail ?? '',
        });
      } else if (verdict.verdict === 'PASS') {
        anyExamined = true;
      }
    }

    const verdict: EvidenceCheck['verdict'] =
      failures.length > 0 ? 'FAIL' : anyExamined ? 'PASS' : 'EXAMINED_NONE';
    return { id, kind: 'hard', verdict, examined, failures };
  });
}

/**
 * One mention's verdict for one conjunct.
 *
 * A conjunct the predicate did not render is a DEFECT in the predicate rather
 * than a check with no answer, and it throws naming both — the walk-defect shape
 * `chunksOf` and Gate 2 already use. Silently reading it as EXAMINED_NONE would
 * be a check reporting "no subject" about a question that was never asked.
 */
function verdictFor(conjuncts: Conjunct[], conjunct: ConjunctId, id: CheckId): Conjunct {
  const held = conjuncts.find((c) => c.id === conjunct);
  if (held === undefined) {
    throw new Error(
      `evidenceChecks: PUBLISHABLE rendered no ${conjunct} for check ${id}. The gate maps one ` +
        'evaluation onto six rows; a conjunct it cannot find is a defect in the predicate, not a ' +
        'check with no subject.',
    );
  }
  return held;
}
