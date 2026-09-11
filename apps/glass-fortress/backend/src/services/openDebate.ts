import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordId, type Record as CorpusRecord, type RecordId } from '../lib/evidenceIdentity';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import {
  chunksOf,
  loadDiffByPair,
  loadCaptures,
  loadPage,
  lookupCapture,
  pairName,
  type Page,
  type StoredChunk,
  type TimelineDiff,
} from './corpusReads';
import { currentVersionOf, intervening, type Current } from './evidencePredicates';
import type { AssessedContent } from './promotionAssessor';
import {
  notACapture,
  refusal,
  shared,
  type RecordCode,
  type Refusal,
} from '../mcp/tools/evidenceRefusals';

// ---------------------------------------------------------------------------
// THE DEBATE, OPENED — docs/gf-evidence-flows.md §4 and A4, thesis T3.
//
// THIS MODULE OWNS TWO THINGS AND A SOURCE SCAN HOLDS EACH.
//
//   `openKey` — its whole lifecycle. test/evidence/scans.test.ts allows the
//   column to be assigned in THIS FILE and nowhere else, so the module that
//   COMPOSES the key is the module that RELEASES it: `closeDebate` below is what
//   `promote_from_debate` calls, and that file never spells the column. A2's
//   rule is "one OPEN debate per (thesis, record)" as a nullable column under an
//   ordinary unique index — PostgreSQL does not collide NULLs, so any number of
//   CLOSED sessions coexist for one pair, and the index can only enforce "at most
//   one non-null". ONE WRITER is what enforces that non-null means OPEN.
//
//   `recordChecks` — the seven checks A4 gives `open_debate`, produced ONCE.
//   A4 says promotion re-checks "every refusal of open_debate … at this moment",
//   and two implementations of "every refusal" is precisely the drift that
//   sentence is written against. `promotionBlockers` calls this same function.
//
// EVERY CHECK GOES THROUGH THE STEP-12 PREDICATES AND NONE IS RE-DERIVED:
// `currentVersionOf` answers AWAITING_DERIVATION and NOTHING_TO_PROMOTE,
// `intervening` answers NARROWED and supplies its material, `lookupCapture` and
// `loadDiffByPair` answer the four that are about the corpus holding the record.
// ---------------------------------------------------------------------------

/** `${thesisId}:${recordFileHash}` — composed here, and only here. */
export function openKeyFor(thesisId: string, recordFileHash: string): string {
  return `${thesisId}:${recordFileHash}`;
}

/** The narrow client `closeDebate` needs — testable with a hand-built `tx`. */
export interface DebateTx {
  debateSession: {
    // Typed over the GENERATED input, as `pageLog.PageDecisionData` is: a column
    // renamed in the schema fails to compile here rather than drifting. The
    // UNCHECKED variant, because this writes the foreign key as a SCALAR —
    // `evidenceId`, the row the argument created or joined — and the checked one
    // accepts only the relation form.
    update(args: {
      where: { id: string };
      data: Prisma.DebateSessionUncheckedUpdateInput;
    }): Promise<unknown>;
  };
}

/**
 * Closes the debate as PROMOTED, INSIDE the caller's transaction: the evidence
 * row it created or joined, the objection it was promoted over, the moment, and
 * the key released — ONE `debateSession.update`.
 *
 * It is one act, so it is one write: a release beside a separate status update
 * is two writes to one row where the second's failure leaves the first's meaning
 * wrong. And it is inside the caller's transaction, so a rollback keeps the key
 * and the debate stays OPEN — the key is never released for a promotion that did
 * not happen.
 */
export async function closeDebate(
  tx: DebateTx,
  sessionId: string,
  outcome: { evidenceId: string; promotedOverObjection: boolean },
): Promise<void> {
  await tx.debateSession.update({
    where: { id: sessionId },
    data: {
      status: 'PROMOTED',
      evidenceId: outcome.evidenceId,
      promotedOverObjection: outcome.promotedOverObjection,
      closedAt: new Date(),
      // Released HERE, by the module that composed it. `openKey` is a String, so
      // a cleared value is a plain null — `Prisma.DbNull` is for a cleared Json
      // and would be the wrong emptiness.
      openKey: null,
    },
  });
}

// ---------------------------------------------------------------------------
// THE RECORD, AS A TOOL NAMES IT (A1) — never a row id, never a date pair.
// ---------------------------------------------------------------------------

export type NamedRecord =
  | { url: string; capture: string }
  | { url: string; before: string; after: string };

const isPair = (r: NamedRecord): r is { url: string; before: string; after: string } =>
  'before' in r;

/** What both callers need once the seven checks pass — so neither re-loads it. */
export interface RecordChecked {
  fileHash: RecordId;
  kind: 'CAPTURE' | 'DIFF';
  page: Page;
  /** The record's key on the debate and on the Evidence row — one, matching kind. */
  snapshotId: string | null;
  diffId: string | null;
  /** CURRENT(record) — defined, because AWAITING_DERIVATION already refused. */
  contentVersionHash: string;
  /**
   * The SAME `Current` this function evaluated, so a caller asking
   * `citationCurrent` hands it the real value rather than synthesizing one with a
   * `kind` the record does not have.
   */
  current: CurrentVersion;
  chunks: StoredChunk[];
  /** The head version's mention of this record, and its pin. */
  mention: { id: string; versionId: string; contentVersionHash: string | null };
  captureName: string | null;
  pair: { before: string; after: string } | null;
}

/** What `currentVersionOf` returns over a stored content version. */
export type CurrentVersion = Current<{
  contentVersionHash: string;
  beforeTextHash: string;
  afterTextHash: string;
  diffVersion: string;
  chunks: Prisma.JsonValue;
}>;

export interface RecordCheckInput {
  record: NamedRecord;
  thesisId: string;
  headVersionId: string | null;
}

/**
 * The seven checks, in the contract's order, cheapest and most local first.
 *
 * Returns the FIRST refusal rather than all of them, and that is a property of
 * the checks rather than a shortcut: they are ordered and DEPENDENT — CONTRADICTED
 * and NOTHING_TO_PROMOTE cannot be asked of a version that is AWAITING_DERIVATION,
 * and none of them can be asked of a record the corpus does not hold. "All seven"
 * is not a well-defined set.
 */
export async function recordChecks(
  input: RecordCheckInput,
): Promise<Refusal<RecordCode> | RecordChecked> {
  const { record } = input;

  const page = await loadPage(record.url);
  if (page === null) return shared.notSurveyed(record.url);

  // Every named timestamp, through ONE lookup — the same one `get_diff_input`
  // asks. NOT_A_CAPTURE for a name that is not a capture of this page at all;
  // NOT_ACQUIRED for a row the walk decided otherwise about, naming which, because
  // "a SKIPPED capture does not speak, an UNSERVABLE one holds nothing".
  const named: { role: string; value: string }[] = isPair(record)
    ? [
        { role: 'before', value: record.before },
        { role: 'after', value: record.after },
      ]
    : [{ role: 'capture', value: record.capture }];

  const resolved = [];
  for (const { role, value } of named) {
    const lookup = await lookupCapture(page, value);
    if (lookup.state === 'MALFORMED' || lookup.state === 'UNKNOWN') {
      return notACapture(page, role, value, lookup);
    }
    if (lookup.state === 'NOT_ACQUIRED') {
      return refusal(
        'NOT_ACQUIRED',
        `${role}=${value} is on this page's work-list with outcome ${lookup.outcome}, so the corpus ` +
          'holds no bytes and no text for it. A record is promoted from what the corpus holds: a ' +
          'SKIPPED capture does not speak and an UNSERVABLE one holds nothing.',
      );
    }
    resolved.push(lookup.capture);
  }

  const first = resolved.at(0);
  const second = resolved.at(1);
  if (first === undefined) {
    throw new Error('recordChecks: a named record resolved to no capture; the lookup is defective.');
  }

  const corpusRecord: CorpusRecord =
    second === undefined
      ? {
          kind: 'CAPTURE',
          url: page.url,
          capture: { waybackTimestamp: first.capture, documentHash: first.documentHash },
        }
      : {
          kind: 'DIFF',
          url: page.url,
          before: { waybackTimestamp: first.capture, documentHash: first.documentHash },
          after: { waybackTimestamp: second.capture, documentHash: second.documentHash },
        };
  const fileHash = recordId(corpusRecord);

  let diff: TimelineDiff | null = null;
  if (second !== undefined) {
    diff = await loadDiffByPair(page.id, first.capture, second.capture);
    if (diff === null) {
      return refusal(
        'NO_SUCH_DIFF',
        `${first.capture} → ${second.capture} is not a pair the walk wrote. Both captures are in the ` +
          'corpus, but a diff spans two CONSECUTIVE acquired captures; list_findings shows every ' +
          'pair this page holds.',
      );
    }
  }

  // NOT_CITED — "the citation comes first, and the argument is made on it" (§4).
  // Decided from the head version's MENTION, which is the queryable half; the
  // passage is read from the body afterwards, and a body that disagrees with the
  // mention is a malformed version rather than a refusal (services/debatePassage).
  const mention =
    input.headVersionId === null
      ? null
      : await prisma.thesisMention.findFirst({
          where: { versionId: input.headVersionId, kind: 'EVIDENCE', name: fileHash },
          select: { id: true, versionId: true, contentVersionHash: true },
        });
  if (mention === null) {
    return refusal(
      'NOT_CITED',
      input.headVersionId === null
        ? `Thesis ${input.thesisId} has no version yet, so its head cites nothing. Write the version ` +
            `that cites #ev_${fileHash}, then argue for it: the citation comes first and the argument ` +
            'is made on it.'
        : `The thesis's head version does not mention ${fileHash}. Cite the record in the text first ` +
            `(#ev_${fileHash}) and argue on that citation — there is no promotion of a record no text ` +
            'cites.',
    );
  }

  const current: CurrentVersion =
    diff === null
      ? currentVersionOf({ kind: 'CAPTURE', capture: first })
      : currentVersionOf({ kind: 'DIFF', before: diff.before, after: diff.after, versions: diff.versions });

  if (!current.defined) {
    return refusal(
      'AWAITING_DERIVATION',
      diff === null
        ? `The capture ${first.capture} has no current text version.`
        : `The diff ${pairName(diff)} has no current content version: its endpoints' text has moved ` +
            'and the walk owes a re-derivation. This is not a finding about the change — nothing has ' +
            'been derived to argue about yet. Run scan_captures on this page and open the debate again.',
    );
  }

  const chunks =
    current.kind === 'DIFF' && diff !== null ? chunksOf(current.version.chunks, pairName(diff)) : [];

  // Narrowed on `diff` rather than on `current.kind`, so the pair is in scope
  // without a non-null assertion: the two say the same thing, and only one of
  // them says it to the compiler.
  if (diff !== null) {
    const contradicted = chunks.filter((c) => c.survival === 'CONTRADICTED');
    if (contradicted.length > 0) {
      return refusal(
        'CONTRADICTED',
        `The archived documents this diff spans refute ${String(contradicted.length)} of ` +
          `${String(chunks.length)} reported chunks, so the record is evidence of a pipeline defect ` +
          `rather than of a change. What disagrees: ${contradicted
            .map((c) => `[${c.side}] ${c.text}`)
            .join(' · ')}`,
      );
    }
    if (chunks.length === 0) {
      return refusal(
        'NOTHING_TO_PROMOTE',
        `The current version of ${pairName(diff)} has no chunk on either side: the page did not ` +
          'move between these two captures under the rules in force. A diff with no change is ' +
          'evidence of nothing.',
      );
    }

    const acquired = (await loadCaptures(page.id)).map((c) => c.capture);
    const between = intervening({ before: diff.before.capture, after: diff.after.capture }, acquired);
    if (between.length > 0) {
      return refusal(
        'NARROWED',
        `The corpus now holds ${String(between.length)} capture(s) between this pair — ` +
          `${between.join(', ')} — so it is no longer the finest record of this change. A new ` +
          'citation takes what the corpus holds at its finest: cite the narrower diffs instead.',
      );
    }
  }

  return {
    fileHash,
    kind: diff === null ? 'CAPTURE' : 'DIFF',
    page,
    snapshotId: diff === null ? first.id : null,
    diffId: diff === null ? null : diff.id,
    contentVersionHash: current.contentVersionHash,
    current,
    chunks,
    mention: {
      id: mention.id,
      versionId: mention.versionId,
      contentVersionHash: mention.contentVersionHash,
    },
    captureName: diff === null ? first.capture : null,
    pair: diff === null ? null : { before: diff.before.capture, after: diff.after.capture },
  };
}

/**
 * What the assessor is handed about the record — the COMPUTED register only.
 *
 * Built here rather than inside `recordChecks` because `promote_from_debate`
 * re-runs the checks and calls no model: loading a capture's text for it would be
 * work nobody reads.
 */
export async function assessedContent(checked: RecordChecked): Promise<AssessedContent> {
  if (checked.kind === 'DIFF' && checked.pair !== null) {
    return {
      kind: 'DIFF',
      before: checked.pair.before,
      after: checked.pair.after,
      // side and text ONLY: survival is the CHECK's verdict about a chunk, not
      // part of what the chunk says, and A1 keeps it out of the version's hash
      // for the same reason.
      chunks: checked.chunks.map((c) => ({ side: c.side, text: c.text })),
    };
  }
  const snapshot =
    checked.snapshotId === null
      ? null
      : await prisma.urlSnapshot.findUnique({
          where: { id: checked.snapshotId },
          select: { text: true },
        });
  if (snapshot === null) {
    throw new Error(
      `openDebate: capture ${checked.captureName ?? '(unnamed)'} passed every check but its snapshot ` +
        'could not be loaded. The corpus cannot hold a record and not hold it.',
    );
  }
  return { kind: 'CAPTURE', capture: checked.captureName ?? '', text: snapshot.text };
}

/** The open transaction's result: the session, and whether it already existed. */
export interface OpenedDebate {
  sessionId: string;
  existed: boolean;
}

/**
 * The session for (thesis, record), opening it or recording a REVISION on the
 * OPEN one — A4's "one OPEN debate per (thesis, record); reopening returns it",
 * read as the SESSION being returned rather than the absence of a write.
 *
 * A second call with a new rationale records it: `RATIONALE_SUBMITTED` is "the
 * opening one OR A REVISION" in the event type's own words, and a rationale a
 * researcher wrote and the platform dropped is the one thing this table exists
 * not to do.
 */
export async function openOrRevise(
  input: { thesisId: string; checked: RecordChecked; rationale: string; researcherId: string },
): Promise<OpenedDebate> {
  const key = openKeyFor(input.thesisId, input.checked.fileHash);

  const existing = await prisma.debateSession.findUnique({
    where: { openKey: key },
    select: { id: true },
  });
  if (existing !== null) return reviseOn(existing.id, input.rationale);

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.debateSession.create({
        data: {
          thesisId: input.thesisId,
          researcherId: input.researcherId,
          recordFileHash: input.checked.fileHash,
          recordSnapshotId: input.checked.snapshotId,
          recordDiffId: input.checked.diffId,
          openKey: key,
          status: 'OPEN',
          hasSubstance: false,
        },
        select: { id: true },
      });
      await tx.debateEvent.createMany({
        data: [
          { sessionId: session.id, type: 'DEBATE_OPENED', content: `Opened for record ${input.checked.fileHash}` },
          { sessionId: session.id, type: 'RATIONALE_SUBMITTED', content: input.rationale },
        ],
      });
      return { sessionId: session.id, existed: false };
    }, WRITE_TRANSACTION);
  } catch (err) {
    // TWO CONCURRENT OPENS ON ONE (thesis, record). `openKey`'s uniqueness is what
    // decides the race and the loser learns of it here. Caught OUTSIDE the
    // transaction, not inside: PostgreSQL aborts a transaction at its first failed
    // statement, so a catch within the callback could only roll back.
    //
    // AND IT READS `meta.target`, NEVER THE CODE ALONE: P2002 is *a* unique
    // violation, not *this* one, and the same code from another constraint
    // swallowed into "someone else opened this debate" would be a wrong answer
    // built out of a right catch.
    if (!isOpenKeyCollision(err)) throw err;
    const raced = await prisma.debateSession.findUnique({
      where: { openKey: key },
      select: { id: true },
    });
    if (raced === null) throw err;
    return reviseOn(raced.id, input.rationale);
  }
}

/** A further rationale on a session that is already OPEN — one event, no second row. */
async function reviseOn(sessionId: string, rationale: string): Promise<OpenedDebate> {
  await prisma.debateEvent.create({
    data: { sessionId, type: 'RATIONALE_SUBMITTED', content: rationale },
  });
  return { sessionId, existed: true };
}

/** A P2002 whose target is `openKey`, and nothing else. */
function isOpenKeyCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  if (typeof target === 'string') return target.includes('openKey');
  return Array.isArray(target) && target.some((t) => typeof t === 'string' && t.includes('openKey'));
}
