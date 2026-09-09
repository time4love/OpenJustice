import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { DIFF_VERSION } from '../lib/diffVersion';
import { segments } from '../lib/claimSurvival';
import {
  chunksOf,
  loadCaptures,
  loadDiffs,
  opinionOf,
  pairName,
  type Opinion,
  type TimelineCapture,
  type TimelineDiff,
} from './corpusReads';
import {
  argued,
  currentVersionOf,
  intervening,
  movedBetween,
  needsReview,
  whereChunksWent,
  type CarriedChunk,
  type ContentUnit,
  type Moved,
} from './evidencePredicates';

// ---------------------------------------------------------------------------
// FLOW E3's LIST — docs/gf-evidence-flows.md §6, §7 and A4.
//
// "A record's content moved under an argument, and a human owes a decision …
// STOP-SHAPED, like a walk stop: a list of records owed a decision, each with
// its material, old beside new, and one command to paste. It is a READ that
// returns work, not a tool that changes anything." Nothing in this module
// writes; `test/reviews.test.ts` observes the double's write log empty after a
// call.
//
// THE COUNT IS THE FIRST FIELD, DELIBERATELY. 11b's dated record states the
// rule: an instrument whose subject set is empty is honest only when the COUNT
// precedes any verdict. `owed: 0` is an answer — "an empty list is an answer"
// (A4) — and this shape says so without the reader inferring it from an empty
// array. That matters here more than anywhere: no act in this tree creates a
// thesis, so nothing can be promoted, so against staging this read answers
// `owed: 0` TRUTHFULLY and the fixtures are the step's proof.
//
// EVERY PREDICATE IS CALLED, NEVER RE-SPELLED. NEEDS_REVIEW through
// `needsReview`, CURRENT through `currentVersionOf`, NARROWED through
// `intervening`, ARGUED through `argued`, and what moved through
// `movedBetween` / `whereChunksWent`. A second spelling of any of them is what
// the one-symbol scan exists to catch.
//
// TWO PHASES, so the cost is bounded by what is OWED. Phase 1 is one query over
// EVERY evidence row and two pure predicates in process; phase 2 — the affirmed
// version's content, the causes, the citations, the narrowing material, the
// decision sequence — runs only for the rows that are owed. A page's captures
// and diffs are loaded ONCE PER PAGE and memoised across the pass; R34 recorded
// the opposite shape as a LOW on `open_debate` and it is not repeated here.
// ---------------------------------------------------------------------------

/** The record as A1 names it — never a row id, never a date pair. */
export type NamedRecord =
  | { url: string; capture: string }
  | { url: string; before: string; after: string };

/**
 * Every route that moved CURRENT off what a human affirmed — a UNION, not a
 * branch (§3's table, read with round 1's correction).
 *
 * The three events are asked INDEPENDENTLY and the answers accumulate: a diff
 * may carry a `DIFF_VERSION` cause AND one or two endpoint causes. Treating the
 * version label as the ELSE of the endpoints would hide a differ change behind a
 * rule change whenever both happened — and §3 says a `DIFF_VERSION` move is "the
 * price of a better differ … stated here so nobody pays it by surprise", which
 * makes it exactly the one that must not be swallowed.
 */
export type Cause =
  | {
      kind: 'DECISION';
      capture: string;
      decisionId: string;
      decisionType: string;
      waybackTimestamp: string | null;
      sequence: number;
      researcherId: string;
      at: Date;
    }
  | { kind: 'EXTRACTOR'; capture: string; from: string; to: string; at: Date }
  | { kind: 'DIFF_VERSION'; from: string; to: string; at: Date }
  | { kind: 'UNREADABLE'; capture: string; reason: string };

/** One citation of the record on a HEAD or PUBLISHED version — one row per MENTION. */
export interface Citation {
  thesisId: string;
  versionId: string;
  published: boolean;
  argument: { debateSessionId: string; argued: boolean } | null;
}

/** The narrowing material — DIFF only; a CAPTURE record is never narrowed (§7). */
export interface NarrowingMaterial {
  intervening: string[];
  narrowerDiffs: {
    before: string;
    after: string;
    current: { contentVersionHash: string; chunks: ContentUnit[] } | null;
    opinion: Opinion | null;
  }[];
  carried: CarriedChunk[];
}

/** One record owed a decision. */
export interface ReviewEntry {
  kind: 'CONTENT_MOVED';
  fileHash: string;
  record: NamedRecord;
  owedSince: Date;
  decisionSequence: number;
  affirmed: { hash: string; chunks: ContentUnit[] };
  current: { hash: string; chunks: ContentUnit[] };
  moved: Moved;
  cause: Cause[];
  citedBy: Citation[];
  narrowed: NarrowingMaterial | null;
  commands: string[];
}

/**
 * A PROMOTED record that cannot be judged — named, never absent and never a
 * count (§2g).
 *
 * TWO REASON WORDS, NOT THREE. A DOCUMENT row and a diff the walk owes a version
 * for are ONE state — CURRENT is undefined — and A4 already has the word for it;
 * `detail` carries WHICH. A second code for the same state is the "one state, two
 * codes" defect step 13 spent a MEDIUM removing from `NOT_A_CAPTURE`.
 */
export interface NotEvaluable {
  fileHash: string;
  record: NamedRecord | null;
  reason: 'AWAITING_DERIVATION' | 'AFFIRMED_VERSION_MISSING';
  detail: string;
}

export interface ReviewsList {
  owed: number;
  reviews: ReviewEntry[];
  notEvaluable: NotEvaluable[];
}

const CAPTURE_SELECT = {
  id: true,
  waybackTimestamp: true,
  textHash: true,
  textExtractionVersion: true,
  trackedUrlId: true,
  trackedUrl: { select: { url: true } },
} as const;

/**
 * PHASE 1 SELECTS PROVENANCE AND NOTHING ELSE — §2h.
 *
 * "Cheap, over all PROMOTED rows: the record keys, the endpoints' current
 * textHash and textExtractionVersion, and the stored content versions — one
 * query, the shape `evidencePredicates.verified` already selects." That shape
 * carries no chunks, and it is enough: `currentVersionOf` asks three equalities
 * over the provenance columns and `needsReview` asks one over a hash. The
 * COMPUTED register — `chunks` — and the OPINION register are phase 2's, loaded
 * per OWED row by `contentOf` below, so a corpus of a thousand promoted diffs
 * does not read a thousand chunk arrays to discover that two moved.
 */
const VERSION_SELECT = {
  contentVersionHash: true,
  beforeTextHash: true,
  afterTextHash: true,
  diffVersion: true,
  derivedAt: true,
} as const;

interface LoadedCapture {
  id: string;
  waybackTimestamp: string | null;
  textHash: string;
  textExtractionVersion: string;
  trackedUrlId: string;
  trackedUrl: { url: string };
}

interface LoadedVersion {
  contentVersionHash: string;
  beforeTextHash: string;
  afterTextHash: string;
  diffVersion: string;
  derivedAt: Date;
}

interface LoadedRow {
  fileHash: string;
  kind: string;
  affirmedContentVersionHash: string;
  status: string;
  snapshot: LoadedCapture | null;
  urlVersionDiff: {
    id: string;
    trackedUrlId: string;
    trackedUrl: { url: string };
    beforeSnapshot: LoadedCapture;
    afterSnapshot: LoadedCapture;
    contentVersions: LoadedVersion[];
  } | null;
}

/**
 * Every record owed a review, oldest first, with what cannot be judged named
 * beside them.
 *
 * EVERY EVIDENCE ROW IS LOADED, INCLUDING THE ONES THAT CANNOT BE JUDGED. The
 * status is decided by `needsReview` and not by the query, so a WITHDRAWN row is
 * absent because THE PREDICATE says it is owed nothing — not because a `where`
 * clause hid it — and a DOCUMENT row reaches `notEvaluable` under the same word
 * both surfaces use for it rather than being filtered out in silence (§0c's
 * rule, and the silent-filter rule generally).
 */
export async function listEvidenceReviews(): Promise<ReviewsList> {
  const rows: LoadedRow[] = await prisma.evidence.findMany({
    select: {
      fileHash: true,
      kind: true,
      status: true,
      affirmedContentVersionHash: true,
      snapshot: { select: CAPTURE_SELECT },
      urlVersionDiff: {
        select: {
          id: true,
          trackedUrlId: true,
          trackedUrl: { select: { url: true } },
          beforeSnapshot: { select: CAPTURE_SELECT },
          afterSnapshot: { select: CAPTURE_SELECT },
          contentVersions: { select: VERSION_SELECT },
        },
      },
    },
  });

  const reviews: ReviewEntry[] = [];
  const notEvaluable: NotEvaluable[] = [];
  const pages = new PageCache();

  for (const row of rows) {
    const owed = await evaluate(row, pages);
    if (owed === null) continue;
    if ('reason' in owed) notEvaluable.push(owed);
    else reviews.push(owed);
  }

  // OLDEST FIRST, BY A KEY THE READER CAN SEE (§2e). A4 says "oldest first" and
  // names no field; ordering by `promotedAt` would sort by when the SELECTION
  // was made, and what is owed longest is what MOVED longest ago.
  reviews.sort((a, b) => a.owedSince.getTime() - b.owedSince.getTime());
  return { owed: reviews.length, reviews, notEvaluable };
}

/** A page's captures and diffs, loaded ONCE per page for the whole pass. */
class PageCache {
  private readonly captures = new Map<string, Promise<TimelineCapture[]>>();
  private readonly diffs = new Map<string, Promise<TimelineDiff[]>>();

  async capturesOf(pageId: string): Promise<TimelineCapture[]> {
    const held = this.captures.get(pageId) ?? loadCaptures(pageId);
    this.captures.set(pageId, held);
    return held;
  }

  async diffsOf(pageId: string): Promise<TimelineDiff[]> {
    const held = this.diffs.get(pageId) ?? loadDiffs(pageId);
    this.diffs.set(pageId, held);
    return held;
  }
}

/** One row: the entry it owes, the reason it cannot be judged, or nothing at all. */
async function evaluate(row: LoadedRow, pages: PageCache): Promise<ReviewEntry | NotEvaluable | null> {
  const capture = row.snapshot;
  const diff = row.urlVersionDiff;

  // A DOCUMENT row: one state, one word, on both surfaces (§3a). It cannot be
  // created by anything in this tree — there is no `Document` table until
  // document step 28 — and the code still may not step over one in silence.
  if (capture === null && diff === null) {
    return {
      fileHash: row.fileHash,
      record: null,
      reason: 'AWAITING_DERIVATION',
      detail:
        'This record is a DOCUMENT: its content is derived from bytes the platform holds, and the ' +
        'class — its table, its extractor and its custody modes — is document refactor step 28. ' +
        'There is no version to judge yet.',
    };
  }

  const record: NamedRecord =
    diff === null
      ? { url: requireCapture(capture).trackedUrl.url, capture: nameOf(capture) }
      : { url: diff.trackedUrl.url, before: nameOf(diff.beforeSnapshot), after: nameOf(diff.afterSnapshot) };

  const current =
    diff === null
      ? currentVersionOf({ kind: 'CAPTURE', capture: requireCapture(capture) })
      : currentVersionOf({
          kind: 'DIFF',
          before: diff.beforeSnapshot,
          after: diff.afterSnapshot,
          versions: diff.contentVersions,
        });

  // AWAITING IS NOT REVIEW (A3 :1029): "the human is not asked to judge a version
  // that does not exist". The row is still NAMED — a count would tell a
  // researcher that something is missing and not which record, and the act it
  // should prompt is a re-walk of that page.
  const owedNow = needsReview(row, current);
  if (!owedNow.evaluable) {
    return {
      fileHash: row.fileHash,
      record,
      reason: 'AWAITING_DERIVATION',
      detail:
        `The walk owes a re-derivation of ${diff === null ? nameOf(capture) : pairOf(record)}: its ` +
        "endpoints' text has moved and no content version was derived under the current DIFF_VERSION. " +
        'Run scan_captures on this page.',
    };
  }
  if (!owedNow.value) return null;
  if (!current.defined) return null; // unreachable: `needsReview` evaluated

  return diff === null
    ? entryForCapture(row, record, requireCapture(capture), current.contentVersionHash)
    : entryForDiff(row, record, diff, current.contentVersionHash, pages);
}

/** A capture the archive named — the only kind that can key a CAPTURE or a DIFF record. */
interface NamedCapture extends LoadedCapture {
  waybackTimestamp: string;
}

function isNamed(capture: LoadedCapture | null): capture is NamedCapture {
  return capture !== null && capture.waybackTimestamp !== null;
}

/**
 * The capture a record is keyed to, or a LOUD FAILURE.
 *
 * A capture without a `waybackTimestamp` has no CAPTURE_ID (A1) and what a
 * researcher holds of such a page is a DOCUMENT. A row keyed to one is malformed,
 * which `forensics:audit-evidence` reports — and a THROW rather than a silent
 * filter, because a subject quietly dropped from this pass is a review reported
 * as not owed.
 */
function requireCapture(capture: LoadedCapture | null): NamedCapture {
  if (!isNamed(capture)) {
    throw new Error(
      'evidenceReviews: a record is keyed to a capture with no waybackTimestamp. A capture without ' +
        'one has no CAPTURE_ID (evidence A1); this is a malformed row, which forensics:audit-evidence ' +
        'reports.',
    );
  }
  return capture;
}

/** The capture's name, through the one guard. */
const nameOf = (capture: LoadedCapture | null): string => requireCapture(capture).waybackTimestamp;

function pairOf(record: NamedRecord): string {
  return 'before' in record ? `${record.before} → ${record.after}` : record.capture;
}

// ---------------------------------------------------------------------------
// A CAPTURE'S ENTRY — its chunks are SEGMENTS, through the ONE spelling.
// ---------------------------------------------------------------------------

/**
 * §6's own word for what a review shows is "the segments that entered or left",
 * and §3 makes a capture's computed register its text under the rules and the
 * extractor. So a capture's units are `lib/claimSurvival.segments` — IMPORTED,
 * never re-spelled, because "`extractionDrift` compares the same kind of text and
 * the two checks must agree about what a segment IS". No `side` (a capture's text
 * has no sides) and no `survival` (survival is a verdict about a DIFF's chunk,
 * and A1 keeps it out of the version's hash).
 */
const asSegments = (text: string): ContentUnit[] => segments(text).map((t) => ({ text: t }));

async function entryForCapture(
  row: LoadedRow,
  record: NamedRecord,
  capture: LoadedCapture,
  currentHash: string,
): Promise<ReviewEntry | NotEvaluable> {
  const affirmed = await prisma.textVersion.findUnique({
    where: { snapshotId_textHash: { snapshotId: capture.id, textHash: row.affirmedContentVersionHash } },
    select: {
      text: true,
      textExtractionVersion: true,
      supersededAt: true,
      supersededByDecisionId: true,
      supersededByDecision: {
        select: {
          id: true,
          type: true,
          waybackTimestamp: true,
          sequence: true,
          researcherId: true,
          createdAt: true,
        },
      },
    },
  });
  if (affirmed === null) {
    return {
      fileHash: row.fileHash,
      record,
      reason: 'AFFIRMED_VERSION_MISSING',
      detail:
        `The version a human affirmed (${row.affirmedContentVersionHash}) is not among the text ` +
        `versions of capture ${nameOf(capture)}. The row cannot be judged old-beside-new; ` +
        'forensics:audit-evidence names this state.',
    };
  }

  const snapshot = await prisma.urlSnapshot.findUnique({
    where: { id: capture.id },
    select: { text: true },
  });
  if (snapshot === null) {
    throw new Error(
      `evidenceReviews: capture ${nameOf(capture)} is keyed by an evidence row and could not be ` +
        'loaded. The corpus cannot hold a record and not hold it.',
    );
  }

  const cause = captureCause(nameOf(capture), affirmed, capture.textExtractionVersion);
  const affirmedUnits = asSegments(affirmed.text);
  const currentUnits = asSegments(snapshot.text);
  const decisionSequence = await decisionSequenceOf(row.fileHash);

  return {
    kind: 'CONTENT_MOVED',
    fileHash: row.fileHash,
    record,
    // A capture's affirmed version stopped being current AT `supersededAt` —
    // which is the definition of `owedSince` (§2e), available whether or not the
    // cause can be explained.
    owedSince: newestMoment(cause) ?? affirmed.supersededAt,
    decisionSequence,
    affirmed: { hash: row.affirmedContentVersionHash, chunks: affirmedUnits },
    current: { hash: currentHash, chunks: currentUnits },
    moved: movedBetween(affirmedUnits, currentUnits),
    cause,
    citedBy: await citationsOf(row.fileHash),
    // "A CAPTURE record is never narrowed" (§7), so the field is null BY
    // CONSTRUCTION rather than by an unasked question.
    narrowed: null,
    commands: commandsFor(row.fileHash, decisionSequence),
  };
}

/** The one route a capture has, and at most one cause (§2c). */
function captureCause(
  capture: string,
  affirmed: {
    textExtractionVersion: string;
    supersededAt: Date;
    supersededByDecisionId: string | null;
    supersededByDecision: {
      id: string;
      type: string;
      waybackTimestamp: string | null;
      sequence: number;
      researcherId: string;
      createdAt: Date;
    } | null;
  },
  currentExtractor: string,
): Cause[] {
  // A CAUSE THAT CANNOT BE READ IS A FOURTH KIND, AND THE ENTRY STAYS (§2c).
  // "The record's CURRENT has moved off what a human affirmed whether or not the
  // platform can explain why", so withholding the entry would drop a real
  // obligation for a missing explanation.
  if (affirmed.supersededByDecisionId !== null) {
    const decision = affirmed.supersededByDecision;
    if (decision === null) {
      return [
        {
          kind: 'UNREADABLE',
          capture,
          reason:
            `The kept version names decision ${affirmed.supersededByDecisionId}, which the page's ` +
            'log does not hold. The review is still owed: what moved is computed, and why it moved ' +
            'is unexplained.',
        },
      ];
    }
    return [
      {
        kind: 'DECISION',
        capture,
        decisionId: decision.id,
        decisionType: decision.type,
        waybackTimestamp: decision.waybackTimestamp,
        sequence: decision.sequence,
        researcherId: decision.researcherId,
        at: decision.createdAt,
      },
    ];
  }
  // NULL IS MEANINGFUL, NOT MISSING: flows A2 :909–911 (ruled 2026-09-06, Q4)
  // makes a null `supersededByDecisionId` a supersession the RULES had no part
  // in — a new extractor moved the text.
  return [
    {
      kind: 'EXTRACTOR',
      capture,
      from: affirmed.textExtractionVersion,
      to: currentExtractor,
      at: affirmed.supersededAt,
    },
  ];
}

// ---------------------------------------------------------------------------
// A DIFF'S ENTRY — the version label and each endpoint, asked INDEPENDENTLY.
// ---------------------------------------------------------------------------

async function entryForDiff(
  row: LoadedRow,
  record: NamedRecord,
  diff: NonNullable<LoadedRow['urlVersionDiff']>,
  currentHash: string,
  pages: PageCache,
): Promise<ReviewEntry | NotEvaluable> {
  const name = pairOf(record);
  const affirmed = diff.contentVersions.find(
    (v) => v.contentVersionHash === row.affirmedContentVersionHash,
  );
  if (affirmed === undefined) {
    return {
      fileHash: row.fileHash,
      record,
      reason: 'AFFIRMED_VERSION_MISSING',
      detail:
        `The version a human affirmed (${row.affirmedContentVersionHash}) is not among the content ` +
        `versions of ${name}. The row cannot be judged old-beside-new; forensics:audit-evidence ` +
        'names this state.',
    };
  }
  const current = diff.contentVersions.find((v) => v.contentVersionHash === currentHash);
  if (current === undefined) {
    throw new Error(
      `evidenceReviews: CURRENT resolved to ${currentHash} for ${name} and the version is not among ` +
        'the ones loaded. `currentVersionOf` chose it from this very list.',
    );
  }

  const cause: Cause[] = [];
  // 1. THE VERSION LABEL, ASKED ON ITS OWN — different means a DIFF_VERSION
  //    cause WHATEVER THE ENDPOINTS DID. §3: "every CITED DIFF enters review —
  //    the price of a better differ, paid by a human once per record, and stated
  //    here so nobody pays it by surprise."
  if (affirmed.diffVersion !== DIFF_VERSION) {
    cause.push({
      kind: 'DIFF_VERSION',
      from: affirmed.diffVersion,
      to: DIFF_VERSION,
      at: current.derivedAt,
    });
  }
  // 2. EACH ENDPOINT, ASKED ON ITS OWN, in pair order: before, then after.
  for (const side of [
    { snapshot: diff.beforeSnapshot, affirmedHash: affirmed.beforeTextHash },
    { snapshot: diff.afterSnapshot, affirmedHash: affirmed.afterTextHash },
  ]) {
    if (side.affirmedHash === side.snapshot.textHash) continue;
    cause.push(...(await endpointCause(side.snapshot, side.affirmedHash)));
  }

  // PHASE 2, AND ONLY NOW: the computed register of the two versions this entry
  // shows, for THIS record. One query for both.
  const content = await contentOf(diff.id, [affirmed.contentVersionHash, current.contentVersionHash]);
  const affirmedUnits = asDiffUnits(chunksOf(content.get(affirmed.contentVersionHash) ?? null, name));
  const currentUnits = asDiffUnits(chunksOf(content.get(current.contentVersionHash) ?? null, name));
  const decisionSequence = await decisionSequenceOf(row.fileHash);

  return {
    kind: 'CONTENT_MOVED',
    fileHash: row.fileHash,
    record,
    // Where every cause is UNREADABLE — or the only cause is the version label —
    // `owedSince` falls back to the CURRENT version's `derivedAt`: the moment the
    // new derivation arrived is the moment CURRENT moved (§2e).
    owedSince: newestMoment(cause) ?? current.derivedAt,
    decisionSequence,
    affirmed: { hash: row.affirmedContentVersionHash, chunks: affirmedUnits },
    current: { hash: currentHash, chunks: currentUnits },
    moved: movedBetween(affirmedUnits, currentUnits),
    cause,
    citedBy: await citationsOf(row.fileHash),
    narrowed: await narrowingFor(diff, record, currentUnits, pages),
    commands: commandsFor(row.fileHash, decisionSequence),
  };
}

/**
 * A diff's units are its STORED chunks, AS WRITTEN — side, text and survival.
 *
 * §2a's table: "DIFF unit = { side, text, survival } — the stored
 * DiffContentVersion.chunks, as written". The "no survival" clause of that table
 * is under its CAPTURE row and explains why a SEGMENT has none; a diff's unit
 * carries the verdict the walk wrote on it.
 *
 * It changes no comparison — `contains` reads side and text alone — and it is
 * the material a decision rests on: a CONTRADICTED chunk in the CURRENT version
 * is what E1 refuses a fresh promotion for (evidence §5), so a reviewer deciding
 * REAFFIRM or WITHDRAW must see it without a second read.
 */
const asDiffUnits = (chunks: { side: string; text: string; survival: string }[]): ContentUnit[] =>
  chunks.map((c) => ({ side: c.side, text: c.text, survival: c.survival }));

/**
 * The stored chunks of named versions of one diff — phase 2's read.
 *
 * Keyed by `contentVersionHash` so the caller asks for the two it shows and gets
 * exactly those; a version the query does not return reaches `chunksOf` as null,
 * which is its own documented answer (no chunks) rather than a crash.
 */
async function contentOf(
  diffId: string,
  hashes: readonly string[],
): Promise<Map<string, Prisma.JsonValue>> {
  const rows = await prisma.diffContentVersion.findMany({
    where: { diffId, contentVersionHash: { in: [...hashes] } },
    select: { contentVersionHash: true, chunks: true },
  });
  return new Map(rows.map((r) => [r.contentVersionHash, r.chunks]));
}

/** One endpoint's route: the DECISION, the EXTRACTOR, or UNREADABLE (§2c). */
async function endpointCause(snapshot: LoadedCapture, affirmedHash: string): Promise<Cause[]> {
  const capture = nameOf(snapshot);
  const kept = await prisma.textVersion.findUnique({
    where: { snapshotId_textHash: { snapshotId: snapshot.id, textHash: affirmedHash } },
    select: {
      textExtractionVersion: true,
      supersededAt: true,
      supersededByDecisionId: true,
      supersededByDecision: {
        select: {
          id: true,
          type: true,
          waybackTimestamp: true,
          sequence: true,
          researcherId: true,
          createdAt: true,
        },
      },
    },
  });
  if (kept === null) {
    return [
      {
        kind: 'UNREADABLE',
        capture,
        reason:
          `This endpoint's text moved off ${affirmedHash}, and no kept text version of the capture ` +
          'holds that hash. What moved is computed from the versions themselves; why it moved ' +
          'cannot be read. The review is still owed.',
      },
    ];
  }
  return captureCause(capture, kept, snapshot.textExtractionVersion);
}

/** The newest moment among the causes that carry one, or none at all. */
function newestMoment(causes: readonly Cause[]): Date | null {
  const moments = causes.flatMap((c) => ('at' in c ? [c.at] : []));
  return moments.reduce<Date | null>(
    (newest, at) => (newest === null || at > newest ? at : newest),
    null,
  );
}

// ---------------------------------------------------------------------------
// THE MATERIAL A REVIEWER READS BESIDE THE TWO VERSIONS.
// ---------------------------------------------------------------------------

/** The record's LATEST review decision sequence — 0 when it has never been reviewed. */
async function decisionSequenceOf(fileHash: string): Promise<number> {
  const last = await prisma.evidenceDecision.findFirst({
    where: { fileHash },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });
  return last?.sequence ?? 0;
}

/**
 * The citations — ONE ROW PER MENTION on a HEAD or PUBLISHED version (§2d).
 *
 * §6's own words: "every thesis whose head or published version mentions it, each
 * with its argument and whether it is published". WHERE HEAD AND PUBLISHED BOTH
 * CITE, THERE ARE TWO ROWS FOR ONE THESIS, and that is the point: T2/T3 make the
 * argument travel with `(name, pin)`, so a published citation can be ARGUED while
 * the same thesis's re-pinned draft citation is not. Collapsing them to one entry
 * per thesis would hide exactly the fact a reviewer needs — which of the author's
 * two texts still stands behind this record.
 *
 * NOT `corpusReads.loadEvidenceLinkage`. That loader answers a PUBLIC read and
 * returns PUBLISHED citations only, because "the corpus read never reveals
 * unpublished work, so it has no second behaviour by identity" (§5). This list is
 * GATED working state and must show a DRAFT's citation — precisely the one a
 * REAFFIRM protects. Two loaders, two questions, declared.
 */
async function citationsOf(fileHash: string): Promise<Citation[]> {
  const mentions = await prisma.thesisMention.findMany({
    where: {
      type: 'EVIDENCE',
      refId: fileHash,
      // The PIN itself decides, rather than a status anyone could set separately:
      // `isHead` and `isPublished` are the back-relations of the two pointers.
      thesisVersion: { OR: [{ isHead: { isNot: null } }, { isPublished: { isNot: null } }] },
    },
    select: {
      refId: true,
      debateSessionId: true,
      thesisVersion: {
        select: { id: true, thesisId: true, isPublished: { select: { id: true } } },
      },
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true } },
    },
  });

  return mentions.map((m) => ({
    thesisId: m.thesisVersion.thesisId,
    versionId: m.thesisVersion.id,
    published: m.thesisVersion.isPublished !== null,
    argument:
      m.debateSessionId === null
        ? null
        : {
            debateSessionId: m.debateSessionId,
            // CALLED, never re-spelled — the three-clause predicate step 13 built.
            argued: argued({
              name: m.refId,
              thesisId: m.thesisVersion.thesisId,
              debate: m.debateSession,
            }),
          },
  }));
}

/**
 * The narrowing material — the intervening captures, the narrower diffs, and
 * WHERE EVERY WIDE CHUNK WENT (§7, §2i).
 *
 * `intervening` is CALLED — the same predicate `open_debate` refuses NARROWED
 * with. `carried` is `whereChunksWent` verbatim: one row per chunk of the WIDE
 * record's CURRENT version, in its order, so that *went nowhere* is a reportable
 * answer rather than a silent absence. The opinion is LABELLED and never mixed
 * with the computed chunks (A7's `opinions-not-facts`).
 */
async function narrowingFor(
  diff: NonNullable<LoadedRow['urlVersionDiff']>,
  record: NamedRecord,
  wideUnits: ContentUnit[],
  pages: PageCache,
): Promise<NarrowingMaterial | null> {
  if (!('before' in record)) return null;
  const acquired = (await pages.capturesOf(diff.trackedUrlId)).map((c) => c.capture);
  const between = intervening({ before: record.before, after: record.after }, acquired);
  if (between.length === 0) return null;

  const narrower = (await pages.diffsOf(diff.trackedUrlId)).filter(
    (d) =>
      d.before.capture >= record.before &&
      d.after.capture <= record.after &&
      !(d.before.capture === record.before && d.after.capture === record.after),
  );

  const narrowerDiffs = narrower.map((d) => {
    const current = currentVersionOf({
      kind: 'DIFF',
      before: d.before,
      after: d.after,
      versions: d.versions,
    });
    const version = current.defined && current.kind === 'DIFF' ? current.version : null;
    return {
      before: d.before.capture,
      after: d.after.capture,
      current:
        version === null
          ? null
          : {
              contentVersionHash: version.contentVersionHash,
              chunks: asDiffUnits(chunksOf(version.chunks, pairName(d))),
            },
      opinion: version === null ? null : opinionOf(version.classification, pairName(d)),
    };
  });

  return {
    intervening: between,
    narrowerDiffs,
    carried: whereChunksWent(
      wideUnits,
      narrowerDiffs.map((d) => ({
        before: d.before,
        after: d.after,
        units: d.current?.chunks ?? [],
      })),
    ),
  };
}

/**
 * THE TWO COMMANDS, AND THEY PASTE AS WRITTEN (§2f, RULED 2026-09-09).
 *
 * Each embeds the entry's own `decisionSequence` as `expectedSequence`. A
 * compare-and-set whose expected value the caller cannot obtain is a parameter
 * nobody can supply correctly, and a command that does not paste as written is a
 * command the researcher has to complete by hand. The writer inserts `last + 1`
 * from its own read; this number is what it compares against.
 */
function commandsFor(fileHash: string, decisionSequence: number): string[] {
  const at = `expectedSequence=${String(decisionSequence)}`;
  return [
    `review_evidence fileHash=${fileHash} decision=REAFFIRM ${at}`,
    `review_evidence fileHash=${fileHash} decision=WITHDRAW reason=… ${at}`,
  ];
}
