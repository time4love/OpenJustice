import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { resolveRecordByName } from './corpusReads';
import { currentVersionOf, needsReview } from './evidencePredicates';
import { refusal, type EvidenceWriteCode, type Refusal } from '../mcp/tools/evidenceRefusals';

// ---------------------------------------------------------------------------
// FLOW E3's DECISION — docs/gf-evidence-flows.md §6, §9 and A4.
//
// "REAFFIRM: the current version still supports every citing thesis's use of it
// … WITHDRAW: the current version no longer supports it, or never did; reason
// REQUIRED." NO AUTOMATIC RE-AFFIRMATION, EVER: nothing computes this, and the
// only entry point is a researcher's call.
//
// THIS MODULE'S NAME IS FIXED BY A TEST WRITTEN BEFORE IT. `test/evidence/
// scans.test.ts` allows `services/reviewEvidence.ts` — and no other path — to
// write the three evidence tables. It may not be called anything else.
//
// WHAT IT WRITES, AND NOTHING ELSE (§6): one `EvidenceDecision`, and one update
// of the `Evidence` row. NO ThesisMention — "the citations are NOT re-pinned by
// this act: each mention still pins the old version … the researcher re-pins by
// issuing a new thesis version — the thesis flows' act, done by the thesis's
// author, WHO MAY NOT BE THE REVIEWER". NO version, NO debate, NO chain: this
// module imports neither `Web3Service` nor the anchoring path, which §4c's scan
// holds.
//
// NO `NOT_AUTHOR`, AND THE DESIGN SAYS SO IN TERMS. Step 13's NOT_AUTHOR ruling
// covered writes ON a thesis; a review writes no thesis row. ANY researcher
// reviews ANY record, and the reviewer need not be `promotedById`.
// ---------------------------------------------------------------------------

export type Decision = 'REAFFIRM' | 'WITHDRAW';

export interface ReviewInput {
  fileHash: string;
  decision: Decision;
  reason?: string;
  expectedSequence: number;
}

/** A4's return — the row's standing after the act, and the sequence it now stands at. */
export interface Reviewed {
  fileHash: string;
  status: string;
  affirmedContentVersionHash: string;
  decisionSequence: number;
}

/**
 * The record as the decision needs it: its standing, what a human affirmed, and
 * the provenance CURRENT is derived from.
 *
 * PROVENANCE ONLY, no chunks. This act judges nothing about the content — the
 * researcher already read it in `list_evidence_reviews` — so the write path
 * reads what it needs to compute CURRENT and stops there.
 */
const RECORD_SELECT = {
  fileHash: true,
  kind: true,
  status: true,
  affirmedContentVersionHash: true,
  snapshot: { select: { textHash: true, textExtractionVersion: true } },
  urlVersionDiff: {
    select: {
      beforeSnapshot: { select: { textHash: true, textExtractionVersion: true } },
      afterSnapshot: { select: { textHash: true, textExtractionVersion: true } },
      contentVersions: {
        select: {
          contentVersionHash: true,
          beforeTextHash: true,
          afterTextHash: true,
          diffVersion: true,
        },
      },
    },
  },
} as const;

/**
 * A researcher's decision on one record — the refusals, then ONE transaction.
 *
 * THE ORDER OF THE REFUSALS IS PART OF THE CONTRACT (§3a), cheapest and most
 * local first. `NO_RESEARCHER` is the caller's (the tool answers it from memory
 * before any query); everything below is decided here, and each from ONE thing.
 */
export async function reviewEvidence(
  input: ReviewInput,
  researcherId: string,
): Promise<Reviewed | Refusal<EvidenceWriteCode>> {
  // 2. REASON_REQUIRED — "a blank reason is no reason". SECOND because it needs
  //    no query at all; step 13 put it fourth only because an AUTHOR check stood
  //    in front of it, and there is none here.
  if (input.decision === 'WITHDRAW' && (input.reason ?? '').trim().length === 0) {
    return refusal(
      'REASON_REQUIRED',
      'A withdrawal states why: the record keeps its name, its argument and its citations, and the ' +
        'reason is what a reader of the thesis that cited it finds when they ask what happened.',
    );
  }

  const row = await prisma.evidence.findUnique({
    where: { fileHash: input.fileHash },
    select: RECORD_SELECT,
  });

  // 3. NOT_A_RECORD — A4's own words, "the name resolves to nothing the corpus
  //    holds". THE COMPUTED CORPUS PASS RUNS ONLY ON THIS FAILURE PATH: a name
  //    with an evidence row is one indexed lookup, and only a name without one
  //    costs a pass over every record the corpus holds.
  if (row === null) {
    const inCorpus = await resolveRecordByName(input.fileHash);
    if (inCorpus === null) {
      return refusal(
        'NOT_A_RECORD',
        `${input.fileHash} names nothing the corpus holds. A record's name is derived from the ` +
          'corpus itself — the page, the timestamps and the bytes — so a name that resolves to ' +
          'nothing is not a record awaiting promotion; it is not a record.',
      );
    }
    // 4a. NOT_PROMOTED, first of its two facts: the corpus holds it and nobody
    //     selected it. A review acts on a SELECTION, and there is none.
    return refusal(
      'NOT_PROMOTED',
      `${input.fileHash} is a corpus record nobody has promoted: it has no evidence row, so there ` +
        'is no affirmed version to re-affirm and no standing to withdraw. Cite it in a thesis and ' +
        'argue for it first — promotion is what makes a corpus record evidence.',
    );
  }

  // 4b. NOT_PROMOTED, second fact: WITHDRAWN. §6: "there is nothing to
  //     re-affirm or withdraw". THE MESSAGE NAMES WHICH OF THE TWO, because they
  //     are different facts and a researcher acts differently on each.
  if (row.status === 'WITHDRAWN') {
    return refusal(
      'NOT_PROMOTED',
      `${input.fileHash} was withdrawn. Nothing moves a withdrawn record back: it keeps its name, ` +
        'its argument and its citations so that a reader of the thesis that cited it can find out ' +
        'what happened, and a new selection of the same record is a new argument, not a reversal.',
    );
  }

  const record = recordContentOf(row);
  const current = record === null ? undefined : currentVersionOf(record);

  // 5. AWAITING_DERIVATION — BOTH decisions, A4 :1161 listing it unscoped, and a
  //    DOCUMENT row refuses THE SAME CODE (one state, one word, on both
  //    surfaces). "Awaiting is not review: the human is not asked to judge a
  //    version that does not exist."
  if (current === undefined) {
    return refusal(
      'AWAITING_DERIVATION',
      `${input.fileHash} is a DOCUMENT record: its content is derived from bytes the platform ` +
        'holds, and the class — its table, its extractor and its custody modes — is document ' +
        'refactor step 28. There is no version to judge yet.',
    );
  }
  if (!current.defined) {
    return refusal(
      'AWAITING_DERIVATION',
      `The current version of ${input.fileHash} does not exist: its endpoints' text has moved and ` +
        'the walk owes a re-derivation. Run scan_captures on this page, then review it — a human ' +
        'is not asked to judge a version that does not exist.',
    );
  }

  // 6. NOTHING_TO_REVIEW — REAFFIRM only, THROUGH THE PREDICATE, never a hash
  //    comparison spelled here. "WITHDRAW of a current record IS allowed" (§6,
  //    verbatim): a researcher may decide the record never supported the claim.
  const owed = needsReview(row, current);
  if (input.decision === 'REAFFIRM' && owed.evaluable && !owed.value) {
    return refusal(
      'NOTHING_TO_REVIEW',
      `${input.fileHash} is already affirmed at its current version ` +
        `(${current.contentVersionHash}). A REAFFIRM would record a decision about nothing; a ` +
        'WITHDRAW of a current record is allowed, with its reason.',
    );
  }

  return commit(input, researcherId, row.affirmedContentVersionHash, current.contentVersionHash);
}

/** The loaded row as CURRENT reads it, or null for a DOCUMENT record. */
function recordContentOf(row: {
  snapshot: { textHash: string; textExtractionVersion: string } | null;
  urlVersionDiff: {
    beforeSnapshot: { textHash: string; textExtractionVersion: string };
    afterSnapshot: { textHash: string; textExtractionVersion: string };
    contentVersions: {
      contentVersionHash: string;
      beforeTextHash: string;
      afterTextHash: string;
      diffVersion: string;
    }[];
  } | null;
}) {
  if (row.snapshot !== null) return { kind: 'CAPTURE' as const, capture: row.snapshot };
  if (row.urlVersionDiff !== null) {
    return {
      kind: 'DIFF' as const,
      before: row.urlVersionDiff.beforeSnapshot,
      after: row.urlVersionDiff.afterSnapshot,
      versions: row.urlVersionDiff.contentVersions,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// THE WRITE — ONE transaction, and the compare-and-set in both its halves.
// ---------------------------------------------------------------------------

/**
 * A stale compare-and-set, carried OUT of the transaction.
 *
 * THE CATCH DOES NOT CONTINUE. Both halves convert and THROW, so the transaction
 * rolls back whole and the refusal is composed outside the `$transaction` call —
 * the distinction step 13's `openOrRevise` had to make for the opposite reason
 * (it needed to continue, so its catch had to be outside).
 */
class StaleSequence extends Error {
  constructor(
    readonly expected: number,
    /**
     * The sequence the record was at, or NULL when that is unknown.
     *
     * Half A read it and can name it. Half B cannot: the value it read is the one
     * the RACE invalidated, so naming it would tell the researcher the log is at a
     * number it has already left. Null says what is true — the log moved, and
     * where to is a re-read away.
     */
    readonly actual: number | null,
  ) {
    super('the record’s review log moved under this write');
    this.name = 'StaleSequence';
  }
}

/** A decision as it is written — the shape the guard checks before the insert. */
export interface DecisionEntry {
  fileHash: string;
  sequence: number;
  type: Decision;
  researcherId: string;
  fromVersionHash?: string;
  toVersionHash?: string;
  reason?: string;
}

/**
 * A2's REQUIRED columns, per type — the `pageLog.REQUIRED` map shape.
 *
 * The schema declares all three NULLABLE and the CHECK
 * `EvidenceDecision_fields_by_type` enforces them at the database; this is the
 * same rule on the CALLER's side, checked BEFORE the first insert. A `Record`
 * over the enum, so a decision type added without a line here fails to COMPILE
 * rather than passing unguarded.
 *
 * THE GUARD AND `REASON_REQUIRED` ARE DIFFERENT INSTRUMENTS AND BOTH EXIST: the
 * refusal is the contract's answer to a researcher who left a reason blank; the
 * guard is the defect check on this module, and a violation of it is a BUG, not
 * a refusal — so it throws.
 */
const REQUIRED: Record<Decision, readonly (keyof DecisionEntry)[]> = {
  REAFFIRM: ['researcherId', 'fromVersionHash', 'toVersionHash'],
  WITHDRAW: ['researcherId', 'reason'],
};

/** Present and, for a string, not blank — as `pageLog` spells it. */
function isSupplied(value: string | number | undefined): boolean {
  if (typeof value === 'number') return true;
  return value !== undefined && value.trim().length > 0;
}

/**
 * EXPORTED FOR ITS OWN CASE, and for nothing else.
 *
 * The REAFFIRM arm is reachable through `reviewEvidence` — a malformed row whose
 * `affirmedContentVersionHash` is blank fires it. The WITHDRAW arm is NOT:
 * `REASON_REQUIRED` stands in front of it and refuses first, which is the point
 * of the two being different instruments. An arm no case can reach is an arm
 * nobody would notice losing, so the guard is exported and held directly.
 */
export function requireFields(entry: DecisionEntry): void {
  for (const field of REQUIRED[entry.type]) {
    if (!isSupplied(entry[field])) {
      throw new Error(
        `A ${entry.type} decision requires ${field}; the caller supplied none. A2 makes it ` +
          'REQUIRED per type and the database CHECK enforces it — this is a defect in this module, ' +
          'not a refusal the contract names.',
      );
    }
  }
}

/**
 * ONE TRANSACTION, under the shared window (§3b).
 *
 *   1  read the record's LAST sequence (0 when none); ≠ expectedSequence →
 *      STALE_SEQUENCE, and NOTHING is written
 *   2  `evidenceDecision.create` at `last + 1`, guarded per type
 *   3  `evidence.update` — REAFFIRM moves `affirmed` and leaves `status`;
 *      WITHDRAW moves `status` and leaves `affirmed`
 *
 * `last + 1` IS COMPUTED FROM THE READ, NEVER FROM `expectedSequence` — which is
 * why a caller passing a number HIGHER than the truth cannot open a gap: step 1
 * refuses it, and even if it did not, the insert would still take `last + 1`.
 *
 * THE RETURN READS THE UPDATE'S OWN SELECT, never a re-read: a second query
 * could answer from a row someone else moved between the two.
 *
 * WHAT IS COMPUTED OUTSIDE THE WINDOW, AND WHAT THAT COSTS. `affirmedBefore` and
 * `currentHash` are read before the transaction opens. A concurrent REVIEW is
 * caught by the compare-and-set, because every review writes a decision and the
 * sequence is the thing it compares; a concurrent RE-DERIVATION is not, so a
 * REAFFIRM can record the version that was CURRENT a moment ago — and the record
 * simply re-enters the list, which is the state Flow E3 exists to answer.
 */
async function commit(
  input: ReviewInput,
  researcherId: string,
  affirmedBefore: string,
  currentHash: string,
): Promise<Reviewed | Refusal<EvidenceWriteCode>> {
  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.evidenceDecision.findFirst({
        where: { fileHash: input.fileHash },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const at = last?.sequence ?? 0;
      if (at !== input.expectedSequence) throw new StaleSequence(input.expectedSequence, at);

      const entry: DecisionEntry =
        input.decision === 'REAFFIRM'
          ? {
              fileHash: input.fileHash,
              sequence: at + 1,
              type: 'REAFFIRM',
              researcherId,
              // BOTH NAMED, so the log says what was stood behind AND what
              // replaced it. `from` is the affirmed version as it was BEFORE this
              // act — read before the update moves it.
              fromVersionHash: affirmedBefore,
              toVersionHash: currentHash,
            }
          : {
              fileHash: input.fileHash,
              sequence: at + 1,
              type: 'WITHDRAW',
              researcherId,
              reason: input.reason,
            };
      // AND NOTHING THE OTHER ARM REQUIRES: a `toVersionHash` on a withdrawal
      // would assert a version somebody stood behind.
      requireFields(entry);

      try {
        await tx.evidenceDecision.create({ data: entry });
      } catch (err) {
        if (!isSequenceCollision(err)) throw err;
        // NULL, not `at`: `at` is the value this caller read and the race
        // invalidated between the read and the insert.
        throw new StaleSequence(input.expectedSequence, null);
      }

      const updated = await tx.evidence.update({
        where: { fileHash: input.fileHash },
        data:
          input.decision === 'REAFFIRM'
            ? { affirmedContentVersionHash: currentHash }
            : { status: 'WITHDRAWN' },
        select: { status: true, affirmedContentVersionHash: true },
      });

      return {
        fileHash: input.fileHash,
        status: updated.status,
        affirmedContentVersionHash: updated.affirmedContentVersionHash,
        decisionSequence: at + 1,
      };
    }, WRITE_TRANSACTION);
  } catch (err) {
    if (!(err instanceof StaleSequence)) throw err;
    return refusal(
      'STALE_SEQUENCE',
      (err.actual === null
        ? `The review log of ${input.fileHash} moved between this call's read and its write — ` +
          'another review was recorded first, and the sequence it is at now is not known until you ' +
          'read again. '
        : `The review log of ${input.fileHash} is at sequence ${String(err.actual)} and this call ` +
          `expected ${String(err.expected)}: it moved under you, or the list you read is stale. `) +
        'Read list_evidence_reviews again — its commands carry the current expectedSequence — and ' +
        'decide against what the record says now.',
    );
  }
}

/**
 * A P2002 on `EvidenceDecision_fileHash_sequence_key`, AND NOTHING ELSE.
 *
 * The race half A cannot see: two callers who both read the same `last` both
 * insert `last + 1`, and the loser meets the unique index. IT READS
 * `meta.target`, NEVER THE CODE ALONE — P2002 is *a* unique violation, not *this*
 * one, and the same code from another constraint swallowed into "the log moved"
 * would be a wrong answer built out of a right catch. Any other P2002
 * propagates unchanged.
 *
 * The shape is `services/openDebate.ts`'s `isOpenKeyCollision`, which is the only
 * `meta.target` reader in this tree. `src/walk/pageLog.ts` is NOT the precedent:
 * it matches the code alone, which is sound there because the only index its
 * insert can collide on is the one it is writing, and is not sound here.
 */
function isSequenceCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  // BOTH FORMS, because the driver reports either: the constraint's NAME
  // (`EvidenceDecision_fileHash_sequence_key`) or the list of FIELDS it covers
  // (`['fileHash', 'sequence']`). Taken together the target must name both
  // columns, so `['fileHash']` alone, `['openKey']` and `EvidenceDecision_pkey`
  // are all NOT this constraint and propagate.
  const namesBoth = (t: string): boolean => t.includes('fileHash') && t.includes('sequence');
  if (typeof target === 'string') return namesBoth(target);
  if (!Array.isArray(target)) return false;
  return namesBoth(target.filter((t): t is string => typeof t === 'string').join(','));
}
