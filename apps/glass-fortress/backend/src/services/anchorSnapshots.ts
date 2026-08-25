import { prisma } from '../lib/prisma';
import { Web3Service } from './Web3Service';
import { toBytes32 } from '../lib/bytes32';

// ---------------------------------------------------------------------------
// Anchoring archived snapshots that were never anchored.
//
// UrlSnapshot.contentHash is the factual layer — "this page held exactly this
// text on this date" — and the forensic model argues from its being on-chain.
// FINDING 41: none of it was. The scan ran while staging's RPC was answering
// "no backend is currently healthy", registerSnapshotOnChain is fire-and-forget
// with a swallowed rejection, and nothing ever asked afterwards.
//
// Fire-and-forget during a scan remains right: a chain hiccup must not fail a
// run that successfully fetched and stored archived text, because the text is
// the irreplaceable half. What was missing is a way to notice, and a way to
// repair. countUnanchoredSnapshots is the first; this is the second.
//
// Idempotent and resumable. Anchoring 83 hashes is 83 transactions, so it is
// expected to be run repeatedly, interrupted, and run again.
// ---------------------------------------------------------------------------

export interface AnchorReport {
  examined: number;
  anchored: number;
  /** Already on-chain from another snapshot with identical text — tx copied, no new transaction. */
  copiedFromTwin: number;
  /** On-chain already, tx hash recovered by log scan rather than re-registered. */
  recovered: number;
  failed: number;
  /**
   * Why each failure happened.
   *
   * The first version of this counted failures and discarded the reason, which is
   * the same defect it was written to repair: a swallowed error that leaves only
   * a number. A count tells you something is wrong; only the message tells you
   * what, and without it the operator is where the scan was.
   */
  failures: { snapshotId: string; reason: string }[];
  dryRun: boolean;
  chainAvailable: boolean;
}

/**
 * How many snapshots claim no anchor. Derived from state, never tracked through
 * a transition — a counter incremented at write time would have reported zero
 * failures for a run whose every attempt was swallowed.
 */
export async function countUnanchoredSnapshots(trackedUrlId?: string): Promise<number> {
  return prisma.urlSnapshot.count({
    where: { onChainTxHash: null, ...(trackedUrlId ? { trackedUrlId } : {}) },
  });
}

/** What anchoring one snapshot actually did. Named for the cost, not the field written. */
export type SnapshotAnchorOutcome =
  | { kind: 'COPIED_FROM_TWIN'; txHash: string }
  | { kind: 'RECOVERED'; txHash: string }
  | { kind: 'REGISTERED'; txHash: string }
  | { kind: 'REGISTERED_TX_UNKNOWN' };

/**
 * Anchor one snapshot's text, spending a transaction only if the fact is not
 * already on-chain.
 *
 * Extracted so the SCAN and the REPAIR cannot diverge, because they had. The
 * repair checked for a twin first; the scan called registerEvidenceHash
 * unconditionally, the registry rejected the duplicate, the rejection was
 * logged, and the row kept its null forever. Production still carries 71 of
 * those, every one of them a capture whose text IS on-chain under an earlier
 * twin, with nothing pointing at it.
 *
 * That is this repository's most-repeated defect: one rule, two
 * implementations, and the copies drift. The evidence-visibility rule reached
 * five copies; the MCP tool classification reached three. One function, two
 * callers.
 *
 * Order matters and each step is cheaper than the next:
 *   1. a twin in the database — free, no chain call at all
 *   2. the chain, in case an interrupted run registered without recording
 *   3. an actual registration
 */
export async function anchorOneSnapshot(
  web3: Web3Service,
  snapshotId: string,
  contentHash: string,
): Promise<SnapshotAnchorOutcome> {
  // Two captures with byte-identical text share a contentHash, and the registry
  // rejects a duplicate. A twin already anchored means the fact is on-chain and
  // only this row's pointer is missing — no transaction needed.
  const twin = await prisma.urlSnapshot.findFirst({
    where: { contentHash, NOT: { onChainTxHash: null }, id: { not: snapshotId } },
    select: { onChainTxHash: true },
  });
  if (twin?.onChainTxHash) {
    await prisma.urlSnapshot.update({
      where: { id: snapshotId },
      data: { onChainTxHash: twin.onChainTxHash },
    });
    return { kind: 'COPIED_FROM_TWIN', txHash: twin.onChainTxHash };
  }

  // Then the chain, because a previous interrupted run may have registered this
  // hash without recording the result. Re-registering would revert.
  const { registered } = await web3.isHashRegistered(toBytes32(contentHash));
  if (registered) {
    const recoveredTx = await web3.findRegisteringTxHash(toBytes32(contentHash));
    if (recoveredTx) {
      await prisma.urlSnapshot.update({
        where: { id: snapshotId },
        data: { onChainTxHash: recoveredTx },
      });
      return { kind: 'RECOVERED', txHash: recoveredTx };
    }
    // Registered but the transaction could not be located. Recording a null
    // would read as "never anchored" and invite a duplicate registration, so the
    // caller is told plainly rather than handed a false negative.
    return { kind: 'REGISTERED_TX_UNKNOWN' };
  }

  const txHash = await web3.registerEvidenceHash(
    toBytes32(contentHash),
    '0x0000000000000000000000000000000000000000',
    'Wayback Snapshot',
  );
  await prisma.urlSnapshot.update({ where: { id: snapshotId }, data: { onChainTxHash: txHash } });
  return { kind: 'REGISTERED', txHash };
}

export async function anchorSnapshots(opts: {
  url?: string;
  dryRun: boolean;
  limit?: number;
}): Promise<AnchorReport> {
  const snapshots = await prisma.urlSnapshot.findMany({
    where: {
      onChainTxHash: null,
      ...(opts.url ? { trackedUrl: { url: opts.url } } : {}),
    },
    select: { id: true, contentHash: true, snapshotDate: true },
    orderBy: { snapshotDate: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });

  const report: AnchorReport = {
    examined: snapshots.length,
    anchored: 0,
    copiedFromTwin: 0,
    recovered: 0,
    failed: 0,
    failures: [],
    dryRun: opts.dryRun,
    chainAvailable: true,
  };

  if (opts.dryRun || snapshots.length === 0) return report;

  let web3: Web3Service;
  try {
    web3 = new Web3Service();
  } catch (err) {
    report.failures.push({ snapshotId: '-', reason: err instanceof Error ? err.message : String(err) });
    // Distinct from "nothing to anchor". Reporting an unconfigured chain as a
    // clean run is precisely how this went unnoticed for a whole scan.
    report.chainAvailable = false;
    return report;
  }

  for (const snap of snapshots) {
    try {
      const outcome = await anchorOneSnapshot(web3, snap.id, snap.contentHash);
      switch (outcome.kind) {
        case 'COPIED_FROM_TWIN':
          report.copiedFromTwin++;
          break;
        case 'RECOVERED':
          report.recovered++;
          break;
        case 'REGISTERED':
          report.anchored++;
          break;
        case 'REGISTERED_TX_UNKNOWN':
          // On-chain, but the transaction could not be located. Counted as a
          // failure and left visible: writing nothing would read as "never
          // anchored" and invite a duplicate registration.
          report.failed++;
          report.failures.push({
            snapshotId: snap.id,
            reason: 'on-chain but registering tx not found',
          });
          break;
      }
    } catch (err) {
      // One snapshot must not abort the pass — but it is counted WITH its reason,
      // and the script exits non-zero on any failure.
      report.failed++;
      report.failures.push({
        snapshotId: snap.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
