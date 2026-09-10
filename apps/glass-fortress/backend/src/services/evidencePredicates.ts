import { prisma } from '../lib/prisma';
import { DIFF_VERSION } from '../lib/diffVersion';
import { ON_CHAIN_CHECK_VERSION } from '../lib/onChainVerdict';
import { recordId, type RecordId, type Record as CorpusRecord } from '../lib/evidenceIdentity';
import { normaliseForPresence } from '../lib/htmlText';
import { assessEvidenceInputSoundness } from './evidenceInputSoundness';

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
 */
export type Current<V extends ContentVersionProvenance> =
  | { defined: true; kind: 'CAPTURE'; contentVersionHash: string }
  | { defined: true; kind: 'DIFF'; contentVersionHash: string; version: V }
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
  /** The record the citation names — `ThesisMention.refId` under this schema. */
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
 * PUBLIC_PAGE(page) — a page is public in full from the moment a published
 * thesis version cites any record of it.
 *
 * "Publication opens the PAGE, not the record … every capture and every diff,
 * selected or not, which is what makes the counterweight of §1 real for an
 * outsider." A page no published thesis touches is a researcher's working
 * corpus, and saying otherwise in public is the framing risk §9.5 ranks first.
 *
 * ⚠️ THE "EVER PUBLISHED" ARM IS OWED TO THE THESIS STEPS. Thesis T6 amends this
 * predicate to hold for a page any version EVER published cited — "opened pages
 * stay open" — which reads `Withdrawal` rows and superseded publications. This
 * tree has neither: thesis A2's `Withdrawal` lands at thesis step 24, and no act
 * here can move `Thesis.publishedVersionId` at all (there is no writer of it
 * under `src/`, and `publish_thesis`/`unpublish_thesis` are on the retired-names
 * scan until thesis step 23). So the two readings cannot yet differ, and the arm
 * is held by a RED CASE BY NAME in the acceptance suite rather than by this
 * comment.
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

  const citedByAPublishedVersion = await prisma.thesisMention.count({
    where: {
      type: 'EVIDENCE',
      refId: { in: records.map((r) => r.fileHash) },
      // The version IS the published one of its thesis — `isPublished` is the
      // back-relation of `Thesis.publishedVersionId`, so this is the pin itself
      // rather than a status anyone could set separately.
      thesisVersion: { isPublished: { isNot: null } },
    },
  });
  return citedByAPublishedVersion > 0;
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
 * VERIFIED, or the reason it cannot be asked of this row.
 *
 * A DOCUMENT record is not `verified: false` — VERIFIED(d) is document flows §4
 * (RECOMPUTABLE by custody mode AND ANCHORED over the commitment) and needs a
 * `Document` table that document step 28 builds. Answering `false` for a class
 * whose predicate does not exist yet would be this platform asserting something
 * it never checked.
 */
export type VerifiedReport =
  | {
      evaluable: true;
      verified: boolean;
      recomputable: boolean;
      expected: RecordId;
      captures: CaptureAttribution[];
    }
  | { evaluable: false; reason: 'NOT_PROMOTED' | 'MALFORMED_RECORD_KEY' | 'DOCUMENT_CLASS_NOT_BUILT' };

const CAPTURE_IDENTITY = {
  id: true,
  waybackTimestamp: true,
  documentHash: true,
  anchoredHash: true,
  trackedUrl: { select: { url: true } },
} as const;

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
  const row = await prisma.evidence.findUnique({
    where: { fileHash },
    select: {
      fileHash: true,
      kind: true,
      snapshot: { select: CAPTURE_IDENTITY },
      urlVersionDiff: {
        select: {
          beforeSnapshot: { select: CAPTURE_IDENTITY },
          afterSnapshot: { select: CAPTURE_IDENTITY },
        },
      },
    },
  });
  // VERIFIED is a property of an EVIDENCE ROW — "RECOMPUTABLE(e) AND ∀ capture
  // …" — so a corpus record nobody promoted has no VERIFIED to report. That is
  // NOT_PROMOTED, and it is not `verified: false`: a record nobody selected has
  // not failed a check, it has not been put to one.
  if (row === null) return { evaluable: false, reason: 'NOT_PROMOTED' };
  if (row.kind === 'DOCUMENT') return { evaluable: false, reason: 'DOCUMENT_CLASS_NOT_BUILT' };

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
  const attribution = await storedAttributionFor(captures.map((c) => c.id));

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
  const mention = await prisma.thesisMention.findUnique({
    where: { id: mentionId },
    select: {
      refId: true,
      contentVersionHash: true,
      thesisVersion: { select: { isPublished: { select: { id: true } } } },
    },
  });
  const unflagged: FlagReport = { flagged: false, armsEvaluated: FLAG_ARMS_EVALUATED, reasons: [] };
  if (mention?.thesisVersion.isPublished == null) return unflagged;

  const evidence = await prisma.evidence.findUnique({
    where: { fileHash: mention.refId },
    select: {
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
    },
  });
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
  | 'INPUT_UNSOUND'
  // EXAMINED_NONE — why nothing was examined
  | 'NOT_PROMOTED'
  | 'MALFORMED_RECORD_KEY'
  | 'DOCUMENT_CLASS_NOT_BUILT'
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
 * are in this module: a record whose CLASS has no predicate yet is NOT
 * `publishable: false`.
 *
 * `evaluable: false` IS CONDITIONAL, and the condition is that nothing FAILED:
 *
 *   some conjunct FAILed                    → evaluable: true, publishable: false
 *   no conjunct FAILed, and one examined     → evaluable: false
 *     nothing because its CLASS has no
 *     predicate yet
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
      reason: 'DOCUMENT_CLASS_NOT_BUILT';
      conjuncts: Conjunct[];
    };

/** The word `verified` refuses a class or a broken row with — borrowed, never re-coined. */
type NotEvaluableReason = 'NOT_PROMOTED' | 'MALFORMED_RECORD_KEY' | 'DOCUMENT_CLASS_NOT_BUILT';

const EXAMINED_NONE_DETAIL: Record<NotEvaluableReason | 'NOT_DIFF_DERIVED' | 'AWAITING_DERIVATION', string> = {
  NOT_PROMOTED:
    'NOT_PROMOTED — no evidence row names this record. A record nobody selected has not failed a ' +
    'check, it has not been put to one; RECORD_PROMOTED is the conjunct that answers it.',
  MALFORMED_RECORD_KEY:
    'MALFORMED_RECORD_KEY — the row names a record key the corpus cannot resolve. ' +
    'forensics:audit-evidence reports it; it is a write defect, not a verdict about the citation.',
  DOCUMENT_CLASS_NOT_BUILT:
    'DOCUMENT_CLASS_NOT_BUILT — VERIFIED, CURRENT and derivation are defined for a document by ' +
    'document flows §3 and §4, and the class gets its table and its predicates at document step 28.',
  NOT_DIFF_DERIVED:
    'NOT_DIFF_DERIVED — check 17 judges the chunks of CURRENT(diff), and this record names no diff, ' +
    'so it examined none. A check with no subject, never a check that passed.',
  AWAITING_DERIVATION:
    'AWAITING_DERIVATION — CURRENT is not defined, so a pin cannot be compared against it. The walk ' +
    'owes this diff a version; DERIVED is the conjunct that says so.',
};

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
 */
export async function publishable(mentionId: string): Promise<PublishableReport> {
  const mention = await prisma.thesisMention.findUnique({
    where: { id: mentionId },
    select: {
      id: true,
      refId: true,
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
    where: { fileHash: mention.refId },
    select: {
      fileHash: true,
      kind: true,
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
    },
  });

  const examined: ExaminedMention = {
    mentionId: mention.id,
    fileHash: mention.refId,
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
    name: mention.refId,
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

  // VERIFIED — the async predicate, reading the stored attribution verdict. Its
  // own discriminated union carries the word for a class it cannot answer for,
  // and that word is borrowed here rather than re-coined.
  const verification = await verified(mention.refId);
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
  // for a DOCUMENT row and for a row with no key at all, and `verified` has
  // already named which of the two this is: keying both on its word is what
  // makes the three arms agree by construction rather than by three decisions.
  const content = row === null ? null : recordContentOf(row);
  if (row === null) {
    examinedNone('DERIVED', 'NOT_PROMOTED');
    examinedNone('CITATION_CURRENT', 'NOT_PROMOTED');
  } else if (content === null) {
    const reason: NotEvaluableReason = verification.evaluable ? 'MALFORMED_RECORD_KEY' : verification.reason;
    examinedNone('DERIVED', reason);
    examinedNone('CITATION_CURRENT', reason);
  } else {
    const current = currentVersionOf(content);
    if (current.defined) {
      say('DERIVED', 'PASS', null, null);
    } else {
      say(
        'DERIVED',
        'FAIL',
        `CURRENT is not defined for record ${row.fileHash}: the walk owes this diff a version, and ` +
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
  const soundness = await assessEvidenceInputSoundness([mention.refId]);
  const judged = soundness.rows.find((r) => r.fileHash === mention.refId);
  if (judged === undefined) {
    examinedNone('INPUT_SOUND', 'NOT_PROMOTED');
  } else if (judged.urlVersionDiffId === null) {
    examinedNone('INPUT_SOUND', row?.kind === 'DOCUMENT' ? 'DOCUMENT_CLASS_NOT_BUILT' : 'NOT_DIFF_DERIVED');
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
  const classNotBuilt = conjuncts.some(
    (c) => c.verdict === 'EXAMINED_NONE' && c.reason === 'DOCUMENT_CLASS_NOT_BUILT',
  );
  if (!failed && classNotBuilt) {
    return { evaluable: false, examined, reason: 'DOCUMENT_CLASS_NOT_BUILT', conjuncts };
  }
  return { evaluable: true, examined, publishable: !failed, conjuncts };
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
 * IT FOLDS OVER `EVIDENCE` MENTIONS TODAY AND OVER `EVIDENCE`-OR-`DOCUMENT` FROM
 * DOCUMENT STEP 28, when document A6 amends `CITES_EVIDENCE`. A fold that
 * silently skipped DOCUMENT mentions would report a version publishable while a
 * document citation went ungraded — not a wrong answer, an unasked question
 * presented as an answer — so the line is named here rather than left to be
 * found.
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
      reason: 'DOCUMENT_CLASS_NOT_BUILT';
      notEvaluable: ExaminedMention[];
      mentions: PublishableReport[];
    };

export async function publishableEvidence(versionId: string): Promise<VersionPublishableReport> {
  const mentions = await prisma.thesisMention.findMany({
    where: { thesisVersionId: versionId, type: 'EVIDENCE' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  const reports: PublishableReport[] = [];
  for (const mention of mentions) reports.push(await publishable(mention.id));

  const notEvaluable = reports.filter((r) => !r.evaluable).map((r) => r.examined);
  if (notEvaluable.length > 0) {
    // ANY non-evaluable mention makes the VERSION non-evaluable, by the same
    // reasoning one level up: the answer is not known, and asserting either
    // verdict over it would be the platform claiming a check it never made.
    return {
      evaluable: false,
      versionId,
      mentionsExamined: mentions.length,
      reason: 'DOCUMENT_CLASS_NOT_BUILT',
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
