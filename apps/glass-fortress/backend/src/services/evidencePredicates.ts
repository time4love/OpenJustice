import { prisma } from '../lib/prisma';
import { DIFF_VERSION } from '../lib/diffVersion';
import { ON_CHAIN_CHECK_VERSION } from '../lib/onChainVerdict';
import { recordId, type RecordId, type Record as CorpusRecord } from '../lib/evidenceIdentity';

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
// WHAT IS NOT HERE, AND WHOSE IT IS. `publishable` is step 15's and composes
// ARGUED, VERIFIED, CITATION_CURRENT and the survival of CURRENT; it cannot be
// honest before the gate that consumes it exists, and adding a stub would turn a
// failing test into a passing one that asserts nothing. `argued` arrived at
// evidence step 13 with the debate that gives it a subject.
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
