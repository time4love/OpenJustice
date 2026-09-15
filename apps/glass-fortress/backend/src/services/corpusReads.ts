import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordId, isWaybackTimestamp, type RecordId } from '../lib/evidenceIdentity';
import { phrasePresent } from '../lib/htmlText';
import type { ComputeResult, ChangeSpan } from './claimTrajectory';
import { CLASSIFICATION_KEYS } from './recordDiff';
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

/** Every ACQUIRED capture of a page, in TIMESTAMP order. */
export async function loadCaptures(trackedUrlId: string): Promise<TimelineCapture[]> {
  const rows = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId, waybackTimestamp: { not: null } },
    orderBy: { waybackTimestamp: 'asc' },
    select: CAPTURE_SELECT,
  });
  return rows.map(named).filter((c): c is TimelineCapture => c !== null);
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
  const rows = await prisma.urlVersionDiff.findMany({
    where: { trackedUrlId },
    select: {
      id: true,
      beforeSnapshot: { select: CAPTURE_SELECT },
      afterSnapshot: { select: CAPTURE_SELECT },
      contentVersions: { select: VERSION_SELECT },
    },
  });
  const diffs: TimelineDiff[] = [];
  for (const row of rows) {
    const before = named(row.beforeSnapshot);
    const after = named(row.afterSnapshot);
    if (before === null || after === null) continue;
    diffs.push({ id: row.id, before, after, versions: row.contentVersions });
  }
  // ONE SPELLING OF TIMESTAMP ORDER. A wayback timestamp is fourteen
  // fixed-width digits, so `<` IS chronological order — the same comparison
  // `intervening` makes over the same values. `localeCompare` was a second
  // spelling of it here: same answer today, a different one under any locale
  // that collates digits differently, and two rules where the design has one.
  return diffs.sort((a, b) => {
    if (a.after.capture !== b.after.capture) return a.after.capture < b.after.capture ? -1 : 1;
    if (a.before.capture === b.before.capture) return 0;
    return a.before.capture < b.before.capture ? -1 : 1;
  });
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
  side: string;
  text: string;
  survival: string;
}

/**
 * The chunks of a stored version — WHOLE, or a walk defect that THROWS, naming
 * the pair.
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
  const promoted = await prisma.evidence.findUnique({
    where: { fileHash },
    select: {
      kind: true,
      snapshot: { select: { trackedUrlId: true } },
      urlVersionDiff: { select: { trackedUrlId: true } },
    },
  });
  const pageId =
    promoted?.snapshot?.trackedUrlId ?? promoted?.urlVersionDiff?.trackedUrlId ?? null;
  if (pageId !== null) {
    const resolved = await searchPage(pageId, fileHash);
    if (resolved !== null) return resolved;
  }

  const pages = await prisma.trackedUrl.findMany({ select: { id: true, url: true } });
  for (const page of pages) {
    if (page.id === pageId) continue; // already searched
    const resolved = await searchPage(page.id, fileHash);
    if (resolved !== null) return resolved;
  }
  return null;
}

/** Every record of one page, named, until one matches. */
async function searchPage(pageId: string, fileHash: string): Promise<ResolvedRecord | null> {
  const page = await prisma.trackedUrl.findUnique({
    where: { id: pageId },
    select: { id: true, url: true },
  });
  if (page === null) return null;

  // THROUGH THE PREDICATE, not through a private comparison. RECOMPUTABLE is
  // "e.fileHash = ID(the record it is keyed to)", and resolving a name is that
  // same equality asked of every record the corpus holds — so it is asked with
  // the same function, and a name that does not satisfy it does not resolve.
  const captures = await loadCaptures(page.id);
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

  const diffs = await loadDiffs(page.id);
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

/** The `pages` facet (§28 :750): every page of the SCOPE, its held span and its entry count, never the call's filters. */
export interface PageFacet extends EntryPage {
  first: string | null;
  last: string | null;
  entries: number;
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
 */
export async function loadCorpus(pages: readonly ScopedPage[]): Promise<{ entries: CorpusEntry[]; pages: PageFacet[] }> {
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
    for (const capture of captures) entries.push({ kind: 'CAPTURE', ...captureRow(page, capture, attribution, linkage), page: entryPage });
    for (const diff of diffs) entries.push({ kind: 'DIFF', ...diffRow(page, diff, acquired, linkage), page: entryPage });
    const held = [...acquired].sort(byCodeUnit);
    facet.push({ ...entryPage, first: held.at(0) ?? null, last: held.at(-1) ?? null, entries: captures.length + diffs.length });
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
