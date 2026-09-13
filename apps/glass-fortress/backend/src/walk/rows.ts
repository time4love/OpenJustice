import { CdxEntryStatus, type CdxIndexEntry, type Prisma } from '@prisma/client';
import type { Outcome } from './derivations';

// ---------------------------------------------------------------------------
// THE WORK-LIST ROW LOADER — the ONE boundary where a stored status is read as
// one of the walk's outcomes.
//
// It mapped the old path's STORED to ACQUIRED and UNCHANGED to DUPLICATE, so that
// no module counting `status === 'ACQUIRED'` on a raw row could omit a capture the
// old path stored. The database was rebuilt at step 9 and R45-B dropped the two
// values, so the mapping is the identity; it stays the one boundary, so a status
// the enum gains is still decided here and nowhere else.
//
// Built at step 2 rather than step 3 because the survey reads the page's rows
// first: `held` after a survey must equal the page's snapshot count.
// ---------------------------------------------------------------------------

/** A row as the walk sees it: the stored status read as one of A2's seven outcomes. */
export type LoadedRow = Omit<CdxIndexEntry, 'status'> & { outcome: Outcome };

// A Record, not a switch: a status the enum gains without a line here fails to
// compile rather than falling through to a default.
const OUTCOME_OF: Record<CdxEntryStatus, Outcome> = {
  UNFETCHED: 'UNFETCHED',
  UNSERVABLE: 'UNSERVABLE',
  IDENTICAL: 'IDENTICAL',
  DUPLICATE: 'DUPLICATE',
  ACQUIRED: 'ACQUIRED',
  PENDING_JUDGEMENT: 'PENDING_JUDGEMENT',
  SKIPPED: 'SKIPPED',
};

export function outcomeOf(status: CdxEntryStatus): Outcome {
  return OUTCOME_OF[status];
}

/** The one mapping from a stored row to a walk row; both loaders go through it. */
function asLoaded({ status, ...row }: CdxIndexEntry): LoadedRow {
  return { ...row, outcome: outcomeOf(status) };
}

/** Every row on the page, in timestamp order, read through the boundary. */
export async function loadWorkListRows(tx: Prisma.TransactionClient, trackedUrlId: string): Promise<LoadedRow[]> {
  const rows = await tx.cdxIndexEntry.findMany({ where: { trackedUrlId }, orderBy: { waybackTimestamp: 'asc' } });
  return rows.map(asLoaded);
}

/** One row, by the capture's name — page and timestamp; null when the page holds no such row. */
export async function loadWorkListRow(
  tx: Prisma.TransactionClient,
  trackedUrlId: string,
  waybackTimestamp: string,
): Promise<LoadedRow | null> {
  const row = await tx.cdxIndexEntry.findFirst({ where: { trackedUrlId, waybackTimestamp } });
  return row === null ? null : asLoaded(row);
}

/** YYYYMMDDHHMMSS → YYYY-MM-DD. `snapshotDate` is not a row column; it is derived from the capture's name. */
export function snapshotDateOf(waybackTimestamp: string): string {
  return `${waybackTimestamp.slice(0, 4)}-${waybackTimestamp.slice(4, 6)}-${waybackTimestamp.slice(6, 8)}`;
}
