import { IntegrityCheckSubject } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Web3Service } from './Web3Service';
import { recordOnChainCheckNeverThrowing } from './onChainVerification';
import { toBytes32 } from '../lib/bytes32';
import {
  ANCHORABLE_CAPTURE_SELECT,
  anchoredCaptureHash,
  capturesAnchoredBy,
  storedAnchorHash,
  type AnchorableCapture,
  type StoredAnchorHash,
} from '../lib/anchoredCaptureHash';

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
  /**
   * copyOnly only. Texts anchored nowhere, which a copy-only run refuses to
   * publish. NOT counted as failures: the run did exactly what it promised. They
   * are listed so the operator sees which captures would cost money, and can
   * decide separately rather than inside a repair.
   */
  needsRegistration: { snapshotId: string; anchoredHash: string }[];
  /** copyOnly with no chain configured and no twin — undetermined, not unanchored. */
  chainNotConsulted: number;
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
  | { kind: 'REGISTERED_TX_UNKNOWN' }
  /**
   * copyOnly only. The text is on no twin and the registry does not hold it, so
   * publishing it would cost a real transaction. Reported instead of spent.
   *
   * This is the interesting outcome, not a failure to handle: it means a capture
   * whose text has never been anchored anywhere, which is a genuine gap in the
   * factual layer rather than a missing pointer.
   */
  | { kind: 'NEEDS_REGISTRATION' }
  /**
   * copyOnly with no chain configured, and no twin to copy. Nothing can be
   * concluded — distinct from NEEDS_REGISTRATION, which is a definite answer.
   * Collapsing the two would report "needs money" for a row that may well be
   * anchored already.
   */
  | { kind: 'CHAIN_NOT_CONSULTED' };

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
/**
 * Write an anchoring claim — the transaction AND the hash it registered,
 * together or not at all.
 *
 * Three outcomes leave a row asserting an anchor, and before this each wrote
 * `onChainTxHash` on its own. That is the gap `anchoredHash` exists to close, so
 * closing it with three more copies of the same pair would rebuild the defect
 * one layer up. One function, three callers.
 *
 * The hash is OBSERVED here in the only sense available at write time: it is the
 * value this code just asked the registry about. `forensics:confirm-anchors`
 * checks it against the transaction's own log afterwards, which is the stronger
 * observation and the one that can disagree.
 */
async function claimAnchor(
  snapshotId: string,
  txHash: string,
  anchoredHash: StoredAnchorHash,
): Promise<void> {
  await prisma.urlSnapshot.update({
    where: { id: snapshotId },
    data: { onChainTxHash: txHash, anchoredHash },
  });
}

export async function anchorOneSnapshot(
  web3: Web3Service | null,
  snapshotId: string,
  capture: AnchorableCapture,
  opts: { copyOnly?: boolean } = {},
): Promise<SnapshotAnchorOutcome> {
  // The CAPTURE is the parameter, never the hash. Which of a capture's hashes
  // the chain attests to is one rule with one home (`anchoredCaptureHash`), and
  // a caller that picks the hash itself is a caller that keeps its own answer
  // when the rule moves at Level 3.
  // Normalised HERE rather than at each of the three `claimAnchor` calls, so the
  // value that reaches the chain and the value that reaches the column are the
  // same object. The brand then makes a fourth call site impossible to write
  // without passing through this line.
  const anchoredHash = storedAnchorHash(anchoredCaptureHash(capture));
  /**
   * LEVEL 3a — every outcome that WRITES A POINTER is checked against the chain
   * and the verdict stored.
   *
   * Wrapped around the returns rather than appended after each `update`, because
   * there are three of them and this rule must not be one a fourth can miss.
   * The three that qualify are exactly the ones that leave the row asserting an
   * anchor: COPIED_FROM_TWIN, RECOVERED and REGISTERED. The rest assert nothing
   * — NEEDS_REGISTRATION and CHAIN_NOT_CONSULTED are honest reports that no
   * anchor was claimed, and REGISTERED_TX_UNKNOWN deliberately writes nothing.
   *
   * `toBytes32`, not the bare hex. Passing bare hex where bytes32 was required
   * is what made snapshot anchoring silently fail for 83 captures, and a
   * verification that repeated the mistake would confirm the wrong hash.
   */
  const verified = async (outcome: SnapshotAnchorOutcome): Promise<SnapshotAnchorOutcome> => {
    await recordOnChainCheckNeverThrowing({
      subjectType: IntegrityCheckSubject.URL_SNAPSHOT,
      subjectId: snapshotId,
      fileHash: toBytes32(anchoredHash),
    });
    return outcome;
  };

  // Two captures sharing an anchored hash are one fact to the registry, which
  // rejects the duplicate. A twin already anchored means the fact is on-chain
  // and only this row's pointer is missing — no transaction needed.
  //
  // How MANY captures share one is a property of the rule, not of this code:
  // measured on staging 2026-08-29, 105 captures collapse onto 15 `contentHash`
  // values and onto 104 `documentHash` values. Moving the anchor to the document
  // therefore makes twins nearly extinct and every capture cost a transaction.
  // That is a price, not a defect — the extraction's cheapness comes precisely
  // from its being blind to what it discards.
  const twin = await prisma.urlSnapshot.findFirst({
    where: {
      ...capturesAnchoredBy(anchoredHash),
      NOT: { onChainTxHash: null },
      id: { not: snapshotId },
    },
    select: { onChainTxHash: true },
  });
  if (twin?.onChainTxHash) {
    await claimAnchor(snapshotId, twin.onChainTxHash, anchoredHash);
    return verified({ kind: 'COPIED_FROM_TWIN', txHash: twin.onChainTxHash });
  }

  // No twin. Everything past this point needs the chain — and a twin copy did
  // not, which is why the chain is optional: a run whose every null has a twin
  // completes without an RPC endpoint at all.
  if (!web3) return { kind: 'CHAIN_NOT_CONSULTED' };

  // Then the chain, because a previous interrupted run may have registered this
  // hash without recording the result. Re-registering would revert.
  const { registered } = await web3.isHashRegistered(toBytes32(anchoredHash));
  if (registered) {
    const recoveredTx = await web3.findRegisteringTxHash(toBytes32(anchoredHash));
    if (recoveredTx) {
      await claimAnchor(snapshotId, recoveredTx, anchoredHash);
      return verified({ kind: 'RECOVERED', txHash: recoveredTx });
    }
    // Registered but the transaction could not be located. Recording a null
    // would read as "never anchored" and invite a duplicate registration, so the
    // caller is told plainly rather than handed a false negative.
    return { kind: 'REGISTERED_TX_UNKNOWN' };
  }

  // The register call is UNREACHABLE under copyOnly rather than guarded after
  // the fact. Everything above this line either reads the chain or copies a
  // pointer, so a copyOnly run cannot send a transaction by any path — which is
  // the property that makes it safe to run against production without deciding,
  // per row, whether spending is acceptable.
  if (opts.copyOnly) return { kind: 'NEEDS_REGISTRATION' };

  const txHash = await web3.registerEvidenceHash(
    toBytes32(anchoredHash),
    '0x0000000000000000000000000000000000000000',
    'Wayback Snapshot',
  );
  await claimAnchor(snapshotId, txHash, anchoredHash);
  return verified({ kind: 'REGISTERED', txHash });
}

export async function anchorSnapshots(opts: {
  url?: string;
  dryRun: boolean;
  limit?: number;
  /**
   * Fill pointers, never publish. The run becomes structurally incapable of
   * sending a transaction, so it can be pointed at production without deciding
   * row by row whether spending is acceptable.
   *
   * Also makes the chain optional: a twin copy is pure database work, so a
   * population whose every null has an anchored twin repairs completely with no
   * RPC endpoint configured.
   */
  copyOnly?: boolean;
}): Promise<AnchorReport> {
  const snapshots = await prisma.urlSnapshot.findMany({
    where: {
      onChainTxHash: null,
      ...(opts.url ? { trackedUrl: { url: opts.url } } : {}),
    },
    // `snapshotDate` was selected here and never read. Ordering is by
    // `capturedAt` (below) and the loop uses only the id and the anchorable
    // columns.
    select: { id: true, ...ANCHORABLE_CAPTURE_SELECT },
    // capturedAt, not snapshotDate. snapshotDate is day-granular, so captures
    // sharing a day sort equal and Postgres may return them in any order —
    // which makes `take: limit` select a different subset between runs.
    orderBy: { capturedAt: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });

  const report: AnchorReport = {
    examined: snapshots.length,
    anchored: 0,
    copiedFromTwin: 0,
    recovered: 0,
    needsRegistration: [],
    chainNotConsulted: 0,
    failed: 0,
    failures: [],
    dryRun: opts.dryRun,
    chainAvailable: true,
  };

  if (opts.dryRun || snapshots.length === 0) return report;

  let web3: Web3Service | null = null;
  try {
    web3 = new Web3Service();
  } catch (err) {
    report.chainAvailable = false;
    // Under copyOnly this is survivable rather than fatal: every twin copy is
    // pure database work. The run continues, and anything it could not decide
    // without the chain is counted in chainNotConsulted rather than guessed at.
    if (!opts.copyOnly) {
      report.failures.push({
        snapshotId: '-',
        reason: err instanceof Error ? err.message : String(err),
      });
      // Distinct from "nothing to anchor". Reporting an unconfigured chain as a
      // clean run is precisely how this went unnoticed for a whole scan.
      return report;
    }
  }

  for (const snap of snapshots) {
    try {
      const outcome = await anchorOneSnapshot(web3, snap.id, snap, {
        ...(opts.copyOnly ? { copyOnly: true } : {}),
      });
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
        case 'NEEDS_REGISTRATION':
          // Not a failure. The run promised not to spend and did not spend.
          report.needsRegistration.push({
            snapshotId: snap.id,
            anchoredHash: anchoredCaptureHash(snap),
          });
          break;
        case 'CHAIN_NOT_CONSULTED':
          report.chainNotConsulted++;
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

/**
 * Anchor a newly recorded capture, without letting a chain problem fail the write.
 *
 * Moved here from WaybackScraper when recordCapture became the single write
 * path (Level 1). It was a private function there, so the URL-tracking path
 * could not have reused it — anchoring would have been reimplemented or, more
 * likely, forgotten, which is precisely how 83 snapshots came to be stored
 * unanchored while an empty catch reported success.
 *
 * Its own Web3Service is constructed lazily and treated as optional: an
 * environment without chain credentials records captures and anchors nothing,
 * rather than refusing to record.
 */
let _anchorWeb3: Web3Service | null = null;
let _anchorWeb3Attempted = false;

function anchorWeb3Service(): Web3Service | null {
  if (_anchorWeb3Attempted) return _anchorWeb3;
  _anchorWeb3Attempted = true;
  try {
    _anchorWeb3 = new Web3Service();
  } catch {
    // env vars not set — on-chain registration disabled
  }
  return _anchorWeb3;
}

export async function registerSnapshotOnChain(
  snapshotId: string,
  capture: AnchorableCapture,
): Promise<SnapshotAnchorOutcome | null> {
  const web3 = anchorWeb3Service();
  if (!web3) return { kind: 'CHAIN_NOT_CONSULTED' };

  try {
    // Shared with the repair pass rather than reimplemented here. This used to
    // call registerEvidenceHash unconditionally: for a capture whose text a twin
    // had already anchored, the registry rejected the duplicate, the rejection
    // was logged as a failure, and the row kept its null forever — even though
    // the fact was on-chain the whole time. Production still holds 71 rows in
    // that state. anchorOneSnapshot checks for the twin first and copies its
    // transaction, so no transaction is spent and no pointer is lost.
    return await anchorOneSnapshot(web3, snapshotId, capture);
  } catch (err) {
    console.warn(
      '[anchorSnapshots] On-chain snapshot registration failed for',
      snapshotId,
      ':',
      err instanceof Error ? err.message : err,
    );
    // null means "the attempt failed", distinct from every SnapshotAnchorOutcome,
    // all of which describe an attempt that reached a conclusion. It never
    // rejects, so a caller that ignores the return is unchanged and a caller
    // that awaits it cannot be handed an unhandled rejection.
    return null;
  }
}
