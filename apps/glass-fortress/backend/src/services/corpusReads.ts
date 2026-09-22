import { z } from 'zod';
import { Prisma } from '@prisma/client';
import type { ChunkSide } from '../lib/diffChunking';
import { prisma } from '../lib/prisma';
import { recordId, isWaybackTimestamp, type RecordId } from '../lib/evidenceIdentity';
import { phrasePresent } from '../lib/htmlText';
import { flaggedByClassifier } from '../lib/investigativeCategories';
import type { ComputeResult, ChangeSpan, TrajectoryGroup } from './claimTrajectory';
import { CLASSIFICATION_KEYS } from './recordDiff';
// TYPE-ONLY, and it must stay that way: `evidenceReviews` imports THIS module for its loaders, so a value
// import here would close a runtime cycle. A type import is erased.
import type { NamedRecord } from './evidenceReviews';
import {
  currentVersionOf,
  narrowed,
  publicPage,
  recomputable,
  storedAttributionFor,
  type ContentVersionProvenance,
  type StoredAttribution,
} from './evidencePredicates';

// ---------------------------------------------------------------------------
// THE CORPUS, AS THE PUBLIC READS IT — docs/gf-evidence-flows.md §5 and A4.
//
// "An outsider verifies a thesis against the corpus … and never against the
// evidence table, which is the linkage between the two and is read by nobody
// outside. Public reads are corpus reads: a page's timeline, search by text over
// the corpus, and a diff's input."
//
// This module is the LOADING those reads share, and nothing else: no predicate
// is spelled here (they are `evidencePredicates.ts`'s), no refusal is decided
// here (the tools do that), and nothing is written anywhere. It exists so that
// four tools cannot each grow their own idea of what a page's timeline is —
// which is how `get_forensic_timeline` came to key diffs by date strings that
// could name a capture the corpus does not hold.
//
// TIMESTAMP ORDER, AND NO OTHER ORDER EXISTS (A4). Not by significance: "a list
// that sorts by an opinion presents the opinion as the ranking, which is the
// sentence Level 8 forbids. The opinion is shown; the researcher ranks." A
// wayback timestamp is fourteen fixed-width digits, so ordering by the string is
// chronological order and no date is parsed to get it.
//
// NOT `services/diffInput` OR `services/diffLookup`. Both are retired import
// paths held absent by test/walk/retiredNames.test.ts; the reader that replaces
// them may not wear their names.
// ---------------------------------------------------------------------------

/** The page, by the name a researcher has for it (A1: tools name a page by `url`, exact). */
export interface Page {
  id: string;
  url: string;
}

export async function loadPage(url: string): Promise<Page | null> {
  return prisma.trackedUrl.findUnique({ where: { url }, select: { id: true, url: true } });
}

/** The page, by the name a ROUTE has for it (docs/gf-ui-flows.md §6 :221: routes name a page by `trackedUrlId`). */
export async function loadPageById(trackedUrlId: string): Promise<Page | null> {
  return prisma.trackedUrl.findUnique({ where: { id: trackedUrlId }, select: { id: true, url: true } });
}

/**
 * A page NAMED AT A DOOR and not yet looked up: the one lookup of its row, and the refusal for its absence
 * (docs/gf-ui-flows.md §6 :221–:223; UI-3). A read's core calls `load()` exactly where its refusal order places the
 * lookup, so the tool (by url) and the route (by id) load one row once and refuse NOT_SURVEYED alike. The door
 * supplies `missing` — this module words no refusal.
 */
export interface PageRef {
  load(): Promise<Page | null>;
  missing(): { error: string; code: 'NOT_SURVEYED' };
}

/** A capture as the public timeline shows it — the corpus record, never the work-list row. */
export interface TimelineCapture {
  /** The database's key. Never returned by a tool: a capture is named by its timestamp (A1). */
  id: string;
  capture: string;
  snapshotDate: string;
  textHash: string;
  textExtractionVersion: string;
  documentHash: string;
  anchoredHash: string | null;
}

/** A content version, whole: its provenance, its computed chunks, and the opinion register. */
export interface StoredContentVersion extends ContentVersionProvenance {
  chunks: Prisma.JsonValue;
  classification: Prisma.JsonValue;
  survivalVersion: string;
}

/** A diff as the public timeline shows it: THE PAIR, and every derivation of it. */
export interface TimelineDiff {
  id: string;
  before: TimelineCapture;
  after: TimelineCapture;
  versions: StoredContentVersion[];
}

const CAPTURE_SELECT = {
  id: true,
  waybackTimestamp: true,
  snapshotDate: true,
  textHash: true,
  textExtractionVersion: true,
  documentHash: true,
  anchoredHash: true,
} as const;

const VERSION_SELECT = {
  contentVersionHash: true,
  beforeTextHash: true,
  afterTextHash: true,
  diffVersion: true,
  chunks: true,
  classification: true,
  survivalVersion: true,
} as const;

/**
 * A stored capture with a name, or nothing.
 *
 * A capture without a `waybackTimestamp` has no CAPTURE_ID (A1) and cannot
 * appear on an archive timeline at all; what a researcher holds of such a page
 * is a DOCUMENT (document flows §2, §9). Filtered in the query rather than
 * skipped afterwards, so no count is ever taken over rows that were then dropped.
 */
function named(row: {
  id: string;
  waybackTimestamp: string | null;
  snapshotDate: string;
  textHash: string;
  textExtractionVersion: string;
  documentHash: string;
  anchoredHash: string | null;
}): TimelineCapture | null {
  if (row.waybackTimestamp === null) return null;
  return {
    id: row.id,
    capture: row.waybackTimestamp,
    snapshotDate: row.snapshotDate,
    textHash: row.textHash,
    textExtractionVersion: row.textExtractionVersion,
    documentHash: row.documentHash,
    anchoredHash: row.anchoredHash,
  };
}

/**
 * Which page a row belongs to. The select always asks for `trackedUrlId`, so in production it is always
 * there; a row that arrives without it when exactly ONE page was asked for belongs to that page, because the
 * query's own `where` constrained it. Without this the grouping DROPS such a row silently, which is how the
 * first spelling of these plurals returned an empty timeline for every page.
 */
function pageOfRow(row: { trackedUrlId?: string | null }, asked: readonly string[]): string | null {
  if (typeof row.trackedUrlId === 'string') return row.trackedUrlId;
  return asked.length === 1 ? (asked[0] ?? null) : null;
}

/**
 * Every ACQUIRED capture of THESE pages, by page id — ONE query whatever the number of pages.
 *
 * THE PLURAL IS THE IMPLEMENTATION and the singular below delegates to it. The order, the `named` filter and
 * the select live here, once: a second place that built the same list would be a second answer to "what has
 * this page got", which is the shape `storedAttributionFor` already states as "ONE QUERY FOR THE WHOLE PAGE".
 *
 * The map has an entry for EVERY id asked for, so a caller's lookup is total and a page with no captures is
 * an empty list rather than an `undefined` that reads like a missing page.
 */
export async function capturesByPage(trackedUrlIds: readonly string[]): Promise<Map<string, TimelineCapture[]>> {
  const byPage = new Map<string, TimelineCapture[]>(trackedUrlIds.map((id) => [id, []]));
  if (trackedUrlIds.length === 0) return byPage;
  const rows = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: { in: [...trackedUrlIds] }, waybackTimestamp: { not: null } },
    orderBy: { waybackTimestamp: 'asc' },
    select: { ...CAPTURE_SELECT, trackedUrlId: true },
  });
  for (const row of rows) {
    const capture = named(row);
    if (capture === null) continue;
    const page = pageOfRow(row, trackedUrlIds);
    if (page !== null) byPage.get(page)?.push(capture);
  }
  return byPage;
}

/** Every ACQUIRED capture of a page, in TIMESTAMP order. */
export async function loadCaptures(trackedUrlId: string): Promise<TimelineCapture[]> {
  return (await capturesByPage([trackedUrlId])).get(trackedUrlId) ?? [];
}

/**
 * Every diff of a page, in the TIMESTAMP order of the pair it spans.
 *
 * Ordered by the AFTER endpoint and then the BEFORE one, which is a total order
 * over pairs and is stable across re-walks: the pair is the identity, and a
 * capture acquired between two existing ones adds a narrower pair without moving
 * any other (§7).
 */
export async function loadDiffs(trackedUrlId: string): Promise<TimelineDiff[]> {
  return (await diffsByPage([trackedUrlId])).get(trackedUrlId) ?? [];
}

/**
 * Every diff of THESE pages, by page id — ONE query whatever the number of pages. The plural is the
 * implementation; `loadDiffs` above delegates to it, and the one spelling of timestamp order lives here.
 */
export async function diffsByPage(trackedUrlIds: readonly string[]): Promise<Map<string, TimelineDiff[]>> {
  const byPage = new Map<string, TimelineDiff[]>(trackedUrlIds.map((id) => [id, []]));
  if (trackedUrlIds.length === 0) return byPage;
  const rows = await prisma.urlVersionDiff.findMany({
    where: { trackedUrlId: { in: [...trackedUrlIds] } },
    select: {
      id: true,
      trackedUrlId: true,
      beforeSnapshot: { select: CAPTURE_SELECT },
      afterSnapshot: { select: CAPTURE_SELECT },
      contentVersions: { select: VERSION_SELECT },
    },
  });
  for (const row of rows) {
    const before = named(row.beforeSnapshot);
    const after = named(row.afterSnapshot);
    if (before === null || after === null) continue;
    const page = pageOfRow(row, trackedUrlIds);
    if (page !== null) byPage.get(page)?.push({ id: row.id, before, after, versions: row.contentVersions });
  }
  // ONE SPELLING OF TIMESTAMP ORDER. A wayback timestamp is fourteen
  // fixed-width digits, so `<` IS chronological order — the same comparison
  // `intervening` makes over the same values. `localeCompare` was a second
  // spelling of it here: same answer today, a different one under any locale
  // that collates digits differently, and two rules where the design has one.
  for (const diffs of byPage.values()) {
    diffs.sort((a, b) => {
      if (a.after.capture !== b.after.capture) return a.after.capture < b.after.capture ? -1 : 1;
      if (a.before.capture === b.before.capture) return 0;
      return a.before.capture < b.before.capture ? -1 : 1;
    });
  }
  return byPage;
}

// ---------------------------------------------------------------------------
// ONE CAPTURE, AND WHAT THE WORK-LIST SAYS ABOUT IT.
// ---------------------------------------------------------------------------

/**
 * What a page holds for one named timestamp — the four states, told apart ONCE.
 *
 * Two tools ask this and answer differently, which is exactly why the DECIDING
 * is here and only the WORDING is theirs: `get_diff_input` calls all three
 * negatives NOT_A_CAPTURE, because a public read is asked "is this a capture of
 * this page whose text I can diff?" and the answer is no in all three; the
 * debate's writes separate NOT_ACQUIRED, because evidence A4 names it for a
 * record whose capture "is not ACQUIRED — a SKIPPED capture does not speak, an
 * UNSERVABLE one holds nothing", and a researcher promoting a record needs to
 * know which of those it was. One state must not have two codes by accident;
 * these two have different codes on purpose, from one lookup.
 */
export type CaptureLookup =
  | { state: 'MALFORMED' }
  | { state: 'UNKNOWN' }
  | { state: 'NOT_ACQUIRED'; outcome: string }
  | { state: 'ACQUIRED'; capture: TimelineCapture };

export async function lookupCapture(page: Page, value: string): Promise<CaptureLookup> {
  if (!isWaybackTimestamp(value)) return { state: 'MALFORMED' };

  // THROUGH `loadCaptures`, not a second query. "This page's ACQUIRED captures"
  // already has one spelling — the one NARROWED reads and `check_on_chain_status`
  // asks — and a `findFirst` beside it would be a second answer to one question,
  // free to drift in its filter (`waybackTimestamp: { not: null }`) the day that
  // filter changes.
  const capture = (await loadCaptures(page.id)).find((c) => c.capture === value);
  if (capture !== undefined) return { state: 'ACQUIRED', capture };

  // No snapshot: the work-list says whether the archive ever reported it, and
  // what the walk decided if it did. Read here rather than inferred from the
  // snapshot's absence — "a permanent gap and a judgement must never collapse".
  const workList = await prisma.cdxIndexEntry.findFirst({
    where: { trackedUrlId: page.id, waybackTimestamp: value },
    select: { status: true },
  });
  return workList === null ? { state: 'UNKNOWN' } : { state: 'NOT_ACQUIRED', outcome: workList.status };
}

/**
 * The ACQUIRED captures on either side of a capture the corpus holds no body for — what a
 * researcher names INSTEAD when a round refuses NOT_ACQUIRED on an unchanged capture. Through
 * `loadCaptures`, the one spelling of "this page's ACQUIRED captures", never a second query.
 * Added 2026-09-13, from the first live framing run: the refusal named the outcome and left the
 * model guessing which record carries the boundary it had verified against the raw archive.
 */
export async function acquiredNeighbours(
  page: Page,
  value: string,
): Promise<{ before: string | null; after: string | null }> {
  const captures = (await loadCaptures(page.id)).map((c) => c.capture).sort();
  const before = captures.filter((c) => c < value).at(-1) ?? null;
  const after = captures.find((c) => c > value) ?? null;
  return { before, after };
}

/** One pair, by the two captures it spans — never by a date pair, never by a diff id (A1). */
export async function loadDiffByPair(
  trackedUrlId: string,
  before: string,
  after: string,
): Promise<TimelineDiff | null> {
  const diffs = await loadDiffs(trackedUrlId);
  return diffs.find((d) => d.before.capture === before && d.after.capture === after) ?? null;
}

// ---------------------------------------------------------------------------
// THE OPINION REGISTER — read, validated against what the WRITER writes, and
// projected to what A4 publishes.
// ---------------------------------------------------------------------------

/**
 * The classifier's opinion, as `list_findings` shows it — LABELLED as an opinion
 * by the object it lives in, and never mixed with the computed chunks (A7,
 * `opinions-not-facts`).
 */
export interface Opinion {
  significance: string;
  categories: string[];
  legallySignificant: boolean;
  editorial: boolean;
  classifierVersion: string;
  draws: number;
}

/**
 * The STORED shape, by the writer's own list.
 *
 * `looseObject` on purpose: the stored row carries fourteen keys and A4
 * publishes six, so the schema's job is to prove the row IS a whole
 * classification and to type the six that leave — not to enumerate the eight
 * that stay. Which keys make a whole classification is
 * `recordDiff.CLASSIFICATION_KEYS`, IMPORTED rather than copied: the writer
 * already refuses to write a half classification against that list
 * (`assertWholeOrAbsent`), and a reader with its own copy is how the two come to
 * disagree about what "whole" means.
 */
const StoredClassification = z
  .looseObject({
    legalSignificance: z.string(),
    investigativeCategories: z.array(z.string()),
    isLegallySignificant: z.boolean(),
    editorial: z.boolean(),
    classifierVersion: z.string(),
    draws: z.number(),
  });

/**
 * The opinion of one content version, or null.
 *
 * NULL MEANS ONE THING: nothing classified this derivation — the state A2
 * defines and the one Gate 5 writes for a diff with no chunk on either side
 * (flows A4, amended 2026-09-08: "there is no change to call not-editorial").
 *
 * A STORED ROW THAT IS NEITHER WHOLE NOR ABSENT IS A WALK DEFECT AND THROWS,
 * NAMING THE DIFF. It is the same rule the writer holds from the other side, and
 * for the same reason: "absent is a FACT, whole is a judgement with its
 * provenance, and between them is nothing the design names." A reader that
 * quietly returned null for a half row would turn a defect into a negative
 * answer — which is precisely the failure that pulled this step forward
 * (docs/gf-walk-corrective-pass-2026-09-08.md).
 */
export function opinionOf(classification: Prisma.JsonValue, diffName: string): Opinion | null {
  if (classification === null) return null;
  if (typeof classification !== 'object' || Array.isArray(classification)) {
    throw new Error(
      `Walk defect: the classification stored for diff ${diffName} is not an object. A ` +
        'classification is whole or absent; absent is NULL.',
    );
  }
  const present = CLASSIFICATION_KEYS.filter((key) => key in classification);
  if (present.length !== CLASSIFICATION_KEYS.length) {
    const missing = CLASSIFICATION_KEYS.filter((key) => !(key in classification));
    throw new Error(
      `Walk defect: the classification stored for diff ${diffName} is HALF — ` +
        `${String(present.length)} of ${String(CLASSIFICATION_KEYS.length)} keys, missing ` +
        `${missing.join(', ')}. A classification is whole or absent: absent says nothing ` +
        'classified this derivation, whole carries the provenance that says which model under ' +
        'which prompt judged it.',
    );
  }
  const parsed = StoredClassification.safeParse(classification);
  if (!parsed.success) {
    throw new Error(
      `Walk defect: the classification stored for diff ${diffName} does not match the shape the ` +
        `walk writes — ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}.`,
    );
  }
  return {
    significance: parsed.data.legalSignificance,
    categories: parsed.data.investigativeCategories,
    legallySignificant: parsed.data.isLegallySignificant,
    editorial: parsed.data.editorial,
    classifierVersion: parsed.data.classifierVersion,
    draws: parsed.data.draws,
  };
}

/**
 * A chunk of a content version, as the COMPUTED register stores it — A2's shape,
 * whole. `survival` is REQUIRED because the writer writes it on every chunk:
 * "chunks Json — [ { side, text, survival: SURVIVES|CONTRADICTED|UNCHECKABLE } … ]".
 */
export interface StoredChunk {
  /**
   * NARROWED 2026-09-19 from `string`, and the widening is what the repair was FOR. While this said
   * `string`, any word at all type-checked from this column out to a reader — which is how the frontend came
   * to compare a side against „before", a word `diffChunking.ts` has never emitted, and mislabel every chunk
   * of a cited diff with `tsc` unable to see it (UI plan :555). `chunksOf` below makes the type a FACT.
   */
  side: ChunkSide;
  text: string;
  survival: string;
}

/**
 * The chunks of a stored version — WHOLE, or a walk defect that THROWS, naming
 * the pair, the index and, for a side outside the union, the value itself.
 *
 * The first draft of this function dropped anything that did not match the shape,
 * and that is the silent filter CLAUDE.md forbids: "a subject quietly dropped
 * from a pass is a subject reported as nothing to check". Here it would change
 * the ANSWER, not just the report — a CONTRADICTED chunk with a malformed `text`
 * would vanish, so CONTRADICTED would not refuse, NOTHING_TO_PROMOTE could fire
 * on a diff that has chunks, and the assessor would be handed partial content as
 * though it were all of it.
 *
 * It is the same rule `opinionOf` above holds over the OTHER register of the same
 * row, for the same reason and in the same words: absent is a FACT, whole is a
 * derivation with its provenance, and between them is nothing the design names.
 *
 * MOVED HERE FROM `services/openDebate.ts` AT EVIDENCE STEP 14, where it was
 * private with one caller. The review list reads the same column under the same
 * rule — a diff's `chunks` are what `moved` is computed over (§6) and what §7's
 * narrowing material asks about — and a second copy would be exactly the silent
 * filter this function's own comment is written against. `openDebate.ts` imports
 * it, and `test/debate.test.ts`'s two chunk cases stay green untouched, which is
 * what proves the move.
 */
export function chunksOf(stored: Prisma.JsonValue, pair: string): StoredChunk[] {
  const defect = (detail: string): never => {
    throw new Error(
      `Walk defect: the content version stored for diff ${pair} ${detail}. A chunk is whole — ` +
        'side, text and its survival verdict — because that is what the walk writes on every one.',
    );
  };
  if (!Array.isArray(stored)) {
    return stored === null ? [] : defect('does not hold an array of chunks');
  }
  return stored.map((c, i) => {
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      return defect(`holds a chunk at index ${String(i)} that is not an object`);
    }
    const { side, text, survival } = c as Record<string, unknown>;
    if (typeof side !== 'string' || typeof text !== 'string' || typeof survival !== 'string') {
      return defect(`holds a HALF chunk at index ${String(i)}`);
    }
    // THE SIDE IS THE WALK'S OWN UNION, and a word outside it is refused BY NAME rather than passed on as a
    // `string` for a reader to guess at. It is the same rule as the two arms above — absent is a fact, whole
    // is a derivation, and between them is nothing the design names — applied to the ONE field whose
    // widening reached a reader as a confident wrong word about the archive's bytes.
    if (side !== 'REMOVED' && side !== 'ADDED') {
      return defect(`holds a chunk at index ${String(i)} whose side is ${JSON.stringify(side)}`);
    }
    return { side, text, survival };
  });
}

/** How a diff is named in a message: by its pair, which is its identity (A1). */
export function pairName(diff: { before: { capture: string }; after: { capture: string } }): string {
  return `${diff.before.capture} → ${diff.after.capture}`;
}

// ---------------------------------------------------------------------------
// RESOLVING A NAME BACK TO THE RECORD THE CORPUS HOLDS.
// ---------------------------------------------------------------------------

/** What a record name resolves to: the record, its page, and the evidence row if there is one. */
export interface ResolvedRecord {
  fileHash: RecordId;
  kind: 'CAPTURE' | 'DIFF';
  page: Page;
  capture: TimelineCapture | null;
  pair: { before: TimelineCapture; after: TimelineCapture } | null;
  diff: TimelineDiff | null;
}

/**
 * THE RECORD AS EVIDENCE A1 NAMES IT — its page and its timestamps — from what the ONE resolver found.
 *
 * LIFTED HERE 2026-09-22 (UI-8 chunk B round 2) from `thesisReviews.ts` :166–:170, verbatim and behaviour for
 * behaviour. It was private there, and the gated thesis read now needs the same naming for `reviews[].record`
 * (thesis A4 :1476 as amended). Importing it from `thesisReviews` would have closed a runtime cycle — that
 * module imports `thesisPredicates`, which is the caller — and writing it a second time is the defect this
 * repository names most often. It belongs beside `ResolvedRecord`, which is this module's own type.
 *
 * `debateState.namedRecordOf` is NOT this function: it names a record from a DEBATE ROW's two relations. Two
 * loaders, one naming rule, each over the rows it holds.
 */
export function namedRecordOf(resolved: ResolvedRecord): NamedRecord {
  if (resolved.capture !== null) return { url: resolved.page.url, capture: resolved.capture.capture };
  if (resolved.pair !== null) return { url: resolved.page.url, before: resolved.pair.before.capture, after: resolved.pair.after.capture };
  throw new Error(`corpusReads: ${resolved.fileHash} resolved to neither a capture nor a pair (evidence A1).`);
}

/**
 * A record by its name — `Evidence.fileHash` first, then a computed pass.
 *
 * A4's `NOT_A_RECORD` is "the name resolves to nothing THE CORPUS holds", not
 * "no evidence row exists": a name is derivable from the corpus before anyone
 * promotes anything (§2, §4), which is what lets a draft cite first and argue
 * after. So the promoted case is one indexed lookup, and the unpromoted case is
 * a computed pass — one `recordId` per ACQUIRED capture and per diff, in
 * process, no chain and no archive.
 *
 * THE COST, RECORDED. That pass is linear in the corpus and bounded by it. If it
 * ever measures slow, §2 already names the answer and its price: a
 * DATABASE-GENERATED column, never an application write, at the cost of pgcrypto
 * and a second spelling of the byte layout in SQL. Not a cache, and not a column
 * any code path writes — "a column would be a second answer beside
 * `documentHash`, with a write path that can mis-write it."
 */
export async function resolveRecordByName(fileHash: string): Promise<ResolvedRecord | null> {
  return (await recordsByName([fileHash])).get(fileHash) ?? null;
}

/**
 * RECORDS BY NAME — ONE pass over the corpus for the WHOLE set, however many names are asked for.
 *
 * THIS IS THE IMPLEMENTATION and `resolveRecordByName` above delegates to it. A published thesis body asks
 * for every record it cites at once; asking one name at a time made the corpus pass run once per citation,
 * which is four queries per mention for an answer the same four queries give for all of them.
 *
 * IT FOLDS THE READS, IT DOES NOT CACHE THE PREDICATE. `recomputable` is still asked of every (name ×
 * candidate) pair, in memory, exactly as before — evidence A3 :1060–:1063 licenses caching an OBSERVATION and
 * never a predicate, and nothing here stores a verdict. What is shared is the ROWS, which are the same rows
 * for every name.
 *
 * The map has an entry for every name asked for; a name the corpus cannot derive maps to `null`, which is
 * A4's `NOT_A_RECORD` and not an absence to be confused with a missing key.
 */
export async function recordsByName(fileHashes: readonly string[]): Promise<Map<string, ResolvedRecord | null>> {
  const wanted = [...new Set(fileHashes)];
  const resolved = new Map<string, ResolvedRecord | null>(wanted.map((name) => [name, null]));
  if (wanted.length === 0) return resolved;

  // The promoted names' own pages first — one indexed lookup for the whole set rather than one each. The page's
  // URL rides this select because the narrowed pass below searches those pages and `matchInPage` needs it; it
  // is the same row under one more column, not another query.
  const promoted = await prisma.evidence.findMany({
    where: { fileHash: { in: wanted } },
    select: {
      fileHash: true,
      kind: true,
      snapshot: { select: { trackedUrl: { select: { id: true, url: true } } } },
      urlVersionDiff: { select: { trackedUrl: { select: { id: true, url: true } } } },
    },
  });
  const promotedPage = new Map<string, SearchablePage>();
  for (const row of promoted) {
    const page = row.snapshot?.trackedUrl ?? row.urlVersionDiff?.trackedUrl ?? null;
    if (page !== null) promotedPage.set(row.fileHash, page);
  }

  // THE WALK IS NARROWED TO THE CITED PAGES WHEN EVERY NAME IS PROMOTED, and skipped entirely otherwise it is
  // not (`docs/gf-thesis-read-cost-2026-09-22.md`; the source's §2). `Evidence.snapshotId` and
  // `Evidence.urlVersionDiffId` are `@unique` FKs, so a promoted name's record lives on that name's own page
  // and the other pages' captures and diffs were loaded and never examined.
  //
  // THE PREDICATE IS `promotedPage.size`, NOT `promoted.length`. An Evidence row whose page cannot be read
  // (neither relation present) adds no entry above, so counting the ROWS would narrow the walk on a name whose
  // page is unknown and answer `null` for it — `NOT_A_RECORD` on the public `resolve_record`, for a record the
  // corpus holds.
  //
  // AND THE NARROW PASS FALLS BACK RATHER THAN REFUSING. The `@unique` argument above is sound but it is
  // ASSERTED, not held by anything here: if a promoted name does not match on the pages this narrowing
  // searched, the full walk runs and answers exactly what it answered before. A false `NOT_A_RECORD` on a
  // public read is not a cost worth one saved query, and the fallback costs nothing in the case that happens.
  const everyNamePromoted = promotedPage.size === wanted.length;
  const cited = [...new Map([...promotedPage.values()].map((page) => [page.id, page])).values()];

  if (everyNamePromoted) {
    const missed = await resolveOverPages(wanted, cited, promotedPage, resolved);
    if (missed.length === 0) return resolved;
  }
  // Every page the set could resolve against — the pass that is linear in the corpus, and it runs once.
  const pages = await prisma.trackedUrl.findMany({ select: { id: true, url: true } });
  await resolveOverPages(wanted, pages, promotedPage, resolved);
  return resolved;
}

/** A page a name can be resolved against — its id and its url, which is all `matchInPage` reads. */
interface SearchablePage {
  id: string;
  url: string;
}

/**
 * Resolve every name against a page set, writing into `resolved` — and return the names it could NOT answer.
 *
 * ONE PASS FOR THE WHOLE SET, whichever page set it is given, so the narrowed pass and the full walk cannot
 * disagree about what a name resolves to: they are the same code over a different page list.
 */
async function resolveOverPages(
  wanted: readonly string[],
  searchable: readonly SearchablePage[],
  promotedPage: ReadonlyMap<string, SearchablePage>,
  resolved: Map<string, ResolvedRecord | null>,
): Promise<string[]> {
  const ids = searchable.map((page) => page.id);
  // SIBLINGS, NOT A SEQUENCE: both key on `ids` and neither reads the other's answer. Measured 2026-09-21,
  // they ran one after the other inside an eleven-call chain that was the whole critical path of the public
  // thesis read.
  const [captures, diffs] = await Promise.all([capturesByPage(ids), diffsByPage(ids)]);

  const missed: string[] = [];
  for (const name of wanted) {
    // The promoted name's own page first, then the rest — the order the singular read had, preserved because
    // a name is answered by the FIRST page whose record satisfies RECOMPUTABLE.
    const first = promotedPage.get(name)?.id;
    const order = first === undefined ? searchable : [...searchable.filter((p) => p.id === first), ...searchable.filter((p) => p.id !== first)];
    let found: ResolvedRecord | null = null;
    for (const page of order) {
      found = matchInPage(name, page, captures.get(page.id) ?? [], diffs.get(page.id) ?? []);
      if (found !== null) {
        resolved.set(name, found);
        break;
      }
    }
    if (found === null) missed.push(name);
  }
  return missed;
}

/**
 * THE TEXT EACH PIN NAMES, by `snapshotId` + `textHash` — TWO queries, whatever the number of pins, and ZERO
 * when no CAPTURE is cited.
 *
 * A capture citation pins either the capture's CURRENT text (`urlSnapshot.text`) or a superseded extraction of
 * it (`textVersion`), and the singular form asked one of those per citation. Both are asked once here for the
 * whole set, and `pinnedContent` becomes a pure function over the answer.
 *
 * The key is `snapshotId + '\u0000' + textHash`: a text is identified by the capture it belongs to AND the
 * extraction that produced it, and neither alone is unique.
 */
export async function heldTextsFor(pins: readonly { snapshotId: string; textHash: string }[]): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  if (pins.length === 0) return texts;
  const snapshotIds = [...new Set(pins.map((pin) => pin.snapshotId))];

  const current = await prisma.urlSnapshot.findMany({
    where: { id: { in: snapshotIds } },
    select: { id: true, textHash: true, text: true },
  });
  for (const row of current) texts.set(heldTextKey(row.id, row.textHash), row.text);

  // Only the pins the current text did not answer need the superseded extractions.
  const outstanding = pins.filter((pin) => !texts.has(heldTextKey(pin.snapshotId, pin.textHash)));
  // THE KEPT EXTRACTIONS, by the compound key the schema declares (`@@unique([snapshotId, textHash])`) — one
  // read per OUTSTANDING pin, which is the pins whose capture has since moved off the text they name. That is
  // the rare arm: a citation normally pins the capture's current text, which the one read above answered for
  // all of them. Reading them by key rather than by `snapshotId in` keeps the query the singular form made,
  // and a superseded pin is the only thing that costs a round trip of its own.
  for (const pin of outstanding) {
    const kept = await prisma.textVersion.findUnique({
      where: { snapshotId_textHash: { snapshotId: pin.snapshotId, textHash: pin.textHash } },
      select: { text: true },
    });
    if (kept !== null) texts.set(heldTextKey(pin.snapshotId, pin.textHash), kept.text);
  }
  return texts;
}

/** The one spelling of the key `heldTextsFor` answers by. */
export function heldTextKey(snapshotId: string, textHash: string): string {
  return `${snapshotId}\u0000${textHash}`;
}

/** Every record of one page, named, until one matches — in memory, over rows already read. */
function matchInPage(fileHash: string, page: Page, captures: readonly TimelineCapture[], diffs: readonly TimelineDiff[]): ResolvedRecord | null {
  // THROUGH THE PREDICATE, not through a private comparison. RECOMPUTABLE is
  // "e.fileHash = ID(the record it is keyed to)", and resolving a name is that
  // same equality asked of every record the corpus holds — so it is asked with
  // the same function, and a name that does not satisfy it does not resolve.
  for (const capture of captures) {
    const { recomputable: matches, expected } = recomputable(fileHash, {
      kind: 'CAPTURE',
      url: page.url,
      capture: { waybackTimestamp: capture.capture, documentHash: capture.documentHash },
    });
    if (matches) {
      return { fileHash: expected, kind: 'CAPTURE', page, capture, pair: null, diff: null };
    }
  }

  for (const diff of diffs) {
    const { recomputable: matches, expected } = recomputable(fileHash, {
      kind: 'DIFF',
      url: page.url,
      before: { waybackTimestamp: diff.before.capture, documentHash: diff.before.documentHash },
      after: { waybackTimestamp: diff.after.capture, documentHash: diff.after.documentHash },
    });
    if (matches) {
      return {
        fileHash: expected,
        kind: 'DIFF',
        page,
        capture: null,
        pair: { before: diff.before, after: diff.after },
        diff,
      };
    }
  }
  return null;
}

/** A record name over a capture the corpus holds no body for — what a citation of it is refused with. */
export interface UnacquiredRecord {
  page: Page;
  /** The capture that was never ACQUIRED, by its archive timestamp. */
  capture: string;
  /** Its work-list outcome — SKIPPED, DUPLICATE, IDENTICAL, … never ACQUIRED. */
  outcome: string;
  /** The ACQUIRED captures on either side of it, as `acquiredNeighbours` names them. */
  neighbours: { before: string | null; after: string | null };
}

/**
 * A record name that `resolveRecordByName` could not find, read against what the walk FETCHED and did not
 * keep — thesis step 20, the researcher's ruling (R47 §6-R1).
 *
 * A name is derived from a url, a timestamp and the SHA-256 of the bytes as served (evidence A1), and a
 * work-list row that the walk fetched carries exactly that digest as `rawBytesHash` whatever its outcome.
 * So a name may be over a capture the corpus never ACQUIRED: the CAPTURE name over the row, or a DIFF name
 * over the row and an acquired neighbour — the pair the walk would have written had it kept the capture.
 * Such a citation names something real that the corpus holds no text for, which is NOT_ACQUIRED, never
 * NOT_A_RECORD. Anything else is null.
 *
 * THROUGH THE PREDICATE, as `searchPage` asks it: each candidate is `recomputable`'s equality. Linear in
 * the work-list, and reached only after the corpus pass missed. The page's ACQUIRED captures are loaded ONCE
 * through `loadCaptures` — the one spelling of that list — and each row's neighbours are read from it.
 */
export async function resolveUnacquiredByName(fileHash: string): Promise<UnacquiredRecord | null> {
  const pages = await prisma.trackedUrl.findMany({ select: { id: true, url: true } });
  for (const page of pages) {
    const rows = await prisma.cdxIndexEntry.findMany({
      where: { trackedUrlId: page.id },
      select: { waybackTimestamp: true, status: true, rawBytesHash: true },
    });
    const unkept = rows.filter(
      (row): row is typeof row & { rawBytesHash: string } => row.status !== 'ACQUIRED' && row.rawBytesHash !== null,
    );
    if (unkept.length === 0) continue;

    // Timestamp order: fourteen fixed-width digits, so `<` is chronological (`loadDiffs`' one spelling).
    const acquired = await loadCaptures(page.id);
    for (const row of unkept) {
      const capture = { waybackTimestamp: row.waybackTimestamp, documentHash: row.rawBytesHash };
      const before = acquired.filter((c) => c.capture < row.waybackTimestamp).at(-1) ?? null;
      const after = acquired.find((c) => c.capture > row.waybackTimestamp) ?? null;
      const endpoint = (c: TimelineCapture): { waybackTimestamp: string; documentHash: string } => ({
        waybackTimestamp: c.capture,
        documentHash: c.documentHash,
      });

      const names =
        recomputable(fileHash, { kind: 'CAPTURE', url: page.url, capture }).recomputable ||
        (before !== null &&
          recomputable(fileHash, { kind: 'DIFF', url: page.url, before: endpoint(before), after: capture }).recomputable) ||
        (after !== null &&
          recomputable(fileHash, { kind: 'DIFF', url: page.url, before: capture, after: endpoint(after) }).recomputable);
      if (names) {
        return {
          page,
          capture: row.waybackTimestamp,
          outcome: row.status,
          neighbours: { before: before?.capture ?? null, after: after?.capture ?? null },
        };
      }
    }
  }
  return null;
}

/**
 * The record's derived NAME for every entry of a timeline.
 *
 * Thesis T2: "`list_findings` returns the name of every record on a page's
 * timeline, PROMOTED OR NOT, so a draft can cite what the corpus holds before
 * anyone has argued for it." Computed at read and stored nowhere — its inputs
 * are immutable, so a stored copy could not go stale, and nothing queries by it
 * (§2).
 */
export function captureName(page: Page, capture: TimelineCapture): RecordId {
  return recordId({
    kind: 'CAPTURE',
    url: page.url,
    capture: { waybackTimestamp: capture.capture, documentHash: capture.documentHash },
  });
}

export function diffName(page: Page, diff: TimelineDiff): RecordId {
  return recordId({
    kind: 'DIFF',
    url: page.url,
    before: { waybackTimestamp: diff.before.capture, documentHash: diff.before.documentHash },
    after: { waybackTimestamp: diff.after.capture, documentHash: diff.after.documentHash },
  });
}

/** The promotion linkage of a set of records: the evidence rows, by name. */
export interface EvidenceLinkage {
  fileHash: string;
  status: string;
  citedBy: { thesisId: string; published: boolean }[];
}

/**
 * Evidence rows for the given names, each with the PUBLISHED versions that cite
 * it — and only those.
 *
 * §5: "Evidence linkage on those reads means PUBLISHED citations, for everyone;
 * a researcher's drafts are the thesis tools' and gated there. The corpus read
 * never reveals unpublished work, so it has no second behaviour by identity."
 */
export async function loadEvidenceLinkage(
  names: readonly string[],
): Promise<Map<string, EvidenceLinkage>> {
  const linkage = new Map<string, EvidenceLinkage>();
  if (names.length === 0) return linkage;

  const rows = await prisma.evidence.findMany({
    where: { fileHash: { in: [...names] } },
    select: { fileHash: true, status: true },
  });
  if (rows.length === 0) return linkage;

  const mentions = await prisma.thesisMention.findMany({
    where: {
      kind: 'EVIDENCE',
      name: { in: rows.map((r) => r.fileHash) },
      thesisVersion: { isPublished: { isNot: null } },
    },
    select: { name: true, thesisVersion: { select: { thesisId: true } } },
  });

  for (const row of rows) {
    const citedBy = mentions
      .filter((m) => m.name === row.fileHash)
      .map((m) => ({ thesisId: m.thesisVersion.thesisId, published: true }));
    linkage.set(row.fileHash, { fileHash: row.fileHash, status: row.status, citedBy });
  }
  return linkage;
}

// ---------------------------------------------------------------------------
// THE ROWS A TIMELINE IS MADE OF — composed ONCE, for the per-page read and
// for the corpus across pages (UI-2, docs/gf-ui-refactor-plan.md UI-2
// :178–:183 "one loader, three callers, no second query"). Moved here from
// `mcp/tools/listFindings.ts` and `mcp/tools/getClaimTrajectories.ts` on the
// researcher's ruling of 2026-09-15, so that `list_corpus` at one page and
// `list_findings` are one composition and not two held equal by a test alone.
// ---------------------------------------------------------------------------

export interface AnchorReport {
  documentHash: string;
  /**
   * THREE VALUES, THREE FACTS. true — the registry holds this capture's
   * `documentHash` and our registrar submitted it. false — it does not, or
   * someone else did. null — no verdict was ever stored under the current rule,
   * which is neither of those and must never be read as "no".
   */
  attributed: boolean | null;
}

export interface CaptureEntry {
  capture: string;
  snapshotDate: string;
  fileHash: string;
  textHash: string;
  textExtractionVersion: string;
  anchor: AnchorReport;
  evidence: EvidenceLinkage | null;
}

export interface DiffEntry {
  before: string;
  after: string;
  fileHash: string;
  current: { contentVersionHash: string; chunks: unknown } | null;
  awaitingDerivation: boolean;
  opinion: Opinion | null;
  narrowed: boolean;
  evidence: EvidenceLinkage | null;
}

/** A capture's row of the timeline (evidence A4 :1082–:1083), from the stored anchor verdict and the promotion linkage. */
export function captureRow(
  page: Page,
  capture: TimelineCapture,
  attribution: ReadonlyMap<string, StoredAttribution>,
  linkage: ReadonlyMap<string, EvidenceLinkage>,
): CaptureEntry {
  const fileHash = captureName(page, capture);
  return {
    capture: capture.capture,
    snapshotDate: capture.snapshotDate,
    fileHash,
    textHash: capture.textHash,
    textExtractionVersion: capture.textExtractionVersion,
    anchor: {
      documentHash: capture.documentHash,
      attributed: attribution.get(capture.id)?.attributed ?? null,
    },
    evidence: linkage.get(fileHash) ?? null,
  };
}

/**
 * A diff's row of the timeline (evidence A4 :1084–:1090): the pair, CURRENT's chunks or the named absence, the opinion
 * in its own register, NARROWED over the page's ACQUIRED captures, and the promotion linkage.
 */
export function diffRow(
  page: Page,
  diff: TimelineDiff,
  acquired: readonly string[],
  linkage: ReadonlyMap<string, EvidenceLinkage>,
): DiffEntry {
  const fileHash = diffName(page, diff);
  const current = currentVersionOf({
    kind: 'DIFF',
    before: diff.before,
    after: diff.after,
    versions: diff.versions,
  });
  return {
    before: diff.before.capture,
    after: diff.after.capture,
    fileHash,
    current: current.defined
      ? {
          contentVersionHash: current.contentVersionHash,
          chunks: current.kind === 'DIFF' ? current.version.chunks : null,
        }
      : null,
    awaitingDerivation: !current.defined,
    opinion:
      current.defined && current.kind === 'DIFF'
        ? opinionOf(current.version.classification, pairName(diff))
        : null,
    narrowed: narrowed({ before: diff.before.capture, after: diff.after.capture }, acquired),
    evidence: linkage.get(fileHash) ?? null,
  };
}

/** One finding of a detection pass as `get_claim_trajectories` reports it: a group of claims that moved as a unit. */
export interface TrajectoryFinding {
  patternHash: string;
  /** The state this group was detected against — travels with the finding, which gets copied out of its envelope. */
  sourceStateHash: string;
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
  claimCount: number;
  changes: ChangeSpan[];
  /**
   * One entry per capture examined, in capture order — the group's own vector, carried through unchanged
   * (`TrajectoryGroup.captures`; docs/gf-ui-flows.md §6.1 :248, ruled 2026-09-20). `changes` says what the
   * claim did; this says where. A reader marking each capture, or naming the diff a claim left in, needs
   * the capture a span ENDS on, and a span carries only the one it starts on.
   */
  captures: TrajectoryGroup['captures'];
  /** trajectoryId is the citable identity; a group has none of its own, so every member is cited. */
  claims: { trajectoryId: string; claimHash: string; claimText: string }[];
}

/** The findings of a pass, one per group, each carrying the pass's state hash (evidence A4 :1103). */
export function trajectoryFindings(result: ComputeResult): TrajectoryFinding[] {
  return result.groups.map((g) => ({
    patternHash: g.patternHash,
    sourceStateHash: result.provenance.sourceStateHash,
    transitions: g.transitions,
    firstSeen: g.firstSeen,
    lastSeen: g.lastSeen,
    finalState: g.finalState,
    claimCount: g.claims.length,
    changes: g.changes,
    captures: g.captures,
    claims: g.claims.map((c) => ({
      trajectoryId: c.id,
      claimHash: c.claimHash,
      claimText: c.claimText,
    })),
  }));
}

// ---------------------------------------------------------------------------
// THE CORPUS ACROSS PAGES — docs/gf-ui-flows.md §6.1 :226–:257 and §28
// :746–:753; docs/gf-ui-refactor-plan.md UI-2 (2026-09-15). `list_corpus`,
// `list_trajectories` and `search_corpus` are this module's loaders over EVERY
// page of a scope, with the per-page rows above composed once for both. Still
// no refusal is decided here (the tools do that, through `evidenceRefusals`)
// and nothing is written: a corpus-wide read is a read, never a transaction.
//
// `scope` DECIDES, NEVER IDENTITY. `pagesInScope` reads no caller: `public` is
// PUBLIC_PAGE's set (the predicate CALLED per page), `all` every surveyed page.
// ---------------------------------------------------------------------------

/**
 * How many entries one call answers, and the most a caller may ask for — ONE
 * operational parameter (interaction flows A8; plan UI-2 :174), named in UI-2's
 * dated doc and never a judgement about the corpus.
 */
export const CORPUS_READ_LIMIT = 100;

/** A day, as `since` and `until` name one — YYYY-MM-DD, inclusive at both ends. */
export const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day, YYYY-MM-DD');

export type CorpusScope = 'public' | 'all';

/** A page of the scope, with whether a published thesis has opened it — `publicPage`, CALLED. */
export interface ScopedPage extends Page {
  public: boolean;
}

/** Code-unit order — the order this module states, never the locale's. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every surveyed page at `all`; exactly PUBLIC_PAGE's set at `public` — the predicate asked per page, never a second
 * spelling of "is this page opened". Ordered by url, so a facet reads the same way every time.
 */
export async function pagesInScope(scope: CorpusScope): Promise<ScopedPage[]> {
  const rows = await prisma.trackedUrl.findMany({ select: { id: true, url: true } });
  const pages: ScopedPage[] = [];
  for (const row of [...rows].sort((a, b) => byCodeUnit(a.url, b.url))) {
    pages.push({ id: row.id, url: row.url, public: await publicPage(row.id) });
  }
  return scope === 'all' ? pages : pages.filter((p) => p.public);
}

/** The page an entry belongs to — the field the read view marks a row of a page not yet opened by (§27 :734). */
export interface EntryPage {
  trackedUrlId: string;
  url: string;
  public: boolean;
}

/** One entry of the corpus: a capture row or a diff row (A4 :1081–:1090), its kind, and its page. */
export type CorpusEntry = (({ kind: 'CAPTURE' } & CaptureEntry) | ({ kind: 'DIFF' } & DiffEntry)) & { page: EntryPage };

// ---------------------------------------------------------------------------
// ONE PAGE'S SHAPE OVER TIME — docs/gf-ui-flows.md §24 region 3, RULED
// 2026-09-21 (the researcher): the time strip's source is the `pages` facet's
// own `shape`, NEVER the entries the view renders.
//
// WHAT IT FIXES, MEASURED ON THE REAL CORPUS. The card's text line was already
// the facet's while its strip was drawn from the FILTERED, cursor-windowed
// array, so one element contradicted itself: `?page=<corona>` drew „43 רשומות"
// over 16 dots and 16 bars, `&kind=CAPTURE` the same line over 16 dots and NO
// bars, `&kind=DIFF&cited=1` the same line over an empty strip. Ruling (g)
// already forbids narrowing the strip by the significance gate; a FILTER is that
// mistake one level up and a WINDOW is it a second time.
//
// IT COSTS NOTHING, WHICH IS WHY THIS IS THE MECHANISM AND NOT A SECOND READ.
// `loadCorpus`' loop already holds that page's captures and diffs when it builds
// the facet row, so the bins are folded out of rows that are in memory: no new
// query, no new route, no migration, and the MCP surface does not move because a
// field is not a tool. Three alternatives were considered and rejected — a
// second unfiltered read, client-side filtering (which duplicates `corpusOf`'s
// predicate across the workspace boundary and does not compose with paging), and
// a shape endpoint of its own.
//
// DAYS, AND NEVER GEOMETRY. No pixels: the 5px merge threshold and the viewBox
// width are the COMPONENT's and this module must not learn them. No midpoint: "a
// diff sits at its interval's midpoint" is ruling (b), a DRAWING rule that lives
// in the frontend's `timeStrip.ts` and nowhere else — the bin carries `before`
// and `after` and the component halves them. No sum where (e) says max.
//
// IT IS BOUNDED BY DAYS AND NOT BY RECORDS, which is the whole point: worst case
// two bins per day of the page's span, CONSTANT in the number of records, so the
// strip stops depending on `CORPUS_READ_LIMIT`.
// ---------------------------------------------------------------------------

/**
 * The captures of one day, merged — `day` is `YYYYMMDD`.
 *
 * THE UNIT IS THE DAY AND THE CONSUMER IS WHY: `timeStrip.dayOf` reads exactly
 * the first eight characters of the 14-digit wayback timestamp and discards the
 * rest, because a day is the strip's unit. Emitting the instant would be
 * emitting precision the instrument throws away.
 */
export interface CaptureBin {
  day: string;
  count: number;
  /** ANY capture under the bin carries its own `evidence` — ruling (e)'s ring, and (c): the capture's own, never a diff touching it. */
  cited: boolean;
}

/** The diffs of one `(before-day, after-day)` pair, merged — both `YYYYMMDD`. */
export interface DiffBin {
  before: string;
  after: string;
  count: number;
  /**
   * THE BIN'S MAXIMUM CHUNK COUNT, NEVER THEIR SUM (ruling (e)), and the reason
   * is measured: May's three diffs are 50, 52 and 52, and summing gives 154
   * against the page's largest real change of 125 — so the tallest mark on the
   * strip would correspond to nothing that happened. A diff still awaiting
   * derivation counts 0 and is still a bin.
   */
  chunks: number;
  /**
   * ANY diff under the bin passed the significance gate (ruling (e)'s tone
   * rule). Dimming a mark that contains a flagged change would hide the flagged
   * one behind its quiet neighbours, which is the suppression (g) refuses.
   */
  passed: boolean;
}

/** One page's whole shape over time, in days: what region 3's strip is drawn from. */
export interface PageShape {
  captures: CaptureBin[];
  diffs: DiffBin[];
}

/** The `pages` facet (§28 :750): every page of the SCOPE, its held span and its entry count, never the call's filters. */
export interface PageFacet extends EntryPage {
  first: string | null;
  last: string | null;
  entries: number;
  /**
   * The page's whole shape over time — PRESENT ONLY ON THE PAGE THE READ NAMES,
   * and `null` on every other row.
   *
   * THAT IS THE CONTRACT AND NOT AN OPTIMISATION. Region 0 — the pages list at
   * `/corpus` and `/research/corpus` with no parameter — draws NO strip: §24
   * :695–:701 is "one row per page url — the url, the interval, the record count
   * — and NOTHING else. NO time strip on a row", because a strip is ONE page's
   * shape and therefore reads as a heading. So a read that names no page must
   * not grow by one byte.
   */
  shape: PageShape | null;
}

/** A 14-digit wayback timestamp as the day it fell on — the first eight characters, which is the strip's unit. */
function dayOf(timestamp: string): string {
  return timestamp.slice(0, 8);
}

/**
 * ONE PAGE'S SHAPE, folded out of the rows the read has already composed.
 *
 * It bins the ENTRY ROWS and never the database rows, so `chunks`, `evidence`
 * and `opinion` are read here exactly as the read publishes them — a shape
 * computed from the raw columns would be a second reading of the same three
 * registers, free to drift from the one the stream shows.
 *
 * Bins come out in day order, which is `byCodeUnit` over `YYYYMMDD`: fixed-width
 * digits, so string order IS chronological order and no date is parsed.
 */
export function shapeOf(captures: readonly CaptureEntry[], diffs: readonly DiffEntry[]): PageShape {
  const captureBins = new Map<string, CaptureBin>();
  for (const capture of captures) {
    const day = dayOf(capture.capture);
    const bin = captureBins.get(day) ?? { day, count: 0, cited: false };
    bin.count += 1;
    bin.cited = bin.cited || capture.evidence !== null;
    captureBins.set(day, bin);
  }

  const diffBins = new Map<string, DiffBin>();
  for (const diff of diffs) {
    const before = dayOf(diff.before);
    const after = dayOf(diff.after);
    const key = `${before}-${after}`;
    const bin = diffBins.get(key) ?? { before, after, count: 0, chunks: 0, passed: false };
    bin.count += 1;
    bin.chunks = Math.max(bin.chunks, chunkCountOf(diff));
    // THE GATE IS CALLED, NEVER RE-SPELLED, and `deriveSignificance` is NOT the gate: its null arm is what keeps
    // an AWAITING DERIVATION pair full-toned, and this page has one.
    bin.passed = bin.passed || flaggedByClassifier({ kind: 'DIFF', opinion: diff.opinion });
    diffBins.set(key, bin);
  }

  return {
    captures: [...captureBins.values()].sort((a, b) => byCodeUnit(a.day, b.day)),
    diffs: [...diffBins.values()].sort((a, b) => byCodeUnit(a.before, b.before) || byCodeUnit(a.after, b.after)),
  };
}

/**
 * How many chunks a diff row carries — 0 while it awaits derivation, which is a
 * STATE and not an error (§24 region 4), and 0 for a version whose `chunks` is
 * not a list.
 *
 * It does NOT call `chunksOf`, and the difference is deliberate: `chunksOf`
 * THROWS on a malformed stored version, which is right where the content is
 * about to be published and wrong here, where a whole page's shape would be lost
 * to one bad row. It counts without reading a chunk's fields, so there is no
 * second spelling of what a chunk IS.
 */
function chunkCountOf(diff: DiffEntry): number {
  const chunks = diff.current?.chunks;
  return Array.isArray(chunks) ? chunks.length : 0;
}

/** A diff's instant on the chronology is its `after` — the capture at which the page is seen to have moved. */
export function entryInstant(entry: CorpusEntry): string {
  return entry.kind === 'DIFF' ? entry.after : entry.capture;
}

/** The fields of a `list_corpus` cursor, in the order they sort — the entries' total order, as a key. */
export const CORPUS_CURSOR_KEYS = ['t', 'k', 'p', 'b', 'h'] as const;
/** The fields of a `list_trajectories` cursor: the instant the claim LEFT, the page, the pattern. */
export const TRAJECTORY_CURSOR_KEYS = ['l', 'p', 'h'] as const;

export type CorpusKey = Record<(typeof CORPUS_CURSOR_KEYS)[number], string>;
export type TrajectoryKey = Record<(typeof TRAJECTORY_CURSOR_KEYS)[number], string>;

/** An entry's key: its instant, its kind (CAPTURE before DIFF at one instant), its page, a diff's `before`, its name. */
export function corpusKeyOf(entry: CorpusEntry): CorpusKey {
  return { t: entryInstant(entry), k: entry.kind, p: entry.page.url, b: entry.kind === 'DIFF' ? entry.before : '', h: entry.fileHash };
}

/**
 * TIMESTAMP ORDER ACROSS PAGES, OLDEST FIRST, and no other order (A4 :1091; §24 :682); the tie-breaks are declared,
 * never argued: at one instant a CAPTURE before a DIFF (the capture is the record, the diff the change ending at it),
 * then the page's url, then a diff's `before` ascending (the wider pair first, `loadDiffs`' own order), then the name.
 */
export function compareCorpusKeys(a: CorpusKey, b: CorpusKey): number {
  for (const field of CORPUS_CURSOR_KEYS) {
    const order = byCodeUnit(a[field], b[field]);
    if (order !== 0) return order;
  }
  return 0;
}

export const compareEntries = (a: CorpusEntry, b: CorpusEntry): number => compareCorpusKeys(corpusKeyOf(a), corpusKeyOf(b));

/** A finding of a page's stored pass, with its page. */
export type TrajectoryEntry = TrajectoryFinding & { page: EntryPage };

/**
 * The instant a claim LEFT — the last span of `changes` in which it was absent, after the first (the first span is
 * where the claim started). A finding lists only claims that flipped at least twice, so every one departed at least
 * once; a finding with no departure is a malformed row, and this THROWS rather than placing it somewhere.
 */
export function leftAt(finding: TrajectoryFinding): string {
  const gone = finding.changes.filter((span, index) => index > 0 && !span.present).at(-1);
  if (gone === undefined) {
    throw new Error(
      `corpusReads: the finding ${finding.patternHash} (${String(finding.transitions)} transitions) never left the page — ` +
        'a claim that flipped twice departed at least once; this row is malformed.',
    );
  }
  return gone.waybackTimestamp;
}

export function trajectoryKeyOf(entry: TrajectoryEntry): TrajectoryKey {
  return { l: leftAt(entry), p: entry.page.url, h: entry.patternHash };
}

/** By the date the claim LEFT, LATEST FIRST (§6.1 :245–:246), then the page's url, then the pattern. */
export function compareTrajectoryKeys(a: TrajectoryKey, b: TrajectoryKey): number {
  return byCodeUnit(b.l, a.l) || byCodeUnit(a.p, b.p) || byCodeUnit(a.h, b.h);
}

/** A day as fourteen digits at its start or its end — so a range is compared on the instant's own alphabet. */
const dayStart = (day: string): string => `${day.replace(/-/g, '')}000000`;
const dayEnd = (day: string): string => `${day.replace(/-/g, '')}235959`;

/** Is a fourteen-digit instant within `since`..`until`, each a day, both inclusive — fixed-width digits, so `<` is chronological. */
export function inRange(instant: string, since: string | undefined, until: string | undefined): boolean {
  if (since !== undefined && instant < dayStart(since)) return false;
  if (until !== undefined && instant > dayEnd(until)) return false;
  return true;
}

/** A cursor is the read's own: the last entry's key, as base64url of its JSON (plan UI-2 :174). */
export function encodeCursor(key: Record<string, string>): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

/**
 * The key a cursor carries, or null when the text is not a cursor THIS read issued: it must decode to an object whose
 * keys are EXACTLY `keys`, every value a string. Each tool's schema `refine` passes its own tuple, so one read's cursor
 * is a schema rejection on the other.
 */
export function decodeCursor<K extends readonly string[]>(text: string, keys: K): Record<K[number], string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const object = parsed as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length) return null;
  const key: Record<string, string> = {};
  for (const field of keys) {
    const value = object[field];
    if (typeof value !== 'string') return null;
    key[field] = value;
  }
  // Every field named by `keys` was found and is a string — the loop above is the check the type states.
  return key;
}

/**
 * One page of an ordered list: the entries strictly AFTER the cursor's key, `limit` of them, and the cursor for the
 * next page when more remain — one paginator for both reads, each passing its own key and order.
 */
export function pageAfter<T, K extends Record<string, string>>(
  entries: readonly T[],
  cursor: K | null,
  limit: number,
  keyOf: (entry: T) => K,
  compare: (a: K, b: K) => number,
): { entries: T[]; nextCursor: string | null } {
  const after = cursor === null ? [...entries] : entries.filter((entry) => compare(keyOf(entry), cursor) > 0);
  const page = after.slice(0, limit);
  const last = page.at(-1);
  return { entries: page, nextCursor: after.length > limit && last !== undefined ? encodeCursor(keyOf(last)) : null };
}

/**
 * THE ONE LOADER of the corpus across pages: per page the captures, the diffs and the stored anchor verdicts, ONE
 * linkage query over every name, the rows composed by `captureRow` / `diffRow` — the per-page read's own — and the
 * facet computed from the same rows (§28: "a facet on the one read, not a second read"). Entries in the total order.
 *
 * `named` IS THE PAGE THE CALL NAMED, or null, and it decides ONE thing: which facet row carries a `shape` (§24
 * region 3, ruled 2026-09-21). It is a parameter rather than something inferred here because the loader is given a
 * SET of pages and cannot tell a scope of one from a call that named one — and region 0 draws no strip, so the
 * difference has to be stated by the caller that knows it.
 */
export async function loadCorpus(
  pages: readonly ScopedPage[],
  named: string | null,
): Promise<{ entries: CorpusEntry[]; pages: PageFacet[] }> {
  const loaded: { page: ScopedPage; captures: TimelineCapture[]; diffs: TimelineDiff[]; attribution: Map<string, StoredAttribution> }[] = [];
  const names: string[] = [];
  for (const page of pages) {
    const captures = await loadCaptures(page.id);
    const diffs = await loadDiffs(page.id);
    const attribution = await storedAttributionFor(captures.map((c) => c.id));
    names.push(...captures.map((c) => captureName(page, c)), ...diffs.map((d) => diffName(page, d)));
    loaded.push({ page, captures, diffs, attribution });
  }
  const linkage = await loadEvidenceLinkage(names);

  const entries: CorpusEntry[] = [];
  const facet: PageFacet[] = [];
  for (const { page, captures, diffs, attribution } of loaded) {
    const entryPage: EntryPage = { trackedUrlId: page.id, url: page.url, public: page.public };
    const acquired = captures.map((c) => c.capture);
    // COMPOSED ONCE AND READ TWICE — the entries the stream returns and the shape the facet carries are the SAME
    // rows, so the strip can never disagree with the records under it about a chunk count, a citation or an opinion.
    const captureRows = captures.map((capture) => captureRow(page, capture, attribution, linkage));
    const diffRows = diffs.map((diff) => diffRow(page, diff, acquired, linkage));
    for (const row of captureRows) entries.push({ kind: 'CAPTURE', ...row, page: entryPage });
    for (const row of diffRows) entries.push({ kind: 'DIFF', ...row, page: entryPage });
    const held = [...acquired].sort(byCodeUnit);
    facet.push({
      ...entryPage,
      first: held.at(0) ?? null,
      last: held.at(-1) ?? null,
      entries: captures.length + diffs.length,
      // The shape rides these rows, which are loaded BEFORE any filter and BEFORE the cursor's slice — that is the
      // whole fix. `null` on every other row: region 0 draws no strip and must not pay for one.
      shape: page.id === named ? shapeOf(captureRows, diffRows) : null,
    });
  }
  return { entries: entries.sort(compareEntries), pages: facet };
}

/** `verify_claim_text`'s stored-register verdict for one held capture, with its page (A4 :1101; §6.1 :249). */
export interface SearchVerdict {
  kind: 'CAPTURE';
  page: EntryPage;
  capture: string;
  snapshotDate: string;
  fileHash: string;
  presentInStoredSnapshot: boolean;
}

/**
 * The phrase against the STORED text of every held capture of a page in the range — `loadCaptures`, the one spelling
 * of "this page's held captures", then the texts of those captures alone, then the ONE presence rule. No archive
 * fetch: the raw register is `verify_claim_text`'s, one capture at a time. A held capture with no stored text is a
 * malformed row and THROWS — never a verdict of "absent".
 */
export async function searchCaptures(page: ScopedPage, phrase: string, since: string | undefined, until: string | undefined): Promise<SearchVerdict[]> {
  const captures = (await loadCaptures(page.id)).filter((c) => inRange(c.capture, since, until));
  if (captures.length === 0) return [];
  const rows = await prisma.urlSnapshot.findMany({ where: { id: { in: captures.map((c) => c.id) } }, select: { id: true, text: true } });
  const textOf = new Map(rows.map((row) => [row.id, row.text]));
  const entryPage: EntryPage = { trackedUrlId: page.id, url: page.url, public: page.public };
  return captures.map((capture) => {
    const text = textOf.get(capture.id);
    if (text === undefined) {
      throw new Error(`corpusReads: capture ${capture.capture} of ${page.url} is held with no stored text — a malformed row, not an absence.`);
    }
    return {
      kind: 'CAPTURE',
      page: entryPage,
      capture: capture.capture,
      snapshotDate: capture.snapshotDate,
      fileHash: captureName(page, capture),
      presentInStoredSnapshot: phrasePresent(text, phrase),
    };
  });
}
