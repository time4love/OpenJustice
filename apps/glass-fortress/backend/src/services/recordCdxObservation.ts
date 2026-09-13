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
  // protects a row the walk has already advanced from being reset to UNFETCHED by
  // a later survey that merely re-read the index.
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
