import { prisma } from '../lib/prisma';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { citationCurrent } from './evidencePredicates';
import { closeDebate, recordChecks, type RecordChecked } from './openDebate';
import type { LoadedDebate } from './debateState';
import type { BlockerCode, RecordCode, Refusal } from '../mcp/tools/evidenceRefusals';

// ---------------------------------------------------------------------------
// PROMOTION — docs/gf-evidence-flows.md §4, A4; thesis T3.
//
// "REFUSES unless: the session is OPEN · the latest argument cleared SUBSTANCE ·
// a DISPUTES verdict has been answered at least once … nothing here can refuse
// on the merits — promotedOverObjection is recorded instead."
//
// ONE TRANSACTION, and NOTHING ON CHAIN. §5: "No research act writes to the
// chain. The walk is the only chain writer, it runs in the deployment, and the
// hazard class that produced the fake-CONFIRMED audit … has no research-act path
// left to travel." `registerEvidenceHash` keeps its one caller, which
// test/evidence/scans.test.ts holds, and this module imports neither it nor
// `Web3Service`.
//
// NO EvidenceDecision IS WRITTEN HERE. The review log is step 14's, and
// promotion is not a review: the row's first `affirmed` is the version the
// argument was made against, not a decision about a version that moved.
// ---------------------------------------------------------------------------

/** Why a debate cannot be promoted right now — the reads report all of these. */
export interface PromotionCheck {
  blockedBy: BlockerCode[];
  /** The record's facts, when the seven checks passed — what the transaction writes from. */
  checked: RecordChecked | null;
  /** The first record refusal, when one fired — what `promote_from_debate` returns. */
  recordRefusal: Refusal<RecordCode> | null;
}

/**
 * Every blocker, in order: the session's own, then the record's, then the pin.
 *
 * ONE FUNCTION, TWO CALLERS. `open_debate` and `get_debate` report `canPromote`
 * and `blockedBy` from it; `promote_from_debate` refuses from it. A return that
 * said `canPromote: true` beside a tool that refuses cannot happen, because both
 * are this list.
 */
export async function promotionBlockers(debate: LoadedDebate): Promise<PromotionCheck> {
  const blockedBy: BlockerCode[] = [];

  if (debate.record === null) {
    throw new Error(
      `promoteFromDebate: session ${debate.id} names neither a capture nor a pair the corpus holds. ` +
        'A debate is opened on a record; this is a malformed row, not an answerable state.',
    );
  }

  if (!debate.hasSubstance) blockedBy.push('NO_SUBSTANCE');
  // "A DISPUTES verdict has been answered at least once." Read as: the session
  // holds a RESPONSE_SUBMITTED. NOT "a response after the latest assessment" —
  // every response is followed by a fresh assessment, so that reading is
  // unsatisfiable by construction and would carry an objection forever with no
  // answer possible.
  if (debate.verdict === 'DISPUTES' && !debate.events.some((e) => e.type === 'RESPONSE_SUBMITTED')) {
    blockedBy.push('OBJECTION_UNANSWERED');
  }

  // EVERY refusal of open_debate, re-checked at THIS moment — the record may have
  // moved since the argument was made (A4).
  const checks = await recordChecks({
    record: debate.record,
    thesisId: debate.thesisId,
    headVersionId: debate.thesis.headVersionId,
  });
  if ('error' in checks) {
    blockedBy.push(checks.code);
    return { blockedBy, checked: null, recordRefusal: checks };
  }

  // STALE_PIN (T3): the head's mention pins a version that is not the record's
  // CURRENT — "the argument was made against content the citation does not name".
  // Through the step-12 predicate, never a comparison spelled here.
  const pinned = citationCurrent(checks.mention, checks.current);
  if (pinned.evaluable && !pinned.value) blockedBy.push('STALE_PIN');

  return { blockedBy, checked: checks, recordRefusal: null };
}

export interface Promoted {
  fileHash: string;
  status: string;
  affirmedContentVersionHash: string;
  created: boolean;
  promotedOverObjection: boolean;
}

/**
 * The promotion, as ONE transaction under the shared window.
 *
 * The Evidence row is created IFF none exists for the record's name; a second
 * thesis's cleared argument JOINS the row instead — which is what A4 retired
 * `ALREADY_EVIDENCE` for, and what evidence step 13's migration made expressible
 * by dropping the unique index on `evidenceId`.
 */
export async function promote(
  debate: LoadedDebate,
  checked: RecordChecked,
  researcherId: string,
): Promise<Promoted> {
  const promotedOverObjection = debate.verdict === 'DISPUTES';

  return prisma.$transaction(async (tx) => {
    const existing = await tx.evidence.findUnique({
      where: { fileHash: checked.fileHash },
      select: { id: true, status: true, affirmedContentVersionHash: true },
    });

    const row =
      existing ??
      (await tx.evidence.create({
        data: {
          fileHash: checked.fileHash,
          kind: checked.kind,
          snapshotId: checked.snapshotId,
          urlVersionDiffId: checked.diffId,
          // STATED, never defaulted. The column has no default and A2 says why:
          // "both values are live claims about a human's standing decision, so a
          // default would let a forgetful write assert one".
          status: 'PROMOTED',
          affirmedContentVersionHash: checked.contentVersionHash,
          promotedById: researcherId,
          promotedAt: new Date(),
        },
        select: { id: true, status: true, affirmedContentVersionHash: true },
      }));

    await closeDebate(tx, debate.id, { evidenceId: row.id, promotedOverObjection });

    // THE MENTION'S ONE WRITE AFTER CREATION (thesis A2): the argument, by
    // reference. The version write copies it forward while (name, pin) is
    // unchanged; nothing else ever sets it.
    await tx.thesisMention.update({
      where: { id: checked.mention.id },
      data: { debateSessionId: debate.id },
    });

    await tx.debateEvent.create({
      data: {
        sessionId: debate.id,
        type: 'PROMOTED',
        content: `Promoted ${checked.fileHash}${promotedOverObjection ? ' over the assessor’s objection' : ''}`,
        refId: row.id,
      },
    });

    return {
      fileHash: checked.fileHash,
      // A WITHDRAWN row is JOINED and stays WITHDRAWN — "nothing moves it back"
      // (§6). The researcher who argued for it gets a truthful answer rather than
      // a refusal the contract does not name; re-affirming is `review_evidence`'s,
      // at step 14.
      status: row.status,
      affirmedContentVersionHash: row.affirmedContentVersionHash,
      created: existing === null,
      promotedOverObjection,
    };
  }, WRITE_TRANSACTION);
}
