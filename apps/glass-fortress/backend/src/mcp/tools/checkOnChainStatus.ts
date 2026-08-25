import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { Web3Service } from '../../services/Web3Service';

// ---------------------------------------------------------------------------
// check_on_chain_status
//
// Compares what the database CLAIMS about an evidence record against what the
// EvidenceRegistry contract actually holds, and names the discrepancy.
//
// This exists because the two can disagree, and did: a 2026-08-20 audit found
// 5 of 7 staging Evidence rows marked CONFIRMED with no matching on-chain
// registration. `CONFIRMED` is the platform's strongest evidentiary claim, so
// a row asserting it without an anchor is worse than an unpromoted row — it
// looks verified. Nothing reachable from MCP could detect that, which is why
// it went unnoticed for two months.
//
// Read-only against both sources. It never writes and never registers.
// ---------------------------------------------------------------------------

/**
 * Verdicts are named for the operator decision they imply, not for the field
 * values that produced them.
 */
export const ON_CHAIN_VERDICTS = {
  /** DB CONFIRMED, chain registered, tx hash recorded. Nothing to do. */
  CONSISTENT: 'CONSISTENT',
  /**
   * DB says CONFIRMED but the contract has never seen this hash. The record
   * asserts an anchor that does not exist. This is the fake-CONFIRMED class.
   */
  UNANCHORED_CONFIRMED: 'UNANCHORED_CONFIRMED',
  /**
   * Chain agrees the hash is registered, but the row records no tx hash, so
   * the anchor cannot be cited. Recoverable — pass recoverTxHash: true.
   */
  MISSING_TX_HASH: 'MISSING_TX_HASH',
  /** PENDING_REVIEW and unregistered. The normal pre-promotion state. */
  PENDING_UNREGISTERED: 'PENDING_UNREGISTERED',
  /**
   * PENDING_REVIEW, but the contract already holds this hash. Either a prior
   * promotion half-completed, or the hash collides with an orphaned anchor.
   * Promoting will revert as a duplicate — investigate before promoting.
   */
  PENDING_BUT_ANCHORED: 'PENDING_BUT_ANCHORED',
  /** No Evidence row and no registration. Nothing anywhere — nothing to reconcile. */
  NOT_IN_VAULT: 'NOT_IN_VAULT',
  /**
   * Registered on-chain with no Evidence row behind it. An anchor asserting a
   * record nobody can produce — the condition the 2026-08-20 audit found twice
   * and the reason this tool exists. Never report it as consistent.
   */
  ORPHANED_ANCHOR: 'ORPHANED_ANCHOR',
  /**
   * Registered on-chain, no Evidence row — and a UrlSnapshot holds this text.
   * Not an orphan: an archived capture, anchored exactly as the scanner is
   * meant to anchor it.
   *
   * Added 2026-08-25 after a tutorial run asked this tool about a snapshot hash
   * and was told to "investigate before registering anything else against this
   * hash". The verdict branched on `inVault`, which means an Evidence row and
   * nothing else, so every correctly-anchored capture reported as a data
   * integrity incident — 12 of production's 19 registrations, all of them
   * working as designed.
   *
   * The seventh instance of mechanism right, summary wrong. FINDING 95 already
   * wrote the argument against exactly this: a false alarm invites either a
   * repair that is not needed, or doubt about evidence whose custody is in fact
   * complete. The researcher who hit it did the second.
   */
  SNAPSHOT_ANCHOR: 'SNAPSHOT_ANCHOR',
} as const;

export type OnChainVerdict = (typeof ON_CHAIN_VERDICTS)[keyof typeof ON_CHAIN_VERDICTS];

/**
 * Verdicts in which the database and the contract actually agree.
 *
 * Deliberately a positive list. This was written as a negative filter — every
 * verdict except a few named ones counted as consistent — and NOT_IN_VAULT
 * therefore reported `consistent: true` even when the chain held the hash,
 * which is precisely an orphaned anchor. A positive list fails the safe way:
 * a verdict added later is inconsistent until someone says otherwise.
 */
const CONSISTENT_VERDICTS: ReadonlySet<OnChainVerdict> = new Set([
  ON_CHAIN_VERDICTS.CONSISTENT,
  ON_CHAIN_VERDICTS.PENDING_UNREGISTERED,
  ON_CHAIN_VERDICTS.NOT_IN_VAULT,
  // The database and the chain agree completely: the capture exists, its text is
  // registered. Reporting `consistent: false` here is what sent a researcher
  // looking for a custody problem that did not exist.
  ON_CHAIN_VERDICTS.SNAPSHOT_ANCHOR,
]);

export const checkOnChainStatusSchema = {
  fileHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'fileHash must be a 0x-prefixed 32-byte hex string')
    .describe('SHA-256 fileHash of the evidence record to verify, as returned by any create_evidence_* tool'),
  recoverTxHash: z
    .boolean()
    .optional()
    .describe(
      'When true, and the hash is registered on-chain but the row records no tx hash, scan the ' +
        'contract logs to recover it. Costs a bounded eth_getLogs query (a few seconds). Default false.',
    ),
};

interface OnChainStatusResult {
  fileHash: string;
  verdict: OnChainVerdict;
  safeToPromote: boolean;
  consistent: boolean;
  database: {
    inVault: boolean;
    evidenceId: string | null;
    status: string | null;
    onChainTxHash: string | null;
  };
  chain: {
    registered: boolean;
    /** The registry's own sequential id. Stringified — it is a uint256. */
    registryEvidenceId: string | null;
    recoveredTxHash?: string | null;
    /** Set when a tx-hash recovery scan failed, so `null` is not read as "none found". */
    recoveryError?: string;
  };
  /**
   * Present when this hash belongs to archived captures rather than an evidence
   * record.
   *
   * Carries the transaction because the Evidence lookup cannot: a caller was
   * previously shown `database.onChainTxHash: null` for a hash that
   * `list_captures` reports with a transaction, which reads as a contradiction
   * inside one system and is really two tables being asked one question.
   */
  snapshot?: {
    captures: number;
    url: string;
    firstCapture: string;
    lastCapture: string;
    onChainTxHash: string | null;
  };
  explanation: string;
}

const EXPLANATIONS: Record<OnChainVerdict, string> = {
  CONSISTENT:
    'The database and the contract agree, and the anchoring transaction is recorded. This record can be cited as on-chain evidence.',
  UNANCHORED_CONFIRMED:
    'The record claims CONFIRMED but the contract has no registration for this hash. The evidentiary claim is unsupported — treat the record as unverified until it is registered.',
  MISSING_TX_HASH:
    'The hash is registered on-chain but the row does not record which transaction did it, so the anchor cannot be cited. Re-run with recoverTxHash: true.',
  PENDING_UNREGISTERED:
    'Awaiting review, not yet anchored. This is the expected state before promotion.',
  PENDING_BUT_ANCHORED:
    'The contract already holds this hash while the row is still PENDING_REVIEW. Promotion would revert as a duplicate. Investigate the existing anchor before promoting.',
  NOT_IN_VAULT:
    'No evidence record exists for this hash, and the registry does not hold it either. There is nothing to reconcile.',
  ORPHANED_ANCHOR:
    'The registry holds this hash but no evidence record exists for it. Something anchored a record that cannot now be produced — investigate before registering anything else against this hash.',
  SNAPSHOT_ANCHOR:
    'This is an archived capture, not an evidence record, and its text is registered on-chain exactly as intended. Nothing is wrong and nothing needs repairing. A capture is anchored by its TEXT, so several captures of an unchanged page share one registration and one transaction; `snapshot.onChainTxHash` is the transaction that anchors this text, whichever capture spent it. To see the evidence records derived from this page, use get_scan_findings or search_evidence.',
};

function decideVerdict(
  inVault: boolean,
  status: string | null,
  txHash: string | null,
  registered: boolean,
  isSnapshot: boolean,
): OnChainVerdict {
  if (!inVault) {
    if (!registered) return ON_CHAIN_VERDICTS.NOT_IN_VAULT;
    // An anchored capture is not an orphan. Checked before the orphan branch
    // because "no Evidence row" is true of every snapshot in the system, and
    // reading that as an integrity failure is what made this tool alarm on 12 of
    // production's 19 registrations.
    return isSnapshot ? ON_CHAIN_VERDICTS.SNAPSHOT_ANCHOR : ON_CHAIN_VERDICTS.ORPHANED_ANCHOR;
  }

  if (status === 'CONFIRMED') {
    if (!registered) return ON_CHAIN_VERDICTS.UNANCHORED_CONFIRMED;
    return txHash ? ON_CHAIN_VERDICTS.CONSISTENT : ON_CHAIN_VERDICTS.MISSING_TX_HASH;
  }

  return registered
    ? ON_CHAIN_VERDICTS.PENDING_BUT_ANCHORED
    : ON_CHAIN_VERDICTS.PENDING_UNREGISTERED;
}

/**
 * The only honest answer when the registry cannot be questioned.
 *
 * Never collapse a chain failure into `registered: false`. Absence of an answer
 * and a definitive negative license opposite decisions about an irreversible
 * write, and the caller cannot tell them apart once the distinction is lost.
 */
function chainUnavailable(fileHash: string, err: unknown): string {
  return JSON.stringify({
    fileHash,
    error: 'CHAIN_UNAVAILABLE',
    message: err instanceof Error ? err.message : String(err),
    explanation:
      'The on-chain registry could not be reached, so no verdict is possible. This is not evidence that the hash is unregistered.',
  });
}

export async function checkOnChainStatusHandler(input: {
  fileHash: string;
  recoverTxHash?: boolean;
}): Promise<string> {
  const record = await prisma.evidence.findUnique({
    where: { fileHash: input.fileHash },
    select: { id: true, status: true, onChainTxHash: true },
  });

  // Only when there is no Evidence row. A hash is one or the other, and the
  // query is skipped in the common case so the tool costs what it did before.
  //
  // `contentHash` is stored bare hex while fileHash is 0x-prefixed — the same
  // mismatch that made snapshot anchoring silently fail for 83 snapshots by
  // passing bare hex where bytes32 was required.
  const snapshots = record
    ? []
    : await prisma.urlSnapshot.findMany({
        where: { contentHash: input.fileHash.replace(/^0x/, '') },
        select: {
          waybackTimestamp: true,
          onChainTxHash: true,
          trackedUrl: { select: { url: true } },
        },
        orderBy: { waybackTimestamp: 'asc' },
      });

  let web3: Web3Service;
  try {
    web3 = new Web3Service();
  } catch (err) {
    // Misconfiguration — RPC_URL, key, or contract address absent.
    return chainUnavailable(input.fileHash, err);
  }

  // A CONFIGURED chain can still be unreachable, and that is the common case:
  // a public RPC returning "no backend is currently healthy" surfaces here as
  // an ethers CALL_EXCEPTION, not as a constructor failure. Left unguarded it
  // escaped as a raw exception where this tool promises a verdict — found on
  // the first real call against a real endpoint, 2026-08-22.
  let registered: boolean;
  let registryEvidenceId: bigint;
  try {
    ({ registered, evidenceId: registryEvidenceId } = await web3.isHashRegistered(input.fileHash));
  } catch (err) {
    return chainUnavailable(input.fileHash, err);
  }

  const status = record?.status ?? null;
  const txHash = record?.onChainTxHash ?? null;
  const verdict = decideVerdict(Boolean(record), status, txHash, registered, snapshots.length > 0);

  // Summarised here rather than inline: guarding on `length` is the only honest
  // test, because without noUncheckedIndexedAccess the element type claims
  // snapshots[0] is always defined and a `first && last` check reads to the
  // compiler as dead code while being the thing that stops a crash on an empty
  // array.
  //
  // Built whenever captures hold this text, including when the chain does NOT —
  // a capture whose text was never registered is a real gap, and hiding the
  // captures would leave the caller unable to see which page it belongs to.
  const snapshotSummary =
    snapshots.length > 0
      ? {
          captures: snapshots.length,
          url: snapshots[0].trackedUrl.url,
          firstCapture: snapshots[0].waybackTimestamp,
          lastCapture: snapshots[snapshots.length - 1].waybackTimestamp,
          // The transaction from whichever capture spent it — the twins record
          // the same value, and null means no capture of this text is anchored.
          onChainTxHash: snapshots.find((s) => s.onChainTxHash)?.onChainTxHash ?? null,
        }
      : null;

  const result: OnChainStatusResult = {
    fileHash: input.fileHash,
    verdict,
    safeToPromote: verdict === ON_CHAIN_VERDICTS.PENDING_UNREGISTERED,
    consistent: CONSISTENT_VERDICTS.has(verdict),
    database: {
      inVault: Boolean(record),
      evidenceId: record?.id ?? null,
      status,
      onChainTxHash: txHash,
    },
    chain: {
      registered,
      registryEvidenceId: registered ? registryEvidenceId.toString() : null,
    },
    ...(snapshotSummary ? { snapshot: snapshotSummary } : {}),
    explanation: EXPLANATIONS[verdict],
  };

  if (input.recoverTxHash && registered && !txHash) {
    try {
      result.chain.recoveredTxHash = await web3.findRegisteringTxHash(input.fileHash);
    } catch (err) {
      // The verdict above is already established and stays valid — only the
      // convenience lookup failed. But an unannotated null would read as "no
      // registering transaction exists", which is a different claim entirely.
      result.chain.recoveredTxHash = null;
      result.chain.recoveryError = err instanceof Error ? err.message : String(err);
    }
  }

  return JSON.stringify(result);
}
