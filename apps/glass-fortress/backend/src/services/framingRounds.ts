import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asJsonColumn } from '../lib/jsonColumn';
import { recordId, type Record as CorpusRecord } from '../lib/evidenceIdentity';
import { chunksOf, loadDiffByPair, loadPage, lookupCapture, pairName } from './corpusReads';
import { currentVersionOf } from './evidencePredicates';
import { resolveTrajectoryCitations } from './trajectoryCitation';
import type { AssessedRecord, AssessedTrajectory } from './framingAssessor';
import { refusal, type Refusal } from '../mcp/tools/thesisRefusals';

// ---------------------------------------------------------------------------
// THE FRAMING'S ROUNDS, AND WHAT THE ASSESSOR IS HANDED — thesis T1, A2 :1295–:1311.
//
// NOT `services/thesisFraming` — that path is RETIRED
// (`test/walk/retiredNames.test.ts` RETIRED_THESIS_MODULES), and no `src` file may
// import it. This module is the successor by function, not by name.
//
// A FRAMING HAS NO STATUS AND NOTHING CLOSES IT (A2 :1300). Its rounds are
// APPEND-ONLY and ordered by `sequence`, never by `createdAt`: rows written in one
// transaction share `now()` (interaction A3 :927), so time cannot order them.
// ---------------------------------------------------------------------------

/** A record as a tool names it (evidence A1) — never a row id, never a date pair. */
export type NamedRecord =
  | { url: string; capture: string }
  | { url: string; before: string; after: string };

const isPair = (r: NamedRecord): r is { url: string; before: string; after: string } => 'before' in r;

/** A round, as `get_framing` and the audit read it. */
export interface Round {
  id: string;
  sequence: number;
  type: string;
  content: Prisma.JsonValue;
  researcherId: string;
  createdAt: Date;
}

export interface LoadedFraming {
  id: string;
  question: string;
  provision: string | null;
  researcherId: string;
  thesisId: string | null;
  createdAt: Date;
}

export async function loadFraming(framingId: string): Promise<LoadedFraming | null> {
  return prisma.framing.findUnique({
    where: { id: framingId },
    select: { id: true, question: true, provision: true, researcherId: true, thesisId: true, createdAt: true },
  });
}

/**
 * Every round of a framing, in SEQUENCE order.
 *
 * Sorted HERE rather than by the query, so the one read serves both the audit's
 * prior turns and `get_framing`'s answer, and so the double needs no `orderBy` it
 * does not model (`test/helpers/evidenceDouble.ts`' `appendOnly.findMany` honours
 * equality only).
 */
export async function roundsOf(framingId: string): Promise<Round[]> {
  const rows = await prisma.framingRound.findMany({ where: { framingId } });
  return [...rows].sort((a, b) => a.sequence - b.sequence);
}

/**
 * Append one round, and let the UNIQUE INDEX decide a race.
 *
 * `FramingRound @@unique([framingId, sequence])`. Under PostgreSQL's default READ
 * COMMITTED two concurrent calls each read the same highest sequence and each
 * insert the next one, IN OR OUT OF A TRANSACTION — so a transaction would buy
 * nothing here and none is opened. The index decides it and the loser recomputes,
 * ONCE. That mirrors `services/openDebate.ts`' `openKey` collision, including the
 * discipline that matters there: the error is identified by `meta.target`, never
 * by the code alone, because "P2002 is A unique violation, not THIS one".
 *
 * IT NEVER BECOMES A REFUSAL. A4 gives these tools closed sets with no race word,
 * and `test/thesis/tools.ts`' code-set equality would redden an invented one. The
 * design's own sentence on concurrency (§9 :1008–:1011) names STALE_HEAD and
 * STALE_SEQUENCE and calls no framing round a decision log; the framing tools carry
 * no `expectedSequence`, unlike `decide_gap` (A4 :1488–:1493). So this retry is the
 * builder's, declared, and held by the case that asserts the paid call is drawn
 * exactly once ACROSS it.
 */
export async function appendRound(input: {
  framingId: string;
  type: 'PROPOSED' | 'ASSESSED' | 'CHOSEN';
  /**
   * `unknown`, crossed into the column by `lib/jsonColumn`'s one helper. Prisma's
   * `InputJsonValue` refuses a named interface — a type with a name has no index
   * signature — and the round trip through JSON is the honest version of the cast
   * every writer otherwise reaches for: it PRODUCES the JSON the column will hold.
   */
  content: unknown;
  researcherId: string;
}): Promise<Round> {
  try {
    return await createAt(input, await nextSequence(input.framingId));
  } catch (err) {
    if (!isSequenceCollision(err)) throw err;
    return createAt(input, await nextSequence(input.framingId));
  }
}

async function nextSequence(framingId: string): Promise<number> {
  const rounds = await roundsOf(framingId);
  return (rounds.at(-1)?.sequence ?? 0) + 1;
}

async function createAt(
  input: { framingId: string; type: 'PROPOSED' | 'ASSESSED' | 'CHOSEN'; content: unknown; researcherId: string },
  sequence: number,
): Promise<Round> {
  return prisma.framingRound.create({
    data: {
      framingId: input.framingId,
      sequence,
      type: input.type,
      content: asJsonColumn(input.content),
      researcherId: input.researcherId,
    },
  });
}

/** A P2002 whose target is the round's (framingId, sequence) index, and nothing else. */
function isSequenceCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const names = typeof target === 'string' ? [target] : Array.isArray(target) ? target : [];
  return names.some((t) => typeof t === 'string' && t.includes('sequence'));
}

// ---------------------------------------------------------------------------
// WHAT THE ASSESSOR IS HANDED — the COMPUTED register, and only that (T1 :226–:231).
// ---------------------------------------------------------------------------

/**
 * Every named record, loaded with its CURRENT content and LABELLED — or the first
 * refusal, in A4's order.
 *
 * The refusals are ORDERED AND DEPENDENT, as `openDebate.ts`' seven are: a record
 * the corpus does not hold cannot be asked whether it is ACQUIRED, and one that is
 * not ACQUIRED has no content version to be AWAITING. "All of them" is not a
 * well-defined set, so the first is returned.
 *
 * IT DOES NOT REUSE `recordChecks`. That function refuses NOT_CITED on the head
 * version's mention, and a framing has no thesis and no citation — T1 :318–:322: a
 * framing exists before any thesis does.
 */
export async function loadRecords(
  records: readonly NamedRecord[],
): Promise<Refusal | AssessedRecord[]> {
  const loaded: AssessedRecord[] = [];

  for (const [index, record] of records.entries()) {
    const label = `[${String(index + 1)}]`;
    const page = await loadPage(record.url);
    if (page === null) {
      return refusal(
        'NOT_A_RECORD',
        `${record.url} is not in the corpus, so it names no record. Survey it first: ` +
          `survey_wayback_captures url=${record.url}`,
      );
    }

    const named = isPair(record)
      ? [
          { role: 'before', value: record.before },
          { role: 'after', value: record.after },
        ]
      : [{ role: 'capture', value: record.capture }];

    const resolved = [];
    for (const { role, value } of named) {
      const lookup = await lookupCapture(page, value);
      if (lookup.state === 'MALFORMED' || lookup.state === 'UNKNOWN') {
        return refusal(
          'NOT_A_RECORD',
          `${role}=${value} is not a capture of ${page.url} that the corpus holds. A record is named ` +
            'by its page and one or two 14-digit wayback timestamps; list_findings shows what the ' +
            'page holds.',
        );
      }
      if (lookup.state === 'NOT_ACQUIRED') {
        return refusal(
          'NOT_ACQUIRED',
          `${role}=${value} is on this page's work-list with outcome ${lookup.outcome}, so the corpus ` +
            'holds no bytes and no text for it. A SKIPPED capture does not speak and an UNSERVABLE ' +
            'one holds nothing.',
        );
      }
      resolved.push(lookup.capture);
    }

    const first = resolved.at(0);
    const second = resolved.at(1);
    if (first === undefined) {
      throw new Error('loadRecords: a named record resolved to no capture; the lookup is defective.');
    }

    if (second === undefined) {
      const current = currentVersionOf({ kind: 'CAPTURE', capture: first });
      if (!current.defined) {
        return refusal('AWAITING_DERIVATION', `The capture ${first.capture} has no current text version.`);
      }
      const snapshot = await prisma.urlSnapshot.findUnique({
        where: { id: first.id },
        select: { text: true },
      });
      if (snapshot === null) {
        throw new Error(
          `loadRecords: capture ${first.capture} passed every check but its snapshot could not be ` +
            'loaded. The corpus cannot hold a record and not hold it.',
        );
      }
      loaded.push({ label, kind: 'CAPTURE', url: page.url, capture: first.capture, text: snapshot.text });
      continue;
    }

    const diff = await loadDiffByPair(page.id, first.capture, second.capture);
    if (diff === null) {
      return refusal(
        'NOT_A_RECORD',
        `${first.capture} → ${second.capture} is not a pair the walk wrote. Both captures are in the ` +
          'corpus, but a diff spans two CONSECUTIVE acquired captures; list_findings shows every pair ' +
          'this page holds.',
      );
    }
    const current = currentVersionOf({
      kind: 'DIFF',
      before: diff.before,
      after: diff.after,
      versions: diff.versions,
    });
    // Narrowed on `kind` as well as on `defined`, so `version` is in scope without
    // a non-null assertion: for a DIFF input the two say the same thing, and only
    // one of them says it to the compiler (`services/openDebate.ts`' own reason).
    if (!current.defined || current.kind !== 'DIFF') {
      // NAMES THE DIFF (A4 :1422–:1423) — by the page and the pair's two
      // timestamps, which is how evidence A1 :890–:891 names a DIFF record.
      return refusal(
        'AWAITING_DERIVATION',
        `The diff ${pairName(diff)} of ${page.url} has no current content version: its endpoints' ` +
          'text has moved and the walk owes a re-derivation. Nothing has been derived to frame ' +
          'against yet — run scan_captures on this page and assess the framing again.',
      );
    }
    loaded.push({
      label,
      kind: 'DIFF',
      url: page.url,
      before: diff.before.capture,
      after: diff.after.capture,
      // side and text ONLY: survival is the CHECK's verdict ABOUT a chunk, not
      // part of what the chunk says, and evidence A1 :911 keeps it out of the
      // content version's hash for the same reason.
      chunks: chunksOf(current.version.chunks, pairName(diff)).map((c) => ({ side: c.side, text: c.text })),
    });
  }

  return loaded;
}

/** The record's name as evidence A1 gives it — used by the round's stored element map. */
export function nameOf(record: AssessedRecord, documentHashes: { before: string; after?: string }): string {
  const corpus: CorpusRecord =
    record.kind === 'CAPTURE'
      ? { kind: 'CAPTURE', url: record.url, capture: { waybackTimestamp: record.capture, documentHash: documentHashes.before } }
      : {
          kind: 'DIFF',
          url: record.url,
          before: { waybackTimestamp: record.before, documentHash: documentHashes.before },
          after: { waybackTimestamp: record.after, documentHash: documentHashes.after ?? '' },
        };
  return recordId(corpus);
}

/**
 * Every cited trajectory, through THE ONE RESOLVER — or UNKNOWN_TRAJECTORY_ID
 * naming the ids no detection pass stored.
 */
export async function loadTrajectories(
  ids: readonly string[],
): Promise<Refusal | AssessedTrajectory[]> {
  if (ids.length === 0) return [];
  const { resolved, missing } = await resolveTrajectoryCitations(ids);
  if (missing.length > 0) {
    return refusal(
      'UNKNOWN_TRAJECTORY_ID',
      `No detection pass stored ${missing.join(', ')}. A trajectory is cited by the id ` +
        'get_claim_trajectories returned, never by a claim hash.',
    );
  }
  return resolved.map((t) => ({
    id: t.id,
    claimText: t.claimText,
    firstSeen: t.firstSeen,
    lastSeen: t.lastSeen,
    finalState: t.finalState,
    transitions: t.transitions,
  }));
}
