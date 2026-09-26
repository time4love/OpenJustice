import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { DIFF_VERSION } from '../lib/diffVersion';
import { ON_CHAIN_CHECK_VERSION } from '../lib/onChainVerdict';
import { recordId, type RecordId, type Record as CorpusRecord } from '../lib/evidenceIdentity';
import { normaliseForPresence } from '../lib/htmlText';
import { assessEvidenceInputSoundness } from './evidenceInputSoundness';
import { documentShedNotBuilt, documentsByCommitment, evidenceCurrentOf } from './documentCitation';
import { recomputableEvidence } from './documentPredicates';

// ---------------------------------------------------------------------------
// A3'S DERIVATIONS, AS PREDICATES — docs/gf-evidence-flows.md A3, and the one
// place each of them is spelled.
//
// "Every predicate is computed on read and none is stored. A predicate a pass
// computed and stored would be a judgement the pass made." So there is no
// column for any of these, and the publication gate (step 15) CALLS them rather
// than re-deriving them: a second spelling of VERIFIED, CURRENT or PUBLISHABLE
// inside the gate is the copy that drifts, which A7 makes a source scan
// (test/evidence/scans.test.ts).
//
// THE PURITY RULE, STATED ONCE. A predicate whose inputs are small rows is PURE
// and SYNC — `currentVersionOf`, `needsReview`, `citationCurrent`, `narrowed`,
// `intervening`, `recomputable` — and its caller does the loading. A predicate
// that is a QUESTION ABOUT THE DATABASE is async and does its own loading —
// `publicPage`, `verified`, `flagged` — so that the step-15 gate asks the same
// function this step's tools ask and cannot load it differently. The acceptance
// suite already types `publicPage` that way (test/evidence/predicates.test.ts).
//
// WHAT `publishable` IS, AND WHY EVERY CONJUNCT IS A CALL. Built at evidence
// step 15, the step that gives it the gate to consume it. It composes A3's five
// clauses plus the precondition A6 promotes to a check of its own, and it
// computes NONE of them: `RECORD_PROMOTED` reads the loaded row's two statuses,
// `ARGUED` calls `argued`, `VERIFIED` calls `verified`, `DERIVED` calls
// `currentVersionOf` over the same `RecordContent` shape `flagged` builds,
// `CITATION_CURRENT` calls `citationCurrent` over the `Current` that produced,
// and `INPUT_SOUND` calls `assessEvidenceInputSoundness` — check 17, whose scope
// rule stays in its own module rather than being re-decided here. A6 :1217 asks
// for exactly that: "the checks CALL the predicates of A3 and never re-derive
// them". A second spelling of VERIFIED, CURRENT or PUBLISHABLE inside the gate is
// the copy that drifts, and that is what the one-symbol scan catches.
//
// IT RETURNS A REPORT, NOT A BOOLEAN, because A6 :1201-:1202 requires each check
// to name the mention it examined and the version it examined it at, and a
// `Promise<boolean>` cannot carry that — so the gate would have to re-derive the
// detail, which is the second spelling A6 forbids in the same paragraph.
//
// `argued` arrived at evidence step 13 with the debate that gives it a subject.
//
// AND THE CONVERSE: WHY TWO FUNCTIONS A3 DOES NOT NAME ARE PRESENT.
// `movedBetween` and `whereChunksWent` are §6's containment rule and §7's
// narrowing material, not A3 predicates — and they live here on the ruling of
// 2026-09-09, because the ONE-SYMBOL RULE IS ABOUT A SPELLING THAT CAN DRIFT
// rather than about A3's list. The rule has A3's exact failure mode: §7's
// narrowing clause is already a SECOND consumer inside evidence step 14, and
// thesis T6's own reviews list is a third when it is built, so a second spelling
// in any of them is the copy that drifts. They enter the scan's `NAMES` for that
// reason. `contains` does NOT: it is module-private, and the scan's own sentence
// is "every predicate of A3 has ONE IMPORTABLE symbol" — a non-exported helper
// cannot be a second spelling anyone imports, and a generic name in `NAMES`
// would one day fire on an unrelated `function contains(` with no way to satisfy
// it but a comment that lied about what it checks.
//
// ATTRIBUTED IS NOT SPELLED HERE. Its one implementation is `attributeClaim` in
// `src/services/registryState.ts`, which serves the ledger, the audits, the
// anchor-time check and the per-capture reads through one entry-lookup
// parameter. What this module does with attribution is READ THE STORED VERDICT
// the anchor-time check wrote (`storedAttributionFor`), never ask the chain: a
// public timeline that read the chain once per capture would be unbounded work
// for an anonymous caller.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CURRENT — the version derived from a record's current inputs (A3).
// ---------------------------------------------------------------------------

/** What a capture contributes to CURRENT: its current text version (flows A2). */
export interface CaptureContent {
  textHash: string;
  textExtractionVersion: string;
}

/** The provenance columns of a `DiffContentVersion`, as CURRENT(diff) asks them. */
export interface ContentVersionProvenance {
  contentVersionHash: string;
  beforeTextHash: string;
  afterTextHash: string;
  diffVersion: string;
}

/**
 * CURRENT, as a DISCRIMINATED UNION rather than a nullable value.
 *
 * A3: where CURRENT is undefined the diff is AWAITING_DERIVATION — "the walk
 * owes a version … and no evidence predicate below evaluates until it does.
 * Awaiting is not review: the human is not asked to judge a version that does
 * not exist." A caller holding `null` can forget which of the two it means; a
 * caller holding this has to read the discriminant to reach anything.
 *
 * THE DOCUMENT ARM, BY ADDITION AT DOCUMENT STEP 33: CURRENT(d) is `documentPredicates.currentVersion`'s, and a
 * debated document's is handed here in this shape so that STALE_PIN and NEEDS_REVIEW are these predicates, CALLED —
 * "everything else on the row … is evidence's, and applies to a document without a second spelling" (document §6
 * :675–:677). Nothing here derives it.
 */
export type Current<V extends ContentVersionProvenance> =
  | { defined: true; kind: 'CAPTURE'; contentVersionHash: string }
  | { defined: true; kind: 'DIFF'; contentVersionHash: string; version: V }
  | { defined: true; kind: 'DOCUMENT'; contentVersionHash: string }
  | { defined: false; reason: 'AWAITING_DERIVATION' };

/** A record as CURRENT reads it: a capture's text, or a pair and its versions. */
export type RecordContent<V extends ContentVersionProvenance> =
  | { kind: 'CAPTURE'; capture: CaptureContent }
  | { kind: 'DIFF'; before: CaptureContent; after: CaptureContent; versions: readonly V[] };

/**
 * CURRENT(capture) is the snapshot's own current text version; CURRENT(diff) is
 * the content version derived from BOTH endpoints' current text under the
 * CURRENT `DIFF_VERSION` — three equalities, asked as one (A3).
 *
 * `DIFF_VERSION` is imported, never recomposed: `src/lib/diffVersion.ts` already
 * composes the differ and the classifier "so CURRENT(diff) asks one equality,
 * never two".
 */
export function currentVersionOf<V extends ContentVersionProvenance>(
  record: RecordContent<V>,
): Current<V> {
  if (record.kind === 'CAPTURE') {
    return { defined: true, kind: 'CAPTURE', contentVersionHash: record.capture.textHash };
  }
  const version = record.versions.find(
    (v) =>
      v.beforeTextHash === record.before.textHash &&
      v.afterTextHash === record.after.textHash &&
      v.diffVersion === DIFF_VERSION,
  );
  if (version === undefined) return { defined: false, reason: 'AWAITING_DERIVATION' };
  return { defined: true, kind: 'DIFF', contentVersionHash: version.contentVersionHash, version };
}

/**
 * A predicate that cannot be evaluated because CURRENT is not defined says so
 * rather than answering. Same discipline as `Current` itself.
 */
export type Evaluated<T> = { evaluable: true; value: T } | { evaluable: false; reason: 'AWAITING_DERIVATION' };

/** NEEDS_REVIEW(e) — PROMOTED, and CURRENT has moved off what a human affirmed. */
export function needsReview<V extends ContentVersionProvenance>(
  evidence: { status: string; affirmedContentVersionHash: string },
  current: Current<V>,
): Evaluated<boolean> {
  if (!current.defined) return { evaluable: false, reason: current.reason };
  return {
    evaluable: true,
    value:
      evidence.status === 'PROMOTED' &&
      current.contentVersionHash !== evidence.affirmedContentVersionHash,
  };
}

/** CITATION_CURRENT(m) — the pin names the version CURRENT resolves to. */
export function citationCurrent<V extends ContentVersionProvenance>(
  mention: { contentVersionHash: string | null },
  current: Current<V>,
): Evaluated<boolean> {
  if (!current.defined) return { evaluable: false, reason: current.reason };
  return { evaluable: true, value: mention.contentVersionHash === current.contentVersionHash };
}

// ---------------------------------------------------------------------------
// ARGUED — the citation's own argument (A3), built at evidence step 13.
// ---------------------------------------------------------------------------

/** A citation and the debate it references, as ARGUED reads them. */
export interface ArguedMention {
  /** The record the citation names — `ThesisMention.name` — the fileHash (thesis flows A2 :1283). */
  name: string;
  /** The thesis of the version this mention sits on. */
  thesisId: string;
  /** The debate the mention references, loaded by the caller; null when it has none. */
  debate: { status: string; recordFileHash: string; thesisId: string } | null;
}

/**
 * ARGUED(m) — the mention's debate is PROMOTED, for THIS record and THIS thesis.
 *
 * A3 states all three clauses and each removes a different way of being wrong: a
 * mention with no debate is a draft's citation nobody has argued for (T2 allows
 * it in the head and PUBLISHABLE refuses it); an OPEN or ABANDONED debate is an
 * argument that never cleared; a debate PROMOTED for a DIFFERENT record, or for a
 * different thesis, is someone else's argument standing in for this one — which
 * is precisely what "importance is a relation, and the relation is the thesis's"
 * (§1) forbids. A second thesis citing the same record argues its own (T3).
 *
 * PURE AND SYNC over rows the caller loaded, by the purity rule this module
 * states once: the caller already holds the mention and its version to know
 * which thesis is asking, so a predicate that re-read them could read them
 * differently from the gate that calls it.
 */
export function argued(mention: ArguedMention): boolean {
  const debate = mention.debate;
  if (debate === null) return false;
  return (
    debate.status === 'PROMOTED' &&
    debate.recordFileHash === mention.name &&
    debate.thesisId === mention.thesisId
  );
}

// ---------------------------------------------------------------------------
// THE CONTAINMENT RULE — what moved between two versions (§6), and where the
// chunks of a wide record went (§7).
//
// A3 does not name these three, and they are here on the RULING of 2026-09-09:
// the one-symbol rule is about a spelling that can DRIFT, and §6's containment
// is one — §7's narrowing material is a second consumer inside this very step,
// and thesis T6's own reviews list is a third when it is built. `movedBetween`
// and `whereChunksWent` are EXPORTED and enter the scan's `NAMES`; `contains` is
// MODULE-PRIVATE and stays out of it, because a non-exported helper cannot be a
// second spelling anyone imports.
//
// PURE AND SYNC over values the caller loaded, by this module's own purity rule.
// No Prisma import is added by any of the three.
// ---------------------------------------------------------------------------

/**
 * A unit of a version's computed content, in the shape its record gives it.
 *
 * A DIFF's units are the stored chunks and carry a `side`; a CAPTURE's are its
 * SEGMENTS through `lib/claimSurvival.segments` and have none — "a capture's
 * text has no sides". One rule over both shapes, and the shape is the caller's.
 */
export interface ContentUnit {
  /** REMOVED | ADDED for a diff's chunk; ABSENT for a capture's segment. */
  side?: string;
  text: string;
  /**
   * SURVIVES | CONTRADICTED | UNCHECKABLE — a DIFF's chunk carries the walk's
   * verdict, as A2 stores it; a CAPTURE's segment has none, because survival is a
   * verdict about a diff's chunk.
   *
   * CARRIED, NEVER COMPARED. `contains` reads `side` and `text` alone, so the
   * verdict changes no answer about what moved — it is material a reviewer reads
   * beside the two versions, and a CONTRADICTED chunk in the CURRENT version is
   * exactly what a WITHDRAW rests on.
   */
  survival?: string;
}

/** What moved between the affirmed version and the current one (§6). */
export interface Moved {
  entered: ContentUnit[];
  left: ContentUnit[];
}

/** One narrower record, and the units of its current version (§7). */
export interface NarrowerRecord {
  before: string;
  after: string;
  units: readonly ContentUnit[];
}

/** Where ONE unit of the wide record went — an empty list is an ANSWER (§7). */
export interface CarriedChunk {
  text: string;
  carriedBy: { before: string; after: string }[];
}

/**
 * Does `container` hold `contained`, as text?
 *
 * MODULE-PRIVATE, and normalised through `normaliseForPresence` — the one
 * spelling this platform already has for "is this phrase present in that text",
 * shared with claim-trajectory detection on its own stated ground: "a phrase this
 * platform reports as present in a capture must mean the same thing whichever
 * tool reported it." A fourth `replace(/\s+/g, ' ')` here would be that
 * disagreement.
 */
function contains(container: ContentUnit, contained: ContentUnit): boolean {
  // WITHIN SIDE, where a side exists. Two capture segments both have `undefined`
  // and compare as one bag; a diff's REMOVED chunk is never contained by an ADDED
  // one, which is what makes a side-flip TWO facts rather than none.
  if (container.side !== contained.side) return false;
  return normaliseForPresence(container.text).includes(normaliseForPresence(contained.text));
}

/**
 * WHAT MOVED — the units that ENTERED the current version and those that LEFT
 * the affirmed one, by containment.
 *
 * WHY CONTAINMENT AND NOT EQUALITY, PROVEN BY A REAL CASE. The re-walk of
 * 2026-09-07 (docs/gf-walk-step-5-rewalk-2026-09-07.md) found two positional
 * rules mutilating one sentence: the old derivation held a FRAGMENT, the new one
 * holds the whole SENTENCE containing it. Under equality that reads as one unit
 * left and one entered — the same text reported as two movements, and a
 * researcher asked to judge a change that did not happen. Under containment it
 * reads as one unit entering and nothing leaving, which is what the bytes say.
 *
 * A unit whose only container sits on the OTHER SIDE appears in BOTH lists,
 * because a chunk that moved from REMOVED to ADDED is two facts and a researcher
 * re-affirming must see both.
 */
export function movedBetween(
  affirmed: readonly ContentUnit[],
  current: readonly ContentUnit[],
): Moved {
  return {
    entered: current.filter((c) => !affirmed.some((a) => contains(a, c))),
    left: affirmed.filter((a) => !current.some((c) => contains(c, a))),
  };
}

/**
 * WHERE EACH CHUNK OF THE WIDE RECORD WENT — ONE ROW PER WIDE UNIT, ALWAYS.
 *
 * §7: "where each chunk of the wide record went, computed by containment with no
 * model."
 *
 * THE DIRECTION IS FIXED AND IT IS NOT SYMMETRIC: a wide unit is CARRIED when a
 * NARROWER unit CONTAINS IT — never the other way round. A narrower diff spans a
 * shorter interval, so it holds the wide record's change in equal or finer
 * grain; a wide chunk that merely contains some narrower fragment has not been
 * carried by it, and reporting that as carriage would tell a researcher the
 * narrower records replace the wide one when they do not. One row per unit of
 * the wide version, IN ITS ORDER, and an empty
 * `carriedBy` means that chunk is in no narrower diff — **which is an ANSWER and
 * not an absence**. A mapping that listed only what was carried would leave the
 * reader unable to tell "went nowhere" from "not computed", and *went nowhere* is
 * the fact that matters most to a researcher deciding whether the narrower
 * records replace the wide one.
 */
export function whereChunksWent(
  wide: readonly ContentUnit[],
  narrower: readonly NarrowerRecord[],
): CarriedChunk[] {
  return wide.map((unit) => ({
    text: unit.text,
    carriedBy: narrower
      .filter((n) => n.units.some((u) => contains(u, unit)))
      .map((n) => ({ before: n.before, after: n.after })),
  }));
}

// ---------------------------------------------------------------------------
// NARROWING — material, never a flow (§7).
// ---------------------------------------------------------------------------

/** The pair's endpoints, by the archive's name for each. */
export interface Pair {
  before: string;
  after: string;
}

/**
 * INTERVENING(d) — the ACQUIRED captures strictly between the endpoints, in
 * timestamp order.
 *
 * `acquired` is the page's ACQUIRED captures and nothing else: "IDENTICAL and
 * DUPLICATE rows carry the predecessor's text and narrow nothing; SKIPPED and
 * UNSERVABLE do not speak" (§7). Timestamps are fourteen fixed-width digits, so
 * string comparison IS chronological order — no date is parsed anywhere here.
 */
export function intervening(pair: Pair, acquired: readonly string[]): string[] {
  return acquired.filter((t) => t > pair.before && t < pair.after).sort();
}

/** NARROWED(d) — one implementation, expressed in terms of INTERVENING. */
export function narrowed(pair: Pair, acquired: readonly string[]): boolean {
  return intervening(pair, acquired).length > 0;
}

// ---------------------------------------------------------------------------
// RECOMPUTABLE — a predicate a row satisfies or is MALFORMED by (§2).
// ---------------------------------------------------------------------------

/**
 * RECOMPUTABLE(e) — `e.fileHash = ID(the record it is keyed to)`.
 *
 * Returns the EXPECTED name beside the answer so a caller can say what the
 * record is actually called; `forensics:audit-evidence` needs that for its
 * report and `resolve_record` does not, and one function serves both rather
 * than each composing `recordId` itself. Extracted here at evidence step 12
 * from `src/services/auditEvidence.ts`, where it was spelled inline once per
 * kind.
 *
 * It is never a rate. "Nothing legitimate makes it false: a row that fails it
 * did not drift; it was written wrong."
 */
export function recomputable(
  fileHash: string,
  record: CorpusRecord,
): { recomputable: boolean; expected: RecordId } {
  const expected = recordId(record);
  return { recomputable: expected === fileHash, expected };
}

// ---------------------------------------------------------------------------
// PUBLIC_PAGE — what publication opens (§5, amended by thesis T6).
// ---------------------------------------------------------------------------

/**
 * EVER PUBLISHED(v) — the version has a PublicationAttempt whose outcome is PUBLISHED (thesis A3 :1399–:1402 as amended by
 * T6; ruled 2026-09-14, the R49 sketch §6 R3). ONE spelling, as a relation filter on `ThesisVersion`, shared by
 * `publicPage`, the public version read and the public history; `test/everPublished.test.ts` holds that no other module
 * spells it. An attempt is written only by `publish_thesis`, and never updated or deleted, so what it says stays true.
 */
export const EVER_PUBLISHED = {
  publicationAttempts: { some: { outcome: 'PUBLISHED' } },
} as const satisfies Prisma.ThesisVersionWhereInput;

/**
 * PUBLIC_PAGE(page) — a page is public in full from the moment a published
 * thesis version cites any record of it.
 *
 * "Publication opens the PAGE, not the record … every capture and every diff,
 * selected or not, which is what makes the counterweight of §1 real for an
 * outsider." A page no published thesis touches is a researcher's working
 * corpus, and saying otherwise in public is the framing risk §9.5 ranks first.
 *
 * THE "EVER PUBLISHED" ARM — built at thesis step 23 (plan step 23 :196, "PUBLIC_PAGE
 * amended in evidence's predicate module"). Thesis T6 :920–:924 amends this predicate
 * to hold for a page any version EVER published cited — "opened pages stay open",
 * through a withdrawal and past a later publication citing nothing of it (thesis A3
 * :1399–:1402). RULED 2026-09-14 (the R49 sketch §6 R3): a version was ever published
 * iff it has a PublicationAttempt with outcome PUBLISHED — `EVER_PUBLISHED`, the one
 * spelling. The pin arm is SUBSUMED rather than dropped: `publish_thesis` is the one
 * writer of the pin and writes a PUBLISHED attempt in the same transaction, so a
 * version that IS the pin is a version ever published.
 *
 * A DOCUMENT record opens no page: what publication opens for a document is
 * decided per document (document flows §7, `OPENED(d)`), and its `Evidence` row
 * carries a commitment rather than a corpus key.
 */
export async function publicPage(trackedUrlId: string): Promise<boolean> {
  const records = await prisma.evidence.findMany({
    where: { OR: [{ snapshot: { trackedUrlId } }, { urlVersionDiff: { trackedUrlId } }] },
    select: { fileHash: true },
  });
  if (records.length === 0) return false;

  const citedByAVersionEverPublished = await prisma.thesisMention.count({
    where: {
      kind: 'EVIDENCE',
      name: { in: records.map((r) => r.fileHash) },
      thesisVersion: EVER_PUBLISHED,
    },
  });
  return citedByAVersionEverPublished > 0;
}

// ---------------------------------------------------------------------------
// ATTRIBUTION, AS THE ANCHOR-TIME CHECK STORED IT.
// ---------------------------------------------------------------------------

/**
 * What the newest stored anchor check says about one capture.
 *
 * `attributed` is THREE-VALUED and every value is a different fact: true — the
 * registry holds this capture's `documentHash` and our registrar submitted it;
 * false — it does not, or someone else did; **null — no verdict was ever stored
 * under the current rule**, which is neither. A boolean carrying "attributed",
 * "not attributed" and "never asked" is the null-with-three-meanings this
 * repository has already paid for.
 *
 * A verdict written under an older `ON_CHAIN_CHECK_VERSION` reads as null on
 * purpose: attribution — the submitter comparison — entered the check at
 * evidence step 12, so a row from before it never asked the question. Captures
 * anchored before that are re-checked by a maintenance pass in the deployment,
 * on the researcher's instruction, never by a read.
 */
export interface StoredAttribution {
  attributed: boolean | null;
  verdict: string | null;
  verifierVersion: string | null;
  checkedAt: Date | null;
}

const NEVER_CHECKED: StoredAttribution = {
  attributed: null,
  verdict: null,
  verifierVersion: null,
  checkedAt: null,
};

/**
 * The newest ON_CHAIN_ANCHOR verdict per capture, read from stored state.
 *
 * ONE QUERY FOR THE WHOLE PAGE, ordered newest first and folded by subject, so a
 * timeline of a hundred captures costs one round trip and no chain call at all.
 * A3 licenses reading the stored verdict where the predicate is expensive: "the
 * stored check verdict of §9 caches the OBSERVATION with its version and its
 * subject, and the predicate reads the verdict".
 */
export async function storedAttributionFor(
  snapshotIds: readonly string[],
): Promise<Map<string, StoredAttribution>> {
  const byCapture = new Map<string, StoredAttribution>();
  if (snapshotIds.length === 0) return byCapture;

  const checks = await prisma.integrityCheck.findMany({
    where: {
      subjectType: 'URL_SNAPSHOT',
      checkType: 'ON_CHAIN_ANCHOR',
      subjectId: { in: [...snapshotIds] },
    },
    orderBy: { checkedAt: 'desc' },
    select: { subjectId: true, verdict: true, detail: true, verifierVersion: true, checkedAt: true },
  });

  for (const check of checks) {
    if (byCapture.has(check.subjectId)) continue; // newest wins; the rest are history
    byCapture.set(check.subjectId, readStoredAttribution(check));
  }
  for (const id of snapshotIds) if (!byCapture.has(id)) byCapture.set(id, NEVER_CHECKED);
  return byCapture;
}

/** One stored row, read without believing anything it does not say. */
function readStoredAttribution(check: {
  verdict: string;
  detail: unknown;
  verifierVersion: string;
  checkedAt: Date;
}): StoredAttribution {
  const base = {
    verdict: check.verdict,
    verifierVersion: check.verifierVersion,
    checkedAt: check.checkedAt,
  };
  // A verdict from before the submitter comparison entered the check never asked
  // the question, whatever its detail happens to hold.
  if (check.verifierVersion !== ON_CHAIN_CHECK_VERSION) return { ...base, attributed: null };
  const detail = check.detail;
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) {
    return { ...base, attributed: null };
  }
  const attributed = (detail as { attributed?: unknown }).attributed;
  return { ...base, attributed: typeof attributed === 'boolean' ? attributed : null };
}

// ---------------------------------------------------------------------------
// VERIFIED — what Level 9 means (§5).
// ---------------------------------------------------------------------------

/** One capture of a record, and what the chain state stored about its anchor. */
export interface CaptureAttribution {
  capture: string;
  documentHash: string;
  anchoredHash: string | null;
  anchoredHashMatchesDocumentHash: boolean;
  attributed: boolean | null;
  verdict: string | null;
  verifierVersion: string | null;
  checkedAt: Date | null;
}

/**
 * VERIFIED, or the reason it cannot be asked of this row — the TWO reasons `resolve_record` serves (evidence A4 :1106 as
 * CONFORMED 2026-09-26, the researcher's Q12).
 *
 * A DOCUMENT ROW NEVER REACHES THIS PREDICATE, and meeting one THROWS (`verifiedFromRow`). VERIFIED(d) is document flows
 * A3 :1367, RECOMPUTABLE(d) AND ANCHORED(d), and ANCHORED(d) is a CHAIN READ (A3 :1366) this module never makes: it reads
 * the STORED attribution a capture's anchor-time check wrote, and a document has none (§4 :447). Its two readers cannot
 * hand it one — `resolve_record` resolves corpus names only (a capture or a pair), and `publishable` routes a DOCUMENT row
 * to `verifiedDocumentRow`, which grades it from the chain's answer the caller handed in (Q1).
 */
export type VerifiedReport =
  | {
      evaluable: true;
      verified: boolean;
      recomputable: boolean;
      expected: RecordId;
      captures: CaptureAttribution[];
    }
  | { evaluable: false; reason: 'NOT_PROMOTED' | 'MALFORMED_RECORD_KEY' };

const CAPTURE_IDENTITY = {
  id: true,
  waybackTimestamp: true,
  documentHash: true,
  anchoredHash: true,
  trackedUrl: { select: { url: true } },
} as const;

const EVIDENCE_IDENTITY_SELECT = {
  fileHash: true,
  kind: true,
  snapshot: { select: CAPTURE_IDENTITY },
  urlVersionDiff: {
    select: {
      beforeSnapshot: { select: CAPTURE_IDENTITY },
      afterSnapshot: { select: CAPTURE_IDENTITY },
    },
  },
} as const;

/** The identity columns VERIFIED reads — one select, so the plural and its per-row judgement cannot drift. */
type EvidenceIdentityRow = Prisma.EvidenceGetPayload<{ select: typeof EVIDENCE_IDENTITY_SELECT }>;

/**
 * VERIFIED(e) = RECOMPUTABLE(e) AND, for every capture of the record,
 * ATTRIBUTED(documentHash) AND `anchoredHash = documentHash` (A3).
 *
 * ATTRIBUTION IS READ FROM THE STORED VERDICT, which the anchor-time check wrote
 * seconds after the registration — "the receipt is inside the RPC's horizon by
 * construction". A capture whose attribution was never stored makes VERIFIED
 * FALSE, not true: an unanswered question is not a pass, and that is the whole
 * lesson of the 2026-08-20 audit.
 */
export async function verified(fileHash: string): Promise<VerifiedReport> {
  const report = (await verifiedFor([fileHash])).get(fileHash);
  if (report === undefined) throw new Error(`verified: verifiedFor answered nothing for ${fileHash} — the map is total by construction.`);
  return report;
}

/**
 * VERIFIED FOR A SET OF RECORDS — the IMPLEMENTATION, which `verified` above delegates to.
 *
 * TWO QUERIES, whatever the number of names: one for the evidence rows, one `storedAttributionFor` over every
 * capture of every row. Asking one name at a time made a published body pay two round trips per citation for
 * an answer two round trips give for all of them.
 *
 * THE PLURAL IS THE IMPLEMENTATION AND IT LIVES HERE, in the predicate's own module — evidence A7 :1302–:1303
 * gives every predicate of A3 ONE importable symbol, and a batching helper written inside `publishedThesis.ts`
 * would be a SECOND SPELLING of VERIFIED, which is exactly what the one-symbol scan exists to refuse.
 *
 * IT FOLDS THE READS AND CACHES NO PREDICATE. Every per-row judgement below — `recomputable`, `nameOf`, the
 * three `evaluable: false` reasons, the attribution fold — is made exactly as the singular made it. A3
 * :1060–:1063 licenses caching the stored OBSERVATION and never the predicate; nothing here is stored at all.
 *
 * The map answers for EVERY name asked, so the singular's lookup is total and a miss is a loud throw rather
 * than an `undefined` that would read as a negative verdict.
 */
export async function verifiedFor(fileHashes: readonly string[]): Promise<Map<string, VerifiedReport>> {
  const wanted = [...new Set(fileHashes)];
  const reports = new Map<string, VerifiedReport>();
  if (wanted.length === 0) return reports;

  // A SET OF ONE IS READ BY ITS KEY. `findUnique` on the unique `fileHash` is the better query for one name —
  // an indexed point lookup rather than a one-element `IN` — and it is the SAME row selected by the SAME
  // columns, so no judgement below can tell the two apart. It also keeps every caller that asks about one
  // record reading the delegate it has always read: three suites stub `evidence.findMany` locally for other
  // query shapes (`publicPage`'s OR-form and the promoted-names list), and they are cases this chunk must
  // leave green and unedited. DECLARED, because a reader is owed the reason a read has two shapes at all.
  // `.at(0)` rather than `[0]`: it is typed `T | undefined` unconditionally, so this guard is a real one
  // under both debt ratchets — the standing rule where `no-unnecessary-condition` and
  // `noUncheckedIndexedAccess` disagree about reading an element.
  const onlyName = wanted.length === 1 ? wanted.at(0) : undefined;
  const rows =
    onlyName !== undefined
      ? await (async (fileHash: string) => {
          const row = await prisma.evidence.findUnique({ where: { fileHash }, select: EVIDENCE_IDENTITY_SELECT });
          // Keyed by the name ASKED FOR. The row is that name's by construction — it was fetched by it — and a
          // read whose select omitted the column would otherwise key the map by `undefined` and answer nothing.
          return row === null ? [] : [{ ...row, fileHash }];
        })(onlyName)
      : await prisma.evidence.findMany({ where: { fileHash: { in: wanted } }, select: EVIDENCE_IDENTITY_SELECT });
  const byName = new Map(rows.map((row) => [row.fileHash, row]));

  // ONE attribution read for every capture of every row — `storedAttributionFor` is already the plural its own
  // comment describes ("ONE QUERY FOR THE WHOLE PAGE"), and this calls it once instead of once per record.
  const everyCapture = rows.flatMap((row) => {
    if (row.kind === 'CAPTURE') return row.snapshot === null ? [] : [row.snapshot.id];
    const diff = row.urlVersionDiff;
    return diff === null ? [] : [diff.beforeSnapshot.id, diff.afterSnapshot.id];
  });
  const attribution = await storedAttributionFor(everyCapture);

  for (const fileHash of wanted) {
    reports.set(fileHash, verifiedFromRow(byName.get(fileHash) ?? null, attribution));
  }
  return reports;
}

/** One record's VERIFIED, over rows already read — the singular's exact judgement, unchanged. */
function verifiedFromRow(row: EvidenceIdentityRow | null, attribution: Map<string, StoredAttribution>): VerifiedReport {
  // VERIFIED is a property of an EVIDENCE ROW — "RECOMPUTABLE(e) AND ∀ capture
  // …" — so a corpus record nobody promoted has no VERIFIED to report. That is
  // NOT_PROMOTED, and it is not `verified: false`: a record nobody selected has
  // not failed a check, it has not been put to one.
  if (row === null) return { evaluable: false, reason: 'NOT_PROMOTED' };
  if (row.kind === 'DOCUMENT') {
    // A LOUD GUARD for a world no reader creates (Q12): `resolve_record` resolves corpus names only (resolveRecord.ts
    // :82), and `publishable` sends a DOCUMENT row to `verifiedDocumentRow`. Answering a reason here would serve a word.
    throw new Error(
      `evidencePredicates: VERIFIED was asked of ${row.fileHash}, a DOCUMENT row — unreachable: resolveRecord resolves ` +
        'corpus names only, and publishable grades a DOCUMENT row through verifiedDocumentRow, from the chain\'s answer ' +
        'its caller handed in. A document is never graded by the stored-attribution read.',
    );
  }

  // NAMED, never indexed. A record's endpoints are two distinct roles, and a
  // `[0]`/`[1]` pair is where "before" and "after" get swapped by a later edit
  // nobody reads as a swap — the identity would still hash, to the wrong name.
  const held =
    row.kind === 'CAPTURE'
      ? { before: row.snapshot, after: null }
      : { before: row.urlVersionDiff?.beforeSnapshot ?? null, after: row.urlVersionDiff?.afterSnapshot ?? null };
  if (held.before === null || (row.kind === 'DIFF' && held.after === null)) {
    return { evaluable: false, reason: 'MALFORMED_RECORD_KEY' };
  }
  const before = held.before;
  const after = held.after;

  const record: CorpusRecord =
    after === null
      ? {
          kind: 'CAPTURE',
          url: before.trackedUrl.url,
          capture: { waybackTimestamp: nameOf(before), documentHash: before.documentHash },
        }
      : {
          kind: 'DIFF',
          url: before.trackedUrl.url,
          before: { waybackTimestamp: nameOf(before), documentHash: before.documentHash },
          after: { waybackTimestamp: nameOf(after), documentHash: after.documentHash },
        };
  const captures = after === null ? [before] : [before, after];

  const { recomputable: isRecomputable, expected } = recomputable(row.fileHash, record);

  const reported: CaptureAttribution[] = captures.map((c) => {
    const stored = attribution.get(c.id) ?? NEVER_CHECKED;
    return {
      capture: nameOf(c),
      documentHash: c.documentHash,
      anchoredHash: c.anchoredHash,
      anchoredHashMatchesDocumentHash: c.anchoredHash === c.documentHash,
      attributed: stored.attributed,
      verdict: stored.verdict,
      verifierVersion: stored.verifierVersion,
      checkedAt: stored.checkedAt,
    };
  });

  return {
    evaluable: true,
    verified:
      isRecomputable &&
      reported.length > 0 &&
      reported.every((c) => c.attributed === true && c.anchoredHashMatchesDocumentHash),
    recomputable: isRecomputable,
    expected,
    captures: reported,
  };
}

/** A capture's name, or a loud failure — a capture without one has no CAPTURE_ID (A1). */
function nameOf(capture: { waybackTimestamp: string | null } | undefined): string {
  const name = capture?.waybackTimestamp;
  if (name == null) {
    throw new Error(
      'evidencePredicates: a record is keyed to a capture with no waybackTimestamp. A capture ' +
        'without one has no CAPTURE_ID (evidence A1); what a researcher holds of such a page is a ' +
        'DOCUMENT. This is a malformed row, which forensics:audit-evidence reports as RECORD_MISSING.',
    );
  }
  return name;
}

// ---------------------------------------------------------------------------
// FLAGGED — what a published page shows beside a citation (A3).
// ---------------------------------------------------------------------------

/** Which arms of FLAGGED this tree can evaluate, named in every answer. */
export const FLAG_ARMS_EVALUATED = ['WITHDRAWN', 'NOT_CITATION_CURRENT'] as const;
export type FlagReason = (typeof FLAG_ARMS_EVALUATED)[number] | 'AWAITING_DERIVATION';

export interface FlagReport {
  flagged: boolean;
  /**
   * The arms actually asked. SHED — document flows §8's third arm — needs a
   * `Document` table (document step 28) and is NOT among them: a check that
   * examined nothing says so rather than passing (evidence A6's rule for check
   * 17, applied to a predicate).
   */
  armsEvaluated: readonly string[];
  reasons: FlagReason[];
}

/**
 * FLAGGED(m) — m is on a published version AND (the record is WITHDRAWN, OR the
 * citation is not current, OR the record was SHED).
 *
 * The flag is DERIVED ON EVERY READ and never stored: "a platform that silently
 * unpublished would be rewriting its public record; one that stayed silent would
 * be misleading its readers. Flagged, visibly, is the only honest state."
 *
 * A citation whose record is AWAITING_DERIVATION is flagged, with that reason: a
 * published thesis pinning a version the corpus can no longer derive is exactly
 * what a reader must be told about, and `EVIDENCE_DERIVED` (A6) fails it at the
 * gate for the same reason.
 */
export async function flagged(mentionId: string): Promise<FlagReport> {
  const report = (await flaggedFor([mentionId])).get(mentionId);
  if (report === undefined) throw new Error(`flagged: flaggedFor answered nothing for ${mentionId} — the map is total by construction.`);
  return report;
}

const FLAG_MENTION_SELECT = {
  id: true,
  name: true,
  contentVersionHash: true,
  thesisVersion: { select: { isPublished: { select: { id: true } } } },
} as const;

const FLAG_EVIDENCE_SELECT = {
  fileHash: true,
  status: true,
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

type FlagMentionRow = Prisma.ThesisMentionGetPayload<{ select: typeof FLAG_MENTION_SELECT }>;
type FlagEvidenceRow = Prisma.EvidenceGetPayload<{ select: typeof FLAG_EVIDENCE_SELECT }>;

/**
 * FLAGGED FOR A SET OF MENTIONS — the IMPLEMENTATION, which `flagged` above delegates to.
 *
 * TWO QUERIES, whatever the number of mentions: one for the mention rows, one for the evidence rows they name.
 * As with VERIFIED, the plural lives in the predicate's OWN module because evidence A7 :1302–:1303 gives the
 * predicate one importable symbol and evidence A6 :1219 forbids the checks re-deriving it — a fold written
 * inside `publishedThesis.ts` would be the second spelling those clauses exist to refuse.
 *
 * Every arm is decided exactly as the singular decided it: `recordContentOf`, `currentVersionOf`,
 * `citationCurrent` and the reason order are untouched, and `armsEvaluated` still reports the same arms. No
 * verdict is stored or reused — the reads are folded, the predicate is not.
 */
export async function flaggedFor(mentionIds: readonly string[]): Promise<Map<string, FlagReport>> {
  const wanted = [...new Set(mentionIds)];
  const reports = new Map<string, FlagReport>();
  if (wanted.length === 0) return reports;

  // A set of one by its key, for the reason stated in `verifiedFor`: the same row, the same columns, and the
  // delegate every single-mention caller has always read.
  const onlyMention = wanted.length === 1 ? wanted.at(0) : undefined;
  const mentions =
    onlyMention !== undefined
      ? await (async (id: string) => {
          const row = await prisma.thesisMention.findUnique({ where: { id }, select: FLAG_MENTION_SELECT });
          return row === null ? [] : [{ ...row, id }];
        })(onlyMention)
      : await prisma.thesisMention.findMany({ where: { id: { in: wanted } }, select: FLAG_MENTION_SELECT });
  const byId = new Map(mentions.map((mention) => [mention.id, mention]));

  // Only the names of mentions that are actually on a published version can reach an arm, so nothing else is
  // read: an unpublished mention is unflagged before any evidence row is consulted, as it was before.
  const names = [...new Set(mentions.filter((m) => m.thesisVersion.isPublished != null).map((m) => m.name))];
  // A set of one by its key, for the reason `verifiedFor` states above.
  const onlyEvidence = names.length === 1 ? names.at(0) : undefined;
  const evidence =
    names.length === 0
      ? []
      : onlyEvidence !== undefined
        ? await (async (fileHash: string) => {
            const row = await prisma.evidence.findUnique({ where: { fileHash }, select: FLAG_EVIDENCE_SELECT });
            return row === null ? [] : [{ ...row, fileHash }];
          })(onlyEvidence)
        : await prisma.evidence.findMany({ where: { fileHash: { in: names } }, select: FLAG_EVIDENCE_SELECT });
  const byName = new Map(evidence.map((row) => [row.fileHash, row]));

  for (const mentionId of wanted) {
    reports.set(mentionId, flaggedFromRows(byId.get(mentionId) ?? null, byName));
  }
  return reports;
}

/** One mention's FLAGGED, over rows already read — the singular's exact judgement, unchanged. */
function flaggedFromRows(mention: FlagMentionRow | null, byName: Map<string, FlagEvidenceRow>): FlagReport {
  const unflagged: FlagReport = { flagged: false, armsEvaluated: FLAG_ARMS_EVALUATED, reasons: [] };
  if (mention?.thesisVersion.isPublished == null) return unflagged;

  const evidence = byName.get(mention.name) ?? null;
  // A mention of a record with no evidence row is a draft's citation carried onto
  // a published version by nothing this design allows: PUBLISHABLE refuses it at
  // the gate. There is no record here to be withdrawn or to have moved.
  if (evidence === null) return unflagged;

  const reasons: FlagReason[] = [];
  if (evidence.status === 'WITHDRAWN') reasons.push('WITHDRAWN');

  const record = recordContentOf(evidence);
  if (record !== null) {
    const current = currentVersionOf(record);
    const isCurrent = citationCurrent(mention, current);
    if (!isCurrent.evaluable) reasons.push('AWAITING_DERIVATION');
    else if (!isCurrent.value) reasons.push('NOT_CITATION_CURRENT');
  }

  return { flagged: reasons.length > 0, armsEvaluated: FLAG_ARMS_EVALUATED, reasons };
}

/** The loaded evidence row as CURRENT reads it, or null for a DOCUMENT record. */
function recordContentOf(evidence: {
  snapshot: CaptureContent | null;
  urlVersionDiff: {
    beforeSnapshot: CaptureContent;
    afterSnapshot: CaptureContent;
    contentVersions: ContentVersionProvenance[];
  } | null;
}): RecordContent<ContentVersionProvenance> | null {
  if (evidence.snapshot !== null) return { kind: 'CAPTURE', capture: evidence.snapshot };
  if (evidence.urlVersionDiff !== null) {
    return {
      kind: 'DIFF',
      before: evidence.urlVersionDiff.beforeSnapshot,
      after: evidence.urlVersionDiff.afterSnapshot,
      versions: evidence.urlVersionDiff.contentVersions,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// PUBLISHABLE — A3's five clauses, plus the precondition A6 promotes to a check
// of its own (evidence step 15).
//
// A3 :1045-:1048 states FIVE clauses; A6 :1217 states SIX checks, and it is not
// a bijection: the sixth, `DERIVED`, is the PRECONDITION of the fifth — that
// CURRENT is defined at all — promoted so that its failure gets its own
// sentence. A6 :1214 says why in its own words: "the failure says the walk owes
// a version and names the diff, so nobody hunts for a contradiction that does
// not exist."
//
// So the gate is a PROJECTION OF ONE EVALUATION, not a second pass: five clauses
// computed once, six rows rendered from them, and the sixth read off the
// discriminant of the fifth. Any design in which the six checks each re-ask a
// predicate is a design with six chances to ask it differently.
// ---------------------------------------------------------------------------

/** A3's clauses, and A6's promoted precondition, by the name each check reports. */
export type ConjunctId =
  | 'RECORD_PROMOTED' // e exists AND status = PROMOTED
  | 'ARGUED'
  | 'VERIFIED'
  | 'CITATION_CURRENT'
  | 'DERIVED' // CURRENT(e.record) is defined — A6's promoted precondition
  | 'INPUT_SOUND'; // CURRENT's chunks, through check 17's fold

/** The order a report renders them in: A3's clauses, then the precondition. */
const CONJUNCT_ORDER: readonly ConjunctId[] = [
  'RECORD_PROMOTED',
  'ARGUED',
  'VERIFIED',
  'CITATION_CURRENT',
  'DERIVED',
  'INPUT_SOUND',
];

/**
 * WHY a conjunct is not a PASS, as a KEY — never as prose.
 *
 * The FAIL keys BEGIN with `FlagReason`, deliberately: the three reasons FLAGGED
 * names are the three a failure can carry that route to exit 2, and one spelling
 * of them is what lets `audit-theses` ask "does the flag name this failure's
 * reason?" by EQUALITY rather than by a table beside the predicate. The day
 * document step 28 gives FLAGGED its SHED arm, `FlagReason` gains `'SHED'`, this
 * type gains it with it, `DERIVED` renders it — and NOTHING IN THE EXIT FOLD
 * CHANGES, which is §0e's claim made true by a type rather than by a promise.
 *
 * The EXAMINED_NONE keys are the words `verified` and check 17 already use for
 * a conjunct that had no subject, borrowed rather than re-coined.
 */
export type ConjunctReason =
  // FAIL — the keys the exit rule routes on
  | FlagReason
  | 'NO_EVIDENCE_ROW'
  | 'NOT_ARGUED'
  | 'NOT_VERIFIED'
  | 'CHAIN_UNREADABLE'
  | 'INPUT_UNSOUND'
  // EXAMINED_NONE — why nothing was examined
  | 'NOT_PROMOTED'
  | 'MALFORMED_RECORD_KEY'
  | 'CHAIN_NOT_ASKED'
  | 'NOT_DIFF_DERIVED';

export interface Conjunct {
  id: ConjunctId;
  /**
   * PASS · FAIL · EXAMINED_NONE — never a boolean.
   *
   * A6 :1222 and document A6 :1533 forbid a non-binding pass and require a check
   * with no subject to "report that it examined none — a check with no subject,
   * never a pass". Two booleans (`binding`, `passed`) cannot express that: their
   * `(false, true)` state reads as a pass everywhere it is rendered, which is
   * exactly what check 6 did before it was retired with the tier.
   */
  verdict: 'PASS' | 'FAIL' | 'EXAMINED_NONE';
  /**
   * The KEY behind a verdict that is not a PASS; null on a PASS. What a program
   * routes on — `detail` is what a person reads, and nothing compares it.
   */
  reason: ConjunctReason | null;
  /** What a reader is owed when it is not a PASS: the reason, and the hashes or status behind it. */
  detail: string | null;
}

/** The mention examined, and the version it was examined at — A6 :1201-:1202. */
export interface ExaminedMention {
  mentionId: string;
  fileHash: string;
  contentVersionHash: string | null;
}

/**
 * A DISCRIMINATED UNION, as `Current`, `Evaluated` and `VerifiedReport` already
 * are in this module: a document whose VERIFIED(d) the caller did not ask is NOT
 * `publishable: false`.
 *
 * `evaluable: false` IS CONDITIONAL, and the condition is that nothing FAILED:
 *
 *   some conjunct FAILed                    → evaluable: true, publishable: false
 *   no conjunct FAILed, and VERIFIED         → evaluable: false, CHAIN_NOT_ASKED
 *     examined nothing because the caller
 *     did not read the chain for it
 *
 * A DOCUMENT record whose debate is OPEN is therefore `evaluable: true` with
 * `publishable: false`: `ARGUED` and `RECORD_PROMOTED` are kind-independent, so
 * that citation HAS been judged, completely, and reporting "we cannot tell" over
 * one the platform just refused would be the honest word used dishonestly.
 *
 * A MISSING ROW NEVER REACHES `evaluable: false` AT ALL, and it is the same rule
 * rather than an exception to it: `RECORD_PROMOTED` always FAILs there, so the
 * first arm always fires. *There is no row* is a judgement this tree makes
 * completely, and A3 makes it PUBLISHABLE's first clause.
 */
export type PublishableReport =
  | { evaluable: true; examined: ExaminedMention; publishable: boolean; conjuncts: Conjunct[] }
  | {
      evaluable: false;
      examined: ExaminedMention;
      reason: 'CHAIN_NOT_ASKED';
      conjuncts: Conjunct[];
    };

/** The word `verified` refuses a class or a broken row with — borrowed, never re-coined. */
type NotEvaluableReason = 'NOT_PROMOTED' | 'MALFORMED_RECORD_KEY' | 'CHAIN_NOT_ASKED';

const EXAMINED_NONE_DETAIL: Record<NotEvaluableReason | 'NOT_DIFF_DERIVED' | 'AWAITING_DERIVATION', string> = {
  NOT_PROMOTED:
    'NOT_PROMOTED — no evidence row names this record. A record nobody selected has not failed a ' +
    'check, it has not been put to one; RECORD_PROMOTED is the conjunct that answers it.',
  MALFORMED_RECORD_KEY:
    'MALFORMED_RECORD_KEY — the row names a record key the corpus cannot resolve. ' +
    'forensics:audit-evidence reports it; it is a write defect, not a verdict about the citation.',
  CHAIN_NOT_ASKED:
    'CHAIN_NOT_ASKED — VERIFIED(d) needs ANCHORED(d), a chain read (document flows A3 :1366), and this caller did not ' +
    'read the chain for the document. Not graded — never "not verified"; publish_thesis and check_publication_readiness ask.',
  NOT_DIFF_DERIVED:
    'NOT_DIFF_DERIVED — check 17 judges the chunks of CURRENT(diff), and this record names no diff, ' +
    'so it examined none. A check with no subject, never a check that passed.',
  AWAITING_DERIVATION:
    'AWAITING_DERIVATION — CURRENT is not defined, so a pin cannot be compared against it. The walk ' +
    'owes this diff a version; DERIVED is the conjunct that says so.',
};

/**
 * VERIFIED(d) FOR THE DOCUMENTS A VERSION CITES — the chain's answer, read by the CALLER and handed in (the researcher's
 * Q1, 2026-09-26, `R84-review-state.md` Entry 3). ANCHORED(d) is a chain read (document A3 :1366) and this module reads
 * no chain; the research acts that load it must reach none either (`test/researchActsReachNoChain.test.ts`). So the TYPE
 * says whether the caller asked:
 *
 *   { asked: false }                     the caller did not read the chain — every DOCUMENT mention is NOT EVALUABLE,
 *                                         CHAIN_NOT_ASKED, and the fold refuses to call the version publishable
 *   { asked: true, byCommitment }        per cited commitment: `{ verified }` — VERIFIED(d) as read — or `{ unread }`,
 *                                         the chain could not be read: a FAIL that NAMES THE OUTAGE (Q1 (ii); §4 :447)
 *
 * `documentStanding.verifiedOf` is the one reader; `publish_thesis` and `check_publication_readiness` ask it.
 */
export type DocumentVerified = { verified: boolean } | { unread: string };
export type DocumentVerification = { asked: false } | { asked: true; byCommitment: ReadonlyMap<string, DocumentVerified> };
export const NOT_ASKED: DocumentVerification = { asked: false };

/**
 * PUBLISHABLE(m) — the report, one `Conjunct` per clause, every one a CALL.
 *
 * FIVE ROUND TRIPS PER MENTION, DECLARED. Two are this function's — the mention
 * with its debate, and the record's PROVENANCE (never its chunks) — and three are
 * the price of CALLING rather than re-spelling: `verified` re-reads the row and
 * reads the stored attribution, and `assessEvidenceInputSoundness` reads the row
 * a third time for its chunks. That is the cost A6 :1217 asks for in terms, and
 * it is bounded in a way a public read is not: the gate runs once per publication
 * attempt, over a handful of mentions, for a researcher who asked.
 *
 * `assessEvidenceInputSoundness` IS CALLED EVEN FOR A CAPTURE. Check 17's scope
 * rule — "names a diff, NOT typed FORENSIC_DIFF" — lives in that module, and
 * deciding here that a capture need not be asked would put one rule in two files.
 * One query is cheaper than one more copy of a rule.
 *
 * A DOCUMENT ROW — DOCUMENT STEP 34 (document A6 :1529–:1534; the non-binding arm FELL, plan :273–:274). RECORD_PROMOTED
 * and ARGUED are kind-independent, unchanged. VERIFIED is RECOMPUTABLE(e)'s third arm (`recomputableEvidence`, document
 * A3 :1364–:1365) AND VERIFIED(d) from `verification`. CURRENT is CURRENT(d), loaded through `documentCitation` — the one
 * loader — and handed to evidence's own `citationCurrent` in evidence's `Current` shape, so DERIVED and CITATION_CURRENT
 * are these predicates, CALLED. INPUT_SOUND examines none: check 17 judges a diff's chunks (A6 :1533), NOT_DIFF_DERIVED.
 */
export async function publishable(mentionId: string, verification: DocumentVerification = NOT_ASKED): Promise<PublishableReport> {
  const mention = await prisma.thesisMention.findUnique({
    where: { id: mentionId },
    select: {
      id: true,
      name: true,
      versionId: true,
      contentVersionHash: true,
      debateSessionId: true,
      thesisVersion: { select: { thesisId: true } },
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true } },
    },
  });
  // A LOUD GUARD, NOT A VERDICT. Every field of the report names the mention it
  // examined (A6 :1201), so a mention that does not exist has no report to be
  // the subject of — the shape cannot be built. `publishableEvidence` passes ids
  // it has just read, so this is a malformed call rather than an answerable
  // state, and it is the `nameOf` / `promotionBlockers` shape: throw naming the
  // subject rather than choose a verdict for a citation that is not there.
  if (mention === null) {
    throw new Error(
      `evidencePredicates: no ThesisMention ${mentionId}. PUBLISHABLE is a question about a ` +
        'citation, and every check it renders names the mention it examined; a mention that does ' +
        'not exist is a malformed call, not a citation that failed.',
    );
  }

  // PROVENANCE ONLY. `chunks` is NOT selected: `assessEvidenceInputSoundness`
  // does its own `findMany` for them, so loading them here would be either dead
  // or the beginning of a second spelling of the last clause.
  const row = await prisma.evidence.findUnique({
    where: { fileHash: mention.name },
    select: {
      fileHash: true,
      kind: true,
      status: true,
      documentCommitment: true,
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
    },
  });

  const examined: ExaminedMention = {
    mentionId: mention.id,
    fileHash: mention.name,
    contentVersionHash: mention.contentVersionHash,
  };

  const verdicts = new Map<ConjunctId, Conjunct>();
  // THE REASON IS A REQUIRED ARGUMENT, so a FAIL rendered without one does not
  // compile: the rule "every FAIL carries its key" is held by the type checker at
  // every site, rather than by whoever next adds a branch remembering it.
  const say = (
    id: ConjunctId,
    verdict: Conjunct['verdict'],
    detail: string | null,
    reason: ConjunctReason | null,
  ): void => {
    verdicts.set(id, { id, verdict, reason, detail });
  };
  const examinedNone = (id: ConjunctId, reason: keyof typeof EXAMINED_NONE_DETAIL): void => {
    say(id, 'EXAMINED_NONE', EXAMINED_NONE_DETAIL[reason], reason);
  };

  // RECORD_PROMOTED — A3's first clause: the row EXISTS and its status is
  // PROMOTED. The one conjunct answerable without a record, and the only one
  // that fails on a missing row.
  if (row === null) {
    say('RECORD_PROMOTED', 'FAIL', 'No evidence row names this record: nobody has promoted it.', 'NO_EVIDENCE_ROW');
  } else if (row.status === 'PROMOTED') {
    say('RECORD_PROMOTED', 'PASS', null, null);
  } else {
    say(
      'RECORD_PROMOTED',
      'FAIL',
      `The record is ${row.status}, and a withdrawn record is not cited afresh.`,
      'WITHDRAWN',
    );
  }

  // ARGUED — kind-independent and row-independent, so it is computed in every
  // arm: a reader is owed what was actually asked.
  const isArgued = argued({
    name: mention.name,
    thesisId: mention.thesisVersion.thesisId,
    debate: mention.debateSession,
  });
  say(
    'ARGUED',
    isArgued ? 'PASS' : 'FAIL',
    isArgued
      ? null
      : mention.debateSession === null
        ? 'This citation references no debate: nobody has argued for it on this thesis.'
        : `Its debate is ${mention.debateSession.status} for record ${mention.debateSession.recordFileHash} ` +
          `on thesis ${mention.debateSession.thesisId}; an argument is PROMOTED, for this record and this thesis.`,
    isArgued ? null : 'NOT_ARGUED',
  );

  // VERIFIED, DERIVED and CITATION_CURRENT — by the row's kind. `current` is the one `Current` both of the last two read,
  // or null where no record could be resolved, with the word that says why.
  let current: Current<ContentVersionProvenance> | null = null;
  let unresolved: NotEvaluableReason = 'NOT_PROMOTED';
  if (row?.kind === 'DOCUMENT') {
    current = await verifiedDocumentRow(row, mention, verification, say, examinedNone);
  } else {
    // VERIFIED — the async predicate, reading the stored attribution verdict. Its
    // own discriminated union carries the word for a class it cannot answer for,
    // and that word is borrowed here rather than re-coined.
    const verification = await verified(mention.name);
    if (!verification.evaluable) {
      examinedNone('VERIFIED', verification.reason);
    } else if (verification.verified) {
      say('VERIFIED', 'PASS', null, null);
    } else {
      const unattributed = verification.captures.filter((c) => c.attributed !== true).map((c) => c.capture);
      const mismatched = verification.captures
        .filter((c) => !c.anchoredHashMatchesDocumentHash)
        .map((c) => c.capture);
      say(
        'VERIFIED',
        'FAIL',
        [
          verification.recomputable ? null : `the row's name is not the record's: the record names ${verification.expected}`,
          unattributed.length === 0 ? null : `no stored attribution for ${unattributed.join(', ')}`,
          mismatched.length === 0 ? null : `the anchored hash is not the document hash for ${mismatched.join(', ')}`,
        ]
          .filter((part): part is string => part !== null)
          .join('; '),
        'NOT_VERIFIED',
      );
    }

    // DERIVED and CITATION_CURRENT — over the SAME `RecordContent` shape `flagged`
    // builds, through the module's own functions. `recordContentOf` returns null
    // for a row with no key at all, and `verified` has already named it.
    const content = row === null ? null : recordContentOf(row);
    if (content !== null) current = currentVersionOf(content);
    else if (row !== null) unresolved = verification.evaluable ? 'MALFORMED_RECORD_KEY' : verification.reason;
  }

  if (current === null) {
    examinedNone('DERIVED', unresolved);
    examinedNone('CITATION_CURRENT', unresolved);
  } else {
    if (current.defined) {
      say('DERIVED', 'PASS', null, null);
    } else {
      say(
        'DERIVED',
        'FAIL',
        row?.kind === 'DOCUMENT'
          ? `CURRENT(d) is not defined for document ${mention.name}: the derivation pass owes it a version under the ` +
              'current extractor, and until it has one there is no content for a citation to name.'
          : `CURRENT is not defined for record ${mention.name}: the walk owes this diff a version, and ` +
              'until it has one there is no content for a citation to name.',
        current.reason,
      );
    }
    const pinned = citationCurrent(mention, current);
    if (!pinned.evaluable) {
      // A pin cannot be compared against a version that does not exist — the one
      // EXAMINED_NONE arm that is about the record's CONTENT rather than its
      // class or its absence.
      examinedNone('CITATION_CURRENT', 'AWAITING_DERIVATION');
    } else if (pinned.value) {
      say('CITATION_CURRENT', 'PASS', null, null);
    } else {
      say(
        'CITATION_CURRENT',
        'FAIL',
        `The citation pins ${String(mention.contentVersionHash)} and CURRENT is ` +
          `${current.defined ? current.contentVersionHash : 'undefined'}.`,
        'NOT_CITATION_CURRENT',
      );
    }
  }

  // INPUT_SOUND — check 17, called for every record and answered from ITS row.
  // The scope decision is read from what that module returned, never re-made
  // here: a record it did not judge has `urlVersionDiffId` null on its own row,
  // and a hash it holds no row for is one its rule at :185-:188 leaves to check 5.
  // A DOCUMENT names no diff: NOT_DIFF_DERIVED, "a check with no subject, never a pass" (document A6 :1533).
  const soundness = await assessEvidenceInputSoundness([mention.name]);
  const judged = soundness.rows.find((r) => r.fileHash === mention.name);
  if (judged === undefined) {
    examinedNone('INPUT_SOUND', 'NOT_PROMOTED');
  } else if (judged.urlVersionDiffId === null) {
    examinedNone('INPUT_SOUND', 'NOT_DIFF_DERIVED');
  } else if (judged.unsoundReason !== undefined) {
    say(
      'INPUT_SOUND',
      'FAIL',
      judged.unsoundReason,
      judged.survival?.state === 'AWAITING_DERIVATION' ? 'AWAITING_DERIVATION' : 'INPUT_UNSOUND',
    );
  } else {
    say('INPUT_SOUND', 'PASS', null, null);
  }

  const conjuncts = CONJUNCT_ORDER.map((id) => {
    const held = verdicts.get(id);
    if (held === undefined) {
      throw new Error(`evidencePredicates: PUBLISHABLE rendered no verdict for ${id}.`);
    }
    return held;
  });

  const failed = conjuncts.some((c) => c.verdict === 'FAIL');
  const notAsked = conjuncts.some((c) => c.verdict === 'EXAMINED_NONE' && c.reason === 'CHAIN_NOT_ASKED');
  if (!failed && notAsked) {
    return { evaluable: false, examined, reason: 'CHAIN_NOT_ASKED', conjuncts };
  }
  return { evaluable: true, examined, publishable: !failed, conjuncts };
}

/**
 * VERIFIED over a DOCUMENT row, said through the caller's `say` — and CURRENT(d) in evidence's `Current` shape for the
 * two conjuncts that read it. RECOMPUTABLE(e)'s third arm first (a row whose name is not its document's commitment is
 * malformed whatever the chain says), then the handed-in VERIFIED(d).
 *
 * TWO LOUD GUARDS, each a world no clause creates: a DOCUMENT row naming no document (`Evidence_one_record_key` and its
 * foreign key to `Document` forbid it — the message names the version, so an operational run exits on it naming what to
 * look at), and a caller that ASKED but handed no answer for a commitment its own head cites (the tools ask with exactly
 * the head's documents). A SHED document is step 35's (`documentShedNotBuilt`).
 */
async function verifiedDocumentRow(
  row: { fileHash: string; documentCommitment: string | null },
  mention: { id: string; versionId: string },
  verification: DocumentVerification,
  say: (id: ConjunctId, verdict: Conjunct['verdict'], detail: string | null, reason: ConjunctReason | null) => void,
  examinedNone: (id: ConjunctId, reason: keyof typeof EXAMINED_NONE_DETAIL) => void,
): Promise<Current<ContentVersionProvenance>> {
  const commitment = row.documentCommitment;
  const cited = commitment === null ? undefined : (await documentsByCommitment([commitment])).get(commitment);
  if (commitment === null || cited === undefined) {
    throw new Error(
      `evidencePredicates: mention ${mention.id} of version ${mention.versionId} cites ${row.fileHash}, a DOCUMENT ` +
        'row naming no document — Evidence_one_record_key and its foreign key to Document forbid it, so the row was written wrong.',
    );
  }
  if ('shed' in cited.current) throw documentShedNotBuilt(commitment);

  if (!recomputableEvidence(row.fileHash, cited.document)) {
    say('VERIFIED', 'FAIL', `the row's name is not the document's commitment (${commitment}) — RECOMPUTABLE(e) fails`, 'NOT_VERIFIED');
  } else if (!verification.asked) {
    examinedNone('VERIFIED', 'CHAIN_NOT_ASKED');
  } else {
    const answer = verification.byCommitment.get(commitment);
    if (answer === undefined) {
      throw new Error(
        `evidencePredicates: the caller asked the chain for the version's documents and handed no answer for ${commitment}, ` +
          `which mention ${mention.id} cites — the tools ask with exactly the head's documents, so the set is malformed.`,
      );
    }
    if ('unread' in answer) {
      say(
        'VERIFIED',
        'FAIL',
        `the chain could not be read for document ${commitment}: ${answer.unread}. This is an outage, not a verdict — ` +
          'ANCHORED(d) reads false until the chain answers (document flows §4 :447); ask again when it does.',
        'CHAIN_UNREADABLE',
      );
    } else if (answer.verified) {
      say('VERIFIED', 'PASS', null, null);
    } else {
      say('VERIFIED', 'FAIL', `VERIFIED(d) is false for document ${commitment}: RECOMPUTABLE(d) AND ANCHORED(d) (document A3 :1367)`, 'NOT_VERIFIED');
    }
  }
  return evidenceCurrentOf(cited.current);
}

/**
 * A3 :1048 — "a thesis version is publishable iff every EVIDENCE mention is."
 *
 * IT IS NOT `publishableVersion`, AND THE NAME MATTERS. Thesis A3 owns
 * `PUBLISHABLE(v)` for the WHOLE gate — these six checks AND TRAJECTORY_CURRENT,
 * CLAIM_FRAMED, CURRENT_ANALYSIS, GAPS_DECIDED, the public-interest statement and
 * the assessor's two answers — and thesis A7's own one-symbol scan names
 * `PUBLISHABLE(v)` in its list. A `publishableVersion` in the evidence layer
 * would be a second symbol for a predicate another layer already owns, arriving
 * as a name. This is the EVIDENCE HALF, and it says so; thesis step 23's
 * `PUBLISHABLE(v)` calls it as its first conjunct and adds its own.
 *
 * `mentionsExamined` PRECEDES the verdict in the shape, which is 11b's rule: an
 * instrument over an empty subject set is honest only when the count comes before
 * the answer. A version with no EVIDENCE mention folds vacuously true — A6 :1203
 * assigns that failure to `CITES_EVIDENCE`, which is thesis A6's check 3 and
 * thesis step 23's, so this fold does not steal it.
 *
 * IT FOLDS OVER `EVIDENCE` AND `DOCUMENT` MENTIONS SINCE DOCUMENT STEP 34 (document A6 :1524–:1525: "Evidence A6's six
 * checks bind on a DOCUMENT mention"). Before it the fold read EVIDENCE only, so a document citation went ungraded by
 * rows 5–10 — an unasked question presented as an answer. `verification` is the chain's answer for the cited documents,
 * handed to each mention's `publishable` (Q1).
 */
export type VersionPublishableReport =
  | {
      evaluable: true;
      versionId: string;
      mentionsExamined: number;
      publishable: boolean;
      mentions: PublishableReport[];
    }
  | {
      evaluable: false;
      versionId: string;
      mentionsExamined: number;
      reason: 'CHAIN_NOT_ASKED';
      notEvaluable: ExaminedMention[];
      mentions: PublishableReport[];
    };

export async function publishableEvidence(
  versionId: string,
  verification: DocumentVerification = NOT_ASKED,
): Promise<VersionPublishableReport> {
  const mentions = await prisma.thesisMention.findMany({
    where: { versionId, kind: { in: ['EVIDENCE', 'DOCUMENT'] } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const reports: PublishableReport[] = [];
  for (const mention of mentions) reports.push(await publishable(mention.id, verification));

  const notEvaluable = reports.filter((r) => !r.evaluable).map((r) => r.examined);
  if (notEvaluable.length > 0) {
    // ANY non-evaluable mention makes the VERSION non-evaluable, by the same
    // reasoning one level up: the answer is not known, and asserting either
    // verdict over it would be the platform claiming a check it never made.
    return {
      evaluable: false,
      versionId,
      mentionsExamined: mentions.length,
      reason: 'CHAIN_NOT_ASKED',
      notEvaluable,
      mentions: reports,
    };
  }
  return {
    evaluable: true,
    versionId,
    mentionsExamined: mentions.length,
    publishable: reports.every((r) => r.evaluable && r.publishable),
    mentions: reports,
  };
}
