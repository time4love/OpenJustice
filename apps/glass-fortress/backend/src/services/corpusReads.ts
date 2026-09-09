import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordId, isWaybackTimestamp, type RecordId } from '../lib/evidenceIdentity';
import { CLASSIFICATION_KEYS } from './recordDiff';
import { recomputable, type ContentVersionProvenance } from './evidencePredicates';

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
      type: 'EVIDENCE',
      refId: { in: rows.map((r) => r.fileHash) },
      thesisVersion: { isPublished: { isNot: null } },
    },
    select: { refId: true, thesisVersion: { select: { thesisId: true } } },
  });

  for (const row of rows) {
    const citedBy = mentions
      .filter((m) => m.refId === row.fileHash)
      .map((m) => ({ thesisId: m.thesisVersion.thesisId, published: true }));
    linkage.set(row.fileHash, { fileHash: row.fileHash, status: row.status, citedBy });
  }
  return linkage;
}
