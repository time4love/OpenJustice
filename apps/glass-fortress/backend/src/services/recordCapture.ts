import { CaptureProvenance } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { captureHtml, sha256Bytes, sha256Text, type DerivedText } from '../lib/captureDocument';
import { rawCaptureUrl, viewerCaptureUrl } from '../lib/archiveHttp';
import { ANCHORABLE_CAPTURE_SELECT } from '../lib/anchoredCaptureHash';
import { anchorAcquiredCapture, requireWritable, type RegistryWindow } from './anchorSnapshots';

/**
 * THE STORE — the one way a capture is written, and anchored as it is written.
 *
 * The walk derives and decides (docs/gf-interaction-flows.md Phase 2): it
 * fetches the raw replay, derives text under RULES_IN_FORCE at the capture's
 * timestamp, compares with the predecessor, runs the gates, and only then —
 * every gate quiet, or the capture RESOLVED — hands the bytes here. This module
 * decides nothing about novelty or rules. It holds two properties that do not
 * survive being spread across call sites:
 *
 *   1. A capture holds the document it was extracted from. `document` is a
 *      required `Buffer`, so no path can construct an incomplete capture — the
 *      schema's NOT NULL is the backstop, not the control.
 *
 *   2. `fullText` and `contentHash` — evidence identity — are composed HERE,
 *      through the one Readability construction in `lib/archiveText`, and by
 *      no rule and no walk (architecture §6, walk invariant I1). The walk's
 *      derivation is stored as handed over; the identity is the store's.
 *
 * The anchor is AWAITED (Phase 2, ruled 2026-09-02). A chain failure throws
 * with its reason; the snapshot row stays; the next call finds it through the
 * existing-row path below and retries the anchor.
 */
export interface StoreCaptureInput {
  trackedUrlId: string;
  /**
   * The page's URL, exact — flows A1. It names the raw replay the bytes came
   * from, which is the base Readability reads the article under, and the
   * viewer URL a reader opens to check.
   */
  url: string;
  /** The capture's name in the archive — 14 digits, YYYYMMDDHHMMSS. */
  waybackTimestamp: string;
  /**
   * THE PAYLOAD AS FETCHED. Bytes, never a decoded or filtered view of them.
   *
   * Typed `Buffer` rather than `string` so the compiler refuses the mistake that
   * reopened Level 1: a caller cannot hand text here and have it stored under
   * the name of the document.
   */
  document: Buffer;
  /** The Content-Type header verbatim — what makes the bytes decodable later. */
  contentType: string | null;
  /**
   * The Content-Encoding header, normalised: `document` is the payload AS
   * SERVED, so this is what says how to read it. Both headers are stored on the
   * same rule: keep every response header without which the bytes cannot be
   * interpreted.
   */
  contentEncoding: string | null;
  /** The walk's derivation under RULES_IN_FORCE at the capture's timestamp. */
  derived: DerivedText;
  /** The registry as this walk call sees it — WRITES_ALLOWED evaluated once. */
  window: RegistryWindow;
}

/**
 * The verdict of comparing a refetched payload against the stored one.
 *
 * `DIVERGED` is a finding rather than an error: either the Archive's own copy
 * changed or our fetch is faulty, and stored bytes are never rewritten on the
 * strength of it. Always `MATCHES` on a created row, where nothing was compared
 * because nothing conflicting was stored.
 */
export type DocumentComparison = 'MATCHES' | 'DIVERGED';

export interface StoredCapture {
  snapshotId: string;
  /** False when this instant was already recorded — a retry, or a lost race. */
  created: boolean;
  documentComparison: DocumentComparison;
}

/** The columns an existing row needs to be compared, and anchored if it never was. */
const EXISTING_ROW_SELECT = { id: true, textHash: true, onChainTxHash: true, ...ANCHORABLE_CAPTURE_SELECT } as const;

interface ExistingRow {
  id: string;
  textHash: string;
  onChainTxHash: string | null;
  documentHash: string;
}

/**
 * Prisma's unique-constraint violation, identified by code rather than message.
 *
 * `instanceof PrismaClientKnownRequestError` is avoided deliberately: it fails
 * when more than one @prisma/client instance is resolved, which is exactly the
 * condition a monorepo with workspace hoisting can produce, and it would fail
 * OPEN here — turning a lost race into a thrown walk.
 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

/** YYYY-MM-DD in UTC. capturedAt is UTC by construction. */
function toSnapshotDate(capturedAt: Date): string {
  return capturedAt.toISOString().slice(0, 10);
}

/**
 * A capture already exists at this instant — a walk call re-reaching it after
 * a halt, or a lost race. Three things happen that a bare early return would skip:
 *
 *  - REFUSE A MOVED TEXT (ruled 2026-09-06, M1). This path exists for the SAME
 *    capture reached twice: the same bytes under the same rules derive the same
 *    text. A stored textHash that differs from the derivation handed over means
 *    the walk is re-storing a capture whose text has moved under it — that is
 *    supersession's job (flows Flow 3, a TextVersion in one transaction), and
 *    silently keeping either text would be a stored capture whose `text` no
 *    longer says what the walk believes. A walk defect throws.
 *
 *  - COMPARE, on the PAYLOAD. Stored bytes are never rewritten, but the refetch
 *    is still an observation. Comparing normalised text is what let three CDX
 *    rows with two distinct payload digests collapse to one stored hash — a real
 *    difference in the archived bytes, invisible to the check meant to detect
 *    exactly that. The verdict is logged, not yet persisted.
 *
 *  - RETRY THE ANCHOR, awaited. A row whose anchor threw on the call that
 *    created it is the row this path exists for: the bytes are the irreplaceable
 *    half and they are held; the anchor is owed, and this is where it is paid —
 *    after the window is asked, so a frozen registry retries nothing.
 */
async function finishExisting(
  existing: ExistingRow,
  fetched: { documentHash: string; textHash: string; waybackTimestamp: string },
  window: RegistryWindow,
): Promise<StoredCapture> {
  if (existing.textHash !== fetched.textHash) {
    throw new Error(
      `Walk defect: capture ${fetched.waybackTimestamp} is already stored as snapshot ${existing.id} with ` +
        `textHash ${existing.textHash}, but the walk handed over a derivation hashing to ${fetched.textHash}. ` +
        'A stored text changes only by a versioned supersession, never through the store.',
    );
  }

  const documentComparison: DocumentComparison =
    existing.documentHash === fetched.documentHash ? 'MATCHES' : 'DIVERGED';

  if (documentComparison === 'DIVERGED') {
    console.warn(
      '[storeCapture] DIVERGENCE: capture',
      existing.id,
      'holds a payload hashing to',
      existing.documentHash,
      'but the same capture just fetched as',
      fetched.documentHash,
      '— the Archive copy changed, or the fetch is faulty. Stored payload left untouched.',
    );
  }

  // Anchored on the bytes the ROW holds, never the refetched ones: the anchor
  // attests what the corpus keeps, and `anchoredCaptureHash` reads it off the
  // row as written.
  if (existing.onChainTxHash === null) {
    await requireWritable(window);
    await anchorAcquiredCapture(window, existing.id, existing);
  }

  return { snapshotId: existing.id, created: false, documentComparison };
}

export async function storeCapture(input: StoreCaptureInput): Promise<StoredCapture> {
  const { trackedUrlId, url, waybackTimestamp, document, contentType, contentEncoding, derived, window } =
    input;

  const capturedAt = waybackTimestampToDate(waybackTimestamp);
  // Zero bytes is a fetch that returned nothing. There is no document to store,
  // and a capture without one is exactly what this module makes impossible.
  if (document.length === 0) {
    throw new Error('storeCapture: refusing to store a capture with an empty document.');
  }
  const documentHash = sha256Bytes(document);

  const existing = await prisma.urlSnapshot.findUnique({
    where: { trackedUrlId_capturedAt: { trackedUrlId, capturedAt } },
    select: EXISTING_ROW_SELECT,
  });
  const fetched = { documentHash, textHash: derived.textHash, waybackTimestamp };
  if (existing) return finishExisting(existing, fetched, window);

  // WRITES_ALLOWED, BEFORE THE ROW EXISTS (ruled 2026-09-06, M2). Flows A5: on
  // a frozen registry "nothing is acquired". A snapshot created and then
  // refused its anchor would be a capture the corpus holds under a custody
  // claim the registry will never take; asked here, the refusal leaves no row.
  // The window memoises the verdict, so the anchoring module's own ask is free.
  await requireWritable(window);

  // EVIDENCE IDENTITY, composed once, here. Readability's article over the
  // decoded payload, under the raw replay URL — the formula the registry ledger
  // states and the rebuild's extractor-equality measurement reproduced 112 of
  // 112 with. A dynamic import, because `archiveText` constructs jsdom, whose
  // dependency chain is ESM-only: the walk imports this module statically, every
  // walk tool test imports the walk's barrel, and one static edge here would
  // break them all (refactor plan §8, the jsdom boundary).
  const { extractArticleText } = await import('../lib/archiveText');
  const fullText = extractArticleText(
    captureHtml({ document, documentContentType: contentType, documentContentEncoding: contentEncoding }),
    rawCaptureUrl(waybackTimestamp, url),
  );
  const contentHash = sha256Text(fullText);

  let created: { id: string; documentHash: string };
  try {
    created = await prisma.urlSnapshot.create({
      data: {
        trackedUrlId,
        provenance: CaptureProvenance.WAYBACK,
        capturedAt,
        waybackTimestamp,
        snapshotDate: toSnapshotDate(capturedAt),
        snapshotUrl: viewerCaptureUrl(waybackTimestamp, url),
        fullText,
        contentHash,
        document,
        documentHash,
        documentContentType: contentType,
        documentContentEncoding: contentEncoding,
        text: derived.text,
        textHash: derived.textHash,
        textExtractionVersion: derived.textExtractionVersion,
      },
      // The anchorable columns are read back from the row AS WRITTEN, not reused
      // from the local variables that produced it. Anchoring records what was
      // OBSERVED in the database rather than what this function believed it
      // stored — the same rule that makes a chain-provenance stamp worth having.
      select: { id: true, ...ANCHORABLE_CAPTURE_SELECT },
    });
  } catch (err) {
    // The existence check above and this create are two statements, so a
    // concurrent writer can insert the same capture in between. P2002 is the
    // unique violation on (trackedUrlId, capturedAt): the other writer won, so
    // re-read and finish on the existing row — which also runs the divergence
    // comparison and the anchor retry, rather than reporting a failure for a
    // capture that IS now stored.
    if (!isUniqueViolation(err)) throw err;
    const raced = await prisma.urlSnapshot.findUnique({
      where: { trackedUrlId_capturedAt: { trackedUrlId, capturedAt } },
      select: EXISTING_ROW_SELECT,
    });
    // Losing the race and then not finding the winner's row means the conflict
    // was on something other than this key — surface it rather than invent a
    // result.
    if (!raced) throw err;
    return finishExisting(raced, fetched, window);
  }

  // Awaited. A chain failure throws out of here with the row already written:
  // the walk halts having changed only its own row, and the next call reaches
  // `finishExisting` above and retries the anchor on the bytes held.
  await anchorAcquiredCapture(window, created.id, created);

  return { snapshotId: created.id, created: true, documentComparison: 'MATCHES' };
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
