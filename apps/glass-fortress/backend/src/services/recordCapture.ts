import { prisma } from '../lib/prisma';
import { rulesetForCapture } from './rulesetForCapture';
import { deriveText, sha256Bytes, sha256Text } from '../lib/captureDocument';
import { CaptureProvenance } from '@prisma/client';
import { registerSnapshotOnChain, type SnapshotAnchorOutcome } from './anchorSnapshots';
import {
  ANCHORABLE_CAPTURE_SELECT,
  type AnchorableCapture,
} from '../lib/anchoredCaptureHash';

/**
 * The one way a capture is written.
 *
 * Level 1 of docs/gf-factual-layer-rebuild-dev-plan.md. Two properties matter,
 * and neither survives being spread across call sites:
 *
 *   1. A capture holds the document it was extracted from. `document` is a
 *      required parameter, so no code path can construct an incomplete capture
 *      — the schema's NOT NULL is the backstop, not the control.
 *
 *   2. "Is this capture new?" has exactly ONE answer. Before this module there
 *      were three, and they disagreed: CDX's server-side `collapse=digest`
 *      (consecutive only), WaybackScraper's client-side `seenDigests` set (any
 *      repeat within one batch of 50), and the write path itself, which keyed
 *      on (trackedUrlId, waybackTimestamp) and was digest-blind. The middle one
 *      discarded 11 real captures of the staging corpus; a twelfth survived
 *      only because a CDX page boundary happened to separate it from its twin.
 *      Whether a page state was recorded therefore depended on pagination.
 */
export interface RecordCaptureInput {
  trackedUrlId: string;
  provenance: CaptureProvenance;
  /** When the capture was TAKEN. Derived from waybackTimestamp for archived captures. */
  capturedAt: Date;
  /** The Archive's identifier. Present only when provenance is WAYBACK. */
  waybackTimestamp?: string;
  /** Where this was fetched from — Wayback canonical URL, or the live URL. */
  sourceUrl: string;
  /**
   * THE PAYLOAD AS FETCHED. Bytes, never a decoded or filtered view of them.
   *
   * Typed `Buffer` rather than `string` so the compiler refuses the mistake that
   * reopened this level: a caller cannot hand text here and have it stored under
   * the name of the document.
   */
  document: Buffer;
  /** The Content-Type header verbatim — what makes the bytes decodable later. */
  documentContentType?: string | null;
  /**
   * The Content-Encoding header verbatim.
   *
   * `document` is the payload AS SERVED, so this is what says how to read it.
   * Both headers are stored on the same rule: keep every response header without
   * which the bytes cannot be interpreted.
   */
  documentContentEncoding?: string | null;
  /** Readability's article view of that same payload. */
  extraction: string;
}

/** The verdict of comparing a refetched payload against the stored one. */
export type DocumentComparison = 'MATCHES' | 'DIVERGED' | 'UNAVAILABLE';

export interface RecordedCapture {
  id: string;
  waybackTimestamp: string | null;
  capturedAt: Date;
  /** SHA-256(extraction) — what the chain currently attests to. */
  contentHash: string;
  /** SHA-256 of the payload, whole and untruncated. */
  documentHash: string;
  /** SHA-256 of the derived normalised text — the novelty and diffing key. */
  textHash: string;
  /**
   * Whether the payload just fetched matches the one already stored.
   *
   * `DIVERGED` is a finding rather than an error: either the Archive's own copy
   * changed or our fetch is faulty, and stored bytes are never rewritten on the
   * strength of it. `UNAVAILABLE` means the comparison could not be made — a row
   * predating the payload column — and is deliberately NOT collapsed into
   * `MATCHES`, per §3: UNAVAILABLE is a verdict about a CHECK, never about data.
   *
   * Always `MATCHES` on CREATED and UNCHANGED, where nothing was compared
   * because nothing conflicting was stored. Persisting the verdict waits on §3's
   * open decision about where check results live.
   */
  documentComparison: DocumentComparison;
  /**
   * Why this call did not create a row.
   *
   * `UNCHANGED` — identical to the immediately preceding capture.
   * `EXISTS`    — already recorded; a resumed scan re-reaching the same capture.
   */
  outcome: 'CREATED' | 'UNCHANGED' | 'EXISTS';
  /**
   * How anchoring resolved — present only when an attempt was made.
   *
   * Anchoring stays fire-and-forget for the scanner: a chain hiccup must not
   * fail a write that already holds the irreplaceable half, and the scanner
   * ignores this field exactly as before. A maintenance run may AWAIT it to
   * report what actually happened per capture, which is otherwise unobservable
   * — the outcome was previously logged and discarded.
   *
   * The promise never rejects (see registerSnapshotOnChain), so ignoring it
   * cannot produce an unhandled rejection. `null` resolves when the attempt
   * itself failed, as distinct from an attempt that reached a conclusion.
   */
  anchoring?: Promise<SnapshotAnchorOutcome | null>;
}

/**
 * Prisma's unique-constraint violation, identified by code rather than message.
 *
 * `instanceof PrismaClientKnownRequestError` is avoided deliberately: it fails
 * when more than one @prisma/client instance is resolved, which is exactly the
 * condition a monorepo with workspace hoisting can produce, and it would fail
 * OPEN here — turning a lost race into a thrown scan.
 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

/**
 * Anchor, and guarantee the returned promise never rejects.
 *
 * `RecordedCapture.anchoring` is handed to callers who may ignore it — the
 * scanner does, deliberately, so a chain hiccup cannot fail a write that already
 * holds the irreplaceable half. An ignored promise that rejects is an unhandled
 * rejection, which in Node ends the process.
 *
 * registerSnapshotOnChain already catches internally, so this looks redundant.
 * It is not: that is a property of ANOTHER MODULE, and this one documents the
 * no-reject guarantee as its own. Depending on a neighbour to hold an invariant
 * you promise is how a comment becomes the only thing enforcing it — the exact
 * pattern this level exists to stop repeating. Proven by a test that makes
 * anchoring reject.
 */
function anchorNeverRejecting(
  snapshotId: string,
  capture: AnchorableCapture,
): Promise<SnapshotAnchorOutcome | null> {
  return registerSnapshotOnChain(snapshotId, capture).catch((err: unknown) => {
    console.warn(
      '[recordCapture] anchoring rejected for',
      snapshotId,
      ':',
      err instanceof Error ? err.message : err,
    );
    return null;
  });
}

/** YYYY-MM-DD in UTC. capturedAt is UTC by construction. */
function toSnapshotDate(capturedAt: Date): string {
  return capturedAt.toISOString().slice(0, 10);
}

/**
 * A capture already exists at this instant — a resumed scan re-reaching it.
 *
 * Two things must happen here that a bare early return would skip, and both
 * were properties the `upsert` this replaced had in CODE before they were
 * demoted to prose:
 *
 *  - COMPARE. Stored text is never rewritten, but the refetch is still an
 *    observation. If it disagrees with what we hold, the Archive's own copy
 *    changed, and that is a finding. Claiming so in a comment while never
 *    comparing is the "documented in a comment, mistaken for a control" pattern
 *    that Level 1 exists to stop repeating.
 *
 *  - RETRY THE ANCHOR. The old path anchored whenever `onChainTxHash` was null,
 *    including on rows it did not create, so a resumed scan repaired a capture
 *    stored but never anchored. Anchoring only on creation loses that repair —
 *    against a corpus where 83 captures once sat unanchored and 71 production
 *    rows still hold a null for text that IS on-chain.
 *
 * The divergence verdict is surfaced and logged, not yet persisted: where check
 * verdicts live (one polymorphic IntegrityCheck table, or verdict columns per
 * subject) is an open decision in §3 of the plan, and inventing a third shape
 * here would prejudge it.
 */
function finishExisting(
  existing: {
    id: string;
    waybackTimestamp: string | null;
    contentHash: string;
    documentHash: string | null;
    onChainTxHash: string | null;
  },
  fetched: { documentHash: string; contentHash: string; textHash: string; capturedAt: Date },
): RecordedCapture {
  // Compared on the PAYLOAD, not on the derived text.
  //
  // This is the whole lesson of Level 1's reopening. Comparing normalised text
  // is what let three CDX rows with two distinct payload digests collapse to one
  // stored hash — a real difference in the archived bytes, invisible to the
  // check meant to detect exactly that.
  //
  // UNAVAILABLE is a verdict about the CHECK, never about the data (§3). A row
  // stored before the payload column existed has no hash to compare, and saying
  // so is the difference between "we compared and they match" and "we could not
  // compare". Reporting the second as the first is how a silent pass wears the
  // face of a real one.
  const documentComparison: DocumentComparison =
    existing.documentHash === null
      ? 'UNAVAILABLE'
      : existing.documentHash === fetched.documentHash
        ? 'MATCHES'
        : 'DIVERGED';

  if (documentComparison === 'DIVERGED') {
    console.warn(
      '[recordCapture] DIVERGENCE: capture',
      existing.id,
      'holds a payload hashing to',
      existing.documentHash,
      'but the same capture just fetched as',
      fetched.documentHash,
      '— the Archive copy changed, or the fetch is faulty. Stored payload left untouched.',
    );
  }

  // A row with no stored document hash cannot be anchored under the document
  // rule, and saying so is better than anchoring something else. Unreachable
  // while the column is NOT NULL (20260827180000), and the declared type still
  // permits it — tightening that type means removing the UNAVAILABLE comparison
  // above, which is its own change rather than a side effect of moving the anchor.
  const anchoring =
    existing.onChainTxHash !== null || existing.documentHash === null
      ? undefined
      : anchorNeverRejecting(existing.id, { documentHash: existing.documentHash });

  return {
    id: existing.id,
    waybackTimestamp: existing.waybackTimestamp,
    capturedAt: fetched.capturedAt,
    contentHash: existing.contentHash,
    documentHash: fetched.documentHash,
    textHash: fetched.textHash,
    documentComparison,
    outcome: 'EXISTS',
    ...(anchoring ? { anchoring } : {}),
  };
}

/** The capture immediately preceding an instant, and whether text is unchanged from it. */
export interface PrecedingCapture {
  id: string;
  waybackTimestamp: string | null;
  capturedAt: Date;
  contentHash: string;
  textHash: string;
}

/**
 * IS THIS CAPTURE NEW? — the one implementation of that question.
 *
 * Exported so nothing else has to re-derive it. `backfillCdxIndex` must classify
 * indexed captures it holds no row for, and the honest answer ("fetched,
 * compared, identical to its predecessor") is exactly this rule. A second copy
 * would be one rule with two implementations, which is this repository's dominant
 * defect shape — and here the two copies would be *the definition of unchanged*,
 * so any drift between them would mislabel index entries rather than merely
 * duplicating logic.
 *
 * Ordered by `capturedAt` rather than by insertion, so the answer does not depend
 * on the order captures arrive in — which is what made the rule this replaced
 * depend on CDX pagination.
 */
export async function noveltyAgainstPredecessor(input: {
  trackedUrlId: string;
  capturedAt: Date;
  textHash: string;
}): Promise<{ preceding: PrecedingCapture | null; unchanged: boolean }> {
  const preceding = await prisma.urlSnapshot.findFirst({
    where: { trackedUrlId: input.trackedUrlId, capturedAt: { lt: input.capturedAt } },
    orderBy: { capturedAt: 'desc' },
    select: {
      id: true,
      waybackTimestamp: true,
      capturedAt: true,
      contentHash: true,
      textHash: true,
    },
  });
  return { preceding, unchanged: preceding?.textHash === input.textHash };
}

export async function recordCapture(input: RecordCaptureInput): Promise<RecordedCapture> {
  const {
    trackedUrlId,
    provenance,
    capturedAt,
    waybackTimestamp,
    sourceUrl,
    document,
    documentContentType,
    documentContentEncoding,
    extraction,
  } = input;

  if (provenance === CaptureProvenance.WAYBACK && !waybackTimestamp) {
    throw new Error('recordCapture: a WAYBACK capture requires its waybackTimestamp.');
  }
  if (provenance !== CaptureProvenance.WAYBACK && waybackTimestamp) {
    throw new Error(
      `recordCapture: waybackTimestamp is meaningless for a ${provenance} capture — ` +
        'it asserts the Archive holds a capture it does not hold.',
    );
  }
  // Emptiness is judged on the PAYLOAD and on the text it yields, because they
  // fail differently: zero bytes is a fetch that returned nothing, while bytes
  // that derive to pure whitespace is a page that rendered to nothing. Either
  // way there is no document to store, and a capture without one is exactly what
  // this level makes impossible.
  if (document.length === 0) {
    throw new Error('recordCapture: refusing to record a capture with an empty document.');
  }

  const contentHash = sha256Text(extraction);
  const documentHash = sha256Bytes(document);
  // DERIVED UNDER THE ERA THAT COVERS THIS CAPTURE'S DATE.
  //
  // Until 2026-09-01 this called `deriveText`, which takes no ruleset — so a page
  // whose furniture had been marked, approved and versioned was still recorded
  // with that furniture in `text`, and therefore in `textHash`, which is the
  // NOVELTY KEY. A rotating advert continued to make every capture look new,
  // which is the problem Level 4 exists to solve.
  //
  // AN EMPTY RULESET IS THE UNCALIBRATED CASE AND COSTS NOTHING:
  // `applyChromeRuleset` short-circuits on it and the result is byte-identical to
  // the old call, so a URL with no committed calibration behaves exactly as
  // before. `textExtractionVersion` records which it was — `chromeTextVersion`
  // appends the ruleset id only when there is one.
  //
  // THE EMPTY CASE DOES NOT REACH FOR THE PARSER AT ALL, and that is not an
  // optimisation for its own sake. `chromeRulesetApply` brings jsdom, whose
  // dependency chain is ESM-only; loading it here would drag it into every suite
  // that records a capture, and most URLs have no rules. `captureDocument` was
  // written to avoid exactly that dependency.
  //
  // TWO CALL SITES, AND A TEST THAT THEY AGREE. `applyChromeRuleset` already
  // short-circuits on an empty ruleset, so this duplicates a decision that exists
  // one layer down — the shape this repository names as its dominant defect.
  // `test/emptyRulesetDerivation.test.ts` holds the equivalence, so "they agree
  // today" is a fact under test rather than an assumption.
  const selectors = await rulesetForCapture(trackedUrlId, toSnapshotDate(capturedAt));
  const derived =
    selectors.length === 0
      ? deriveText(document, documentContentType ?? null, documentContentEncoding ?? null)
      : (await import('../lib/chromeRulesetApply')).deriveTextUnderRuleset(
          document,
          documentContentType ?? null,
          documentContentEncoding ?? null,
          { selectors: [...selectors] },
        );

  const existing = await prisma.urlSnapshot.findUnique({
    where: { trackedUrlId_capturedAt: { trackedUrlId, capturedAt } },
    select: {
      id: true,
      waybackTimestamp: true,
      contentHash: true,
      documentHash: true,
      onChainTxHash: true,
    },
  });
  if (existing) {
    return finishExisting(existing, {
      documentHash,
      contentHash,
      textHash: derived.textHash,
      capturedAt,
    });
  }

  /**
   * Is this capture new?
   *
   * A capture is new unless it is identical to the one immediately preceding it
   * in time for the same TrackedUrl. Two consequences, both deliberate:
   *
   *   - An unchanged re-fetch is dropped. It adds a row and no information, and
   *     CDX has already collapsed the archived equivalent before we see it.
   *
   *   - A NON-CONSECUTIVE revert is KEPT. A page returning to a former state is
   *     forensically significant — it is the whole-page form of what claim
   *     trajectories detect, and on this corpus it is not hypothetical: the
   *     tracked MOH page returned to an earlier state twice within six hours on
   *     2022-06-22, and to another earlier state three times across May 2022.
   *     Every one of those observations was discarded by the rule this replaces.
   *
   * Ordering by capturedAt rather than by insertion makes the answer independent
   * of the order captures arrive in, which is what made the old rule depend on
   * CDX pagination.
   *
   * THIS IS A TRANSITION-DERIVED FACT, and the repository has a hard-won rule
   * against those — derive from state, not from a transition, learned three times
   * in one day. The decision is made once, at write, against whatever preceded the
   * capture at that moment, and it is never revisited.
   *
   * Kept deliberately, and the reason is the direction of the error. A capture
   * inserted BETWEEN two existing ones is compared against its predecessor only,
   * so it can leave its SUCCESSOR as a now-redundant row. It cannot cause an
   * observation to be dropped: a redundant row costs a duplicate in a report,
   * a dropped one costs something unrecoverable, and this level exists because the
   * unrecoverable direction was chosen once already.
   *
   * That case is imminent rather than theoretical. Removing the digest filter
   * means a rescan inserts the eleven reverts the old rule discarded, each landing
   * between captures already stored — so the redundancy above is the expected
   * outcome of the very next scan, not a hypothetical. Anything that needs an
   * order-independent answer must recompute from the stored captures rather than
   * read these outcomes back.
   */
  const { preceding, unchanged } = await noveltyAgainstPredecessor({
    trackedUrlId,
    capturedAt,
    textHash: derived.textHash,
  });
  // Novelty on the derived TEXT, not on the payload — decided explicitly rather
  // than inherited. Byte-identity is too sensitive to be the novelty key: a
  // rotating cache-buster or a timestamp inside a comment would make every
  // capture distinct and store hundreds of near-identical payloads. Nothing is
  // discarded by choosing text here, because the payload is kept whole either
  // way; what changes is only whether a NEW ROW is created.
  if (unchanged && preceding) {
    // Every field describes the row named by `id` — the capture that already
    // holds this document — so the result is internally consistent rather than
    // mixing the request with the row it resolved to.
    return {
      id: preceding.id,
      waybackTimestamp: preceding.waybackTimestamp,
      capturedAt: preceding.capturedAt,
      contentHash: preceding.contentHash,
      documentHash,
      textHash: derived.textHash,
      documentComparison: 'MATCHES',
      outcome: 'UNCHANGED',
    };
  }

  let created: { id: string; waybackTimestamp: string | null } & AnchorableCapture;
  try {
    created = await prisma.urlSnapshot.create({
      data: {
        trackedUrlId,
        provenance,
        capturedAt,
        waybackTimestamp: waybackTimestamp ?? null,
        snapshotDate: toSnapshotDate(capturedAt),
        snapshotUrl: sourceUrl,
        fullText: extraction,
        contentHash,
        document,
        documentHash,
        documentContentType: documentContentType ?? null,
        documentContentEncoding: documentContentEncoding ?? null,
        text: derived.text,
        textHash: derived.textHash,
        textExtractionVersion: derived.textExtractionVersion,
      },
      // The anchorable columns are read back from the row AS WRITTEN, not
      // reused from the local variables that produced it. Anchoring records what
      // was OBSERVED in the database rather than what this function believed it
      // stored — the same rule that makes a chain-provenance stamp worth having.
      select: { id: true, waybackTimestamp: true, ...ANCHORABLE_CAPTURE_SELECT },
    });
  } catch (err) {
    // The existence check above and this create are two statements, so a
    // concurrent writer can insert the same capture in between. The `upsert`
    // this replaced was one atomic statement and was documented as
    // "idempotent — safe to call again on resume"; splitting it reintroduced a
    // race that the comment still promised was handled.
    //
    // P2002 is the unique violation on (trackedUrlId, capturedAt). It means the
    // other writer won, so re-read and finish on the existing row — which also
    // runs the divergence comparison and the anchor retry, rather than
    // reporting a failure for a capture that IS now stored.
    if (!isUniqueViolation(err)) throw err;
    const raced = await prisma.urlSnapshot.findUnique({
      where: { trackedUrlId_capturedAt: { trackedUrlId, capturedAt } },
      select: {
        id: true,
        waybackTimestamp: true,
        contentHash: true,
        documentHash: true,
        onChainTxHash: true,
      },
    });
    // Losing the race and then not finding the winner's row means the conflict
    // was on something other than this key — surface it rather than invent a
    // result.
    if (!raced) throw err;
    return finishExisting(raced, {
      documentHash,
      contentHash,
      textHash: derived.textHash,
      capturedAt,
    });
  }

  // Anchoring belongs to the write path, not to its callers. A capture stored
  // but never anchored is the gap that left 83 snapshots unanchored while an
  // empty catch reported success — so the call lives here, where every caller
  // gets it, and its rejection is LOGGED rather than discarded.
  //
  // Fire-and-forget on purpose: a chain hiccup must not fail a scan that has
  // already stored the irreplaceable half. Whether it actually worked is
  // answered by counting unanchored snapshots from state, never by trusting this
  // call. See countUnanchoredSnapshots.
  const anchoring = anchorNeverRejecting(created.id, created);

  return {
    id: created.id,
    waybackTimestamp: created.waybackTimestamp,
    capturedAt,
    contentHash,
    documentHash,
    textHash: derived.textHash,
    documentComparison: 'MATCHES',
    outcome: 'CREATED',
    anchoring,
  };
}

/** YYYYMMDDHHMMSS (UTC) -> Date. The one place that conversion is defined. */
export function waybackTimestampToDate(timestamp: string): Date {
  if (!/^\d{14}$/.test(timestamp)) {
    throw new Error(`waybackTimestampToDate: expected 14 digits, got "${timestamp}".`);
  }
  const iso =
    `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}` +
    `T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`waybackTimestampToDate: "${timestamp}" is not a valid instant.`);
  }
  return date;
}
