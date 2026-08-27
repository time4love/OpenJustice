import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { CaptureProvenance } from '@prisma/client';
import { registerSnapshotOnChain } from './anchorSnapshots';

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
  /** The document as fetched, before extraction. Never truncated. */
  document: string;
  /** Readability's article view of that same document. */
  extraction: string;
}

export interface RecordedCapture {
  id: string;
  waybackTimestamp: string | null;
  capturedAt: Date;
  /** SHA-256(extraction) — what the chain currently attests to. */
  contentHash: string;
  /** SHA-256(document), over the WHOLE document. */
  documentHash: string;
  /**
   * Why this call did not create a row.
   *
   * `UNCHANGED` — identical to the immediately preceding capture.
   * `EXISTS`    — already recorded; a resumed scan re-reaching the same capture.
   */
  outcome: 'CREATED' | 'UNCHANGED' | 'EXISTS';
}

/** SHA-256 hex digest. Bare hex — see toBytes32 before any chain call. */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** YYYY-MM-DD in UTC. capturedAt is UTC by construction. */
function toSnapshotDate(capturedAt: Date): string {
  return capturedAt.toISOString().slice(0, 10);
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
 * Asymmetry worth naming: a capture inserted BETWEEN two existing ones is
 * compared against its predecessor only, so it can leave its successor as a
 * now-redundant row. That direction is left deliberately — a redundant row
 * costs a duplicate in a report, a dropped one costs an observation that cannot
 * be recovered, and this level exists because the second was chosen once already.
 */
async function precedingCaptureHash(
  trackedUrlId: string,
  capturedAt: Date,
): Promise<string | null> {
  const previous = await prisma.urlSnapshot.findFirst({
    where: { trackedUrlId, capturedAt: { lt: capturedAt } },
    orderBy: { capturedAt: 'desc' },
    select: { rawContentHash: true },
  });
  return previous?.rawContentHash ?? null;
}

export async function recordCapture(input: RecordCaptureInput): Promise<RecordedCapture> {
  const { trackedUrlId, provenance, capturedAt, waybackTimestamp, sourceUrl, document, extraction } =
    input;

  if (provenance === CaptureProvenance.WAYBACK && !waybackTimestamp) {
    throw new Error('recordCapture: a WAYBACK capture requires its waybackTimestamp.');
  }
  if (provenance !== CaptureProvenance.WAYBACK && waybackTimestamp) {
    throw new Error(
      `recordCapture: waybackTimestamp is meaningless for a ${provenance} capture — ` +
        'it asserts the Archive holds a capture it does not hold.',
    );
  }
  if (document.length === 0) {
    throw new Error('recordCapture: refusing to record a capture with an empty document.');
  }

  const contentHash = sha256(extraction);
  const documentHash = sha256(document);

  const existing = await prisma.urlSnapshot.findUnique({
    where: { trackedUrlId_capturedAt: { trackedUrlId, capturedAt } },
    select: { id: true, waybackTimestamp: true, contentHash: true },
  });
  if (existing) {
    // A resumed scan re-reaching a capture it already stored. Stored text is
    // never rewritten: a refetch that DISAGREES means the Archive's own copy
    // changed, which is a finding to surface and never something to paper over.
    return {
      id: existing.id,
      waybackTimestamp: existing.waybackTimestamp,
      capturedAt,
      contentHash: existing.contentHash,
      documentHash,
      outcome: 'EXISTS',
    };
  }

  const previousHash = await precedingCaptureHash(trackedUrlId, capturedAt);
  if (previousHash === documentHash) {
    const preceding = await prisma.urlSnapshot.findFirst({
      where: { trackedUrlId, capturedAt: { lt: capturedAt } },
      orderBy: { capturedAt: 'desc' },
      select: { id: true, waybackTimestamp: true, capturedAt: true, contentHash: true },
    });
    // Non-null: precedingCaptureHash returned a hash, so a preceding row exists.
    if (!preceding) throw new Error('recordCapture: preceding capture vanished mid-call.');
    return {
      id: preceding.id,
      waybackTimestamp: preceding.waybackTimestamp,
      capturedAt: preceding.capturedAt,
      contentHash: preceding.contentHash,
      documentHash,
      outcome: 'UNCHANGED',
    };
  }

  const created = await prisma.urlSnapshot.create({
    data: {
      trackedUrlId,
      provenance,
      capturedAt,
      waybackTimestamp: waybackTimestamp ?? null,
      snapshotDate: toSnapshotDate(capturedAt),
      snapshotUrl: sourceUrl,
      fullText: extraction,
      contentHash,
      rawText: document,
      rawContentHash: documentHash,
    },
    select: { id: true, waybackTimestamp: true },
  });

  // Anchoring belongs to the write path, not to its callers. A capture stored
  // but never anchored is the gap that left 83 snapshots unanchored while an
  // empty catch reported success — so the call lives here, where every caller
  // gets it, and its rejection is LOGGED rather than discarded.
  //
  // Fire-and-forget on purpose: a chain hiccup must not fail a scan that has
  // already stored the irreplaceable half. Whether it actually worked is
  // answered by counting unanchored snapshots from state, never by trusting this
  // call. See countUnanchoredSnapshots.
  registerSnapshotOnChain(created.id, contentHash).catch((err: unknown) => {
    console.warn(
      '[recordCapture] snapshot anchoring rejected for',
      created.id,
      ':',
      err instanceof Error ? err.message : err,
    );
  });

  return {
    id: created.id,
    waybackTimestamp: created.waybackTimestamp,
    capturedAt,
    contentHash,
    documentHash,
    outcome: 'CREATED',
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
