import { prisma } from '../lib/prisma';
import { CdxEntryStatus } from '@prisma/client';

/**
 * The one place a CDX answer becomes stored state.
 *
 * §3: an observation of an external system MUST be stored, because it cannot be
 * re-derived. "The Archive told us these captures exist, at this moment" is
 * exactly that, and until now it was either discarded (the digest, used to
 * de-duplicate and thrown away) or trapped inside a scan job's JSON blob (the
 * unservable capture).
 *
 * RECORDED AT THE POINT OF OBSERVATION, so it cannot be forgotten by a caller.
 * The query and the recording live in one function for the same reason
 * `recordCapture` exists: two callers that each remember to record are two
 * chances to stop remembering.
 */

export interface CdxRow {
  timestamp: string;
  digest: string;
}

export async function recordCdxObservation(input: {
  trackedUrlId: string;
  queriedAt: Date;
  fromDate?: string | undefined;
  rows: CdxRow[];
  hasMore: boolean;
}): Promise<void> {
  const { trackedUrlId, queriedAt, fromDate, rows, hasMore } = input;

  // THE QUERY IS RECORDED EVEN WHEN IT RETURNED NOTHING — that is the point.
  // Zero rows create zero entries, so without this an empty answer is
  // indistinguishable from never having asked, and Level 2 Phase B routes on
  // exactly that distinction.
  await prisma.cdxQuery.create({
    data: {
      trackedUrlId,
      queriedAt,
      fromDate: fromDate ?? null,
      rowCount: rows.length,
      hasMore,
    },
  });

  if (rows.length === 0) return;

  // createMany + skipDuplicates, never an update.
  //
  // `observedAt` means WHEN WE FIRST SAW THE ARCHIVE SAY THIS, so re-observing an
  // unchanged entry must not move it — that timestamp is what makes index drift
  // legible when a second row appears with a later one. And skipping duplicates
  // protects a row already advanced to STORED from being reset to UNFETCHED by a
  // later scan that merely re-read the index.
  //
  // The unique key includes the digest, so a changed answer from the Archive is
  // a NEW ROW rather than an overwrite. Same rule as capture novelty, one layer
  // out: store the observation, add a row only when the content differs.
  await prisma.cdxIndexEntry.createMany({
    data: rows.map((row) => ({
      trackedUrlId,
      waybackTimestamp: row.timestamp,
      digest: row.digest,
      status: CdxEntryStatus.UNFETCHED,
      observedAt: queriedAt,
    })),
    skipDuplicates: true,
  });
}

/**
 * Mark the index entry this capture was made from, and link it.
 *
 * Keyed on the digest as well as the timestamp so the link lands on the entry we
 * actually fetched, not on a drifted re-observation of the same instant.
 */
export async function markCdxEntryStored(input: {
  trackedUrlId: string;
  waybackTimestamp: string;
  digest: string;
  snapshotId: string;
}): Promise<void> {
  await prisma.cdxIndexEntry.updateMany({
    where: {
      trackedUrlId: input.trackedUrlId,
      waybackTimestamp: input.waybackTimestamp,
      digest: input.digest,
    },
    data: { status: CdxEntryStatus.STORED, snapshotId: input.snapshotId },
  });
}

/**
 * The Archive indexes this capture and will not serve it.
 *
 * A DURABLE THIRD-PARTY FACT, not a failure of ours, and deliberately distinct
 * from UNFETCHED: collapsing them would make a permanent gap and a retryable one
 * indistinguishable, which is the state `20240829085520` has been in since the
 * original scan — recorded as `FAILED` inside a JSON blob and existing nowhere a
 * query could reach it.
 *
 * Only ever called for a status the Archive itself returned as permanent (404).
 * A timeout or a 5xx is transient and must stay UNFETCHED.
 */
export async function markCdxEntryUnservable(input: {
  trackedUrlId: string;
  waybackTimestamp: string;
  digest: string;
}): Promise<void> {
  await prisma.cdxIndexEntry.updateMany({
    where: {
      trackedUrlId: input.trackedUrlId,
      waybackTimestamp: input.waybackTimestamp,
      digest: input.digest,
      // Never demote a capture we hold. A 404 on a re-fetch of something already
      // stored is a fact about the replay, not a reason to forget the bytes.
      status: { not: CdxEntryStatus.STORED },
    },
    data: { status: CdxEntryStatus.UNSERVABLE },
  });
}

/**
 * Fetched, compared, and found identical to the capture before it.
 *
 * THE NOVELTY RULE WORKING, NOT A FAILURE — and deliberately not linked to a
 * snapshot. `recordCapture` returns the PRECEDING capture's id on an UNCHANGED
 * outcome, so linking would attach this entry to a capture it did not produce.
 *
 * Never demotes a STORED entry, on the same principle as UNSERVABLE: a later
 * re-observation must not erase the fact that a capture exists.
 */
export async function markCdxEntryUnchanged(input: {
  trackedUrlId: string;
  waybackTimestamp: string;
  digest: string;
  /**
   * The capture the verdict was computed against — REQUIRED, not optional.
   *
   * UNCHANGED is the only status that is a judgement rather than a fact, so it is
   * the only one that can quietly stop being true: back-fill an older capture
   * between this entry and its predecessor and the comparison no longer holds.
   * §3 answers that by recording what the verdict was computed against, and
   * making the parameter required means the provenance cannot be omitted by a
   * caller — the same reason `recordCapture` takes `document` as required.
   */
  comparedToSnapshotId: string;
}): Promise<void> {
  await prisma.cdxIndexEntry.updateMany({
    where: {
      trackedUrlId: input.trackedUrlId,
      waybackTimestamp: input.waybackTimestamp,
      digest: input.digest,
      status: { not: CdxEntryStatus.STORED },
    },
    data: {
      status: CdxEntryStatus.UNCHANGED,
      comparedToSnapshotId: input.comparedToSnapshotId,
    },
  });
}
