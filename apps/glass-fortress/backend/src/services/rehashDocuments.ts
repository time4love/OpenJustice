import { prisma } from '../lib/prisma';
import { sha256Bytes } from '../lib/captureDocument';
import { CaptureProvenance } from '@prisma/client';

/**
 * Recompute `documentHash` as SHA-256 of the bytes the row already holds.
 *
 * WHY THIS EXISTS. `reconcileAgainstCdx` wrote `cdxDigestOf(payload)` —
 * base32(SHA-1), the Archive's own digest — into `documentHash`, which
 * schema.prisma and `recordCapture` both define as SHA-256 of the payload. The
 * UPDATE ran on every write action rather than only on a repair, so it corrupted
 * all 83 captures in BOTH environments rather than the 7 it repaired. The wrong
 * function had less friction than the right one: `cdxDigestOf` was already in
 * scope from the verifier import, `sha256Bytes` was not imported at all.
 *
 * WHY NOTHING IS RE-FETCHED. The BYTES are correct and that is settled by an
 * external witness, not by assumption: `sha1b32(document) == cdx.digest` holds
 * 83/83 in both environments, and that check recomputes from `document` and
 * never reads this column — which is exactly how it stayed green while the
 * column was wrong, and also exactly why it can be relied on now. So the repair
 * is a pure local function of data already held. No Archive, no network, no
 * chain, minutes not hours.
 *
 * WHY NO ANCHOR MOVES. The chain holds `contentHash = sha256(fullText)`.
 * `documentHash` has never been anchored — Level 3 is where it would be, and
 * Level 3 has not been built. Correcting it therefore orphans nothing. Had the
 * order been the other way round, this would have been a Level 7 event rather
 * than a repair.
 *
 * FILL-AND-REPAIR, NEVER A BLANKET WRITE. Each row is compared first, and the
 * UPDATE carries the stale value in its WHERE clause — so a row already correct
 * is not written at all, and a row changed since it was read is skipped rather
 * than overwritten. Idempotent, and it converges on repeated runs.
 */

export type RehashAction = 'ALREADY_CORRECT' | 'REHASHED' | 'RACED';

export interface RehashOutcome {
  snapshotId: string;
  capturedAt: Date;
  provenance: CaptureProvenance;
  action: RehashAction;
  storedDocumentHash: string;
  recomputedDocumentHash: string;
}

export interface RehashReport {
  dryRun: boolean;
  captures: number;
  alreadyCorrect: number;
  rehashed: number;
  raced: number;
  outcomes: RehashOutcome[];
}

export async function rehashDocuments(opts: {
  url: string;
  dryRun: boolean;
  onProgress?: (done: number, total: number, outcome: RehashOutcome) => void;
}): Promise<RehashReport> {
  const tracked = await prisma.trackedUrl.findUnique({
    where: { url: opts.url },
    select: { id: true },
  });
  if (!tracked) throw new Error(`No tracked URL found for: ${opts.url}`);

  // Unscoped by provenance, deliberately. "A row's integrity hash is a hash of
  // that row's bytes" is not a property of archived captures; scoping it would
  // leave DIRECT and ASSERTED captures unrepaired and unreported once Level 2
  // Phase B creates the first of them.
  const captures = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      capturedAt: true,
      provenance: true,
      document: true,
      documentHash: true,
    },
  });

  const outcomes: RehashOutcome[] = [];
  const record = (outcome: RehashOutcome): void => {
    outcomes.push(outcome);
    opts.onProgress?.(outcomes.length, captures.length, outcome);
  };

  for (const capture of captures) {
    const recomputedDocumentHash = sha256Bytes(capture.document);
    const base = {
      snapshotId: capture.id,
      capturedAt: capture.capturedAt,
      provenance: capture.provenance,
      storedDocumentHash: capture.documentHash,
      recomputedDocumentHash,
    };

    if (capture.documentHash === recomputedDocumentHash) {
      record({ ...base, action: 'ALREADY_CORRECT' });
      continue;
    }
    if (opts.dryRun) {
      record({ ...base, action: 'REHASHED' });
      continue;
    }

    // The stale value in the WHERE clause is the never-silently-overwrite guard,
    // enforced by the database rather than by having read the row a moment ago.
    const { count } = await prisma.urlSnapshot.updateMany({
      where: { id: capture.id, documentHash: capture.documentHash },
      data: { documentHash: recomputedDocumentHash },
    });
    record({ ...base, action: count === 1 ? 'REHASHED' : 'RACED' });
  }

  return {
    dryRun: opts.dryRun,
    captures: captures.length,
    alreadyCorrect: outcomes.filter((o) => o.action === 'ALREADY_CORRECT').length,
    rehashed: outcomes.filter((o) => o.action === 'REHASHED').length,
    raced: outcomes.filter((o) => o.action === 'RACED').length,
    outcomes,
  };
}
