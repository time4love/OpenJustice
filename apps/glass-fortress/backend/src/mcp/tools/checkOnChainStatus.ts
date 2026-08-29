import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  ON_CHAIN_EXPLANATIONS,
  ON_CHAIN_VERDICTS,
  type OnChainVerdict,
} from '../../lib/onChainVerdict';
import { observeOnChainStatus } from '../../services/onChainVerification';
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
// THE RULE NO LONGER LIVES HERE. Level 3a moved the verdict decision to
// lib/onChainVerdict.ts and the observation to services/onChainVerification.ts,
// so the write path reaches the same conclusion by the same code instead of a
// second copy of it. What remains here is this tool's own job: the human-facing
// report, including the capture summary the write path has no use for.
//
// Read-only against both sources. It never writes and never registers — which
// is why it calls `observeOnChainStatus` and not `recordOnChainCheck`.
// ---------------------------------------------------------------------------

export { ON_CHAIN_VERDICTS, type OnChainVerdict } from '../../lib/onChainVerdict';

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
    /** ISO-8601. When the earliest capture holding this text was TAKEN. */
    firstCapture: string;
    /** ISO-8601. When the latest capture holding this text was TAKEN. */
    lastCapture: string;
    onChainTxHash: string | null;
  };
  explanation: string;
}

/**
 * The only honest answer when the registry cannot be questioned.
 *
 * Never collapse a chain failure into `registered: false`. Absence of an answer
 * and a definitive negative license opposite decisions about an irreversible
 * write, and the caller cannot tell them apart once the distinction is lost.
 */
function chainUnavailable(fileHash: string, message: string): string {
  return JSON.stringify({
    fileHash,
    error: 'CHAIN_UNAVAILABLE',
    message,
    explanation:
      'The on-chain registry could not be reached, so no verdict is possible. This is not evidence that the hash is unregistered.',
  });
}

export async function checkOnChainStatusHandler(input: {
  fileHash: string;
  recoverTxHash?: boolean;
}): Promise<string> {
  const observation = await observeOnChainStatus(input.fileHash);
  if (!observation.reachable) return chainUnavailable(input.fileHash, observation.message);

  // The identity behind the claim, for the report only. `observeOnChainStatus`
  // reduces the local side to what the RULE needs — a status, a transaction, a
  // count — and this tool additionally names the record and the captures, which
  // is presentation rather than verdict.
  const record = observation.claim.inVault
    ? await prisma.evidence.findUnique({
        where: { fileHash: input.fileHash },
        select: { id: true },
      })
    : null;

  const snapshots =
    observation.claim.snapshots > 0
      ? await prisma.urlSnapshot.findMany({
          where: { contentHash: input.fileHash.replace(/^0x/, '') },
          select: {
            capturedAt: true,
            onChainTxHash: true,
            trackedUrl: { select: { url: true } },
          },
          // capturedAt, not waybackTimestamp. This summary reports WHEN the text
          // was captured, which every capture has; only archived ones have an
          // Archive timestamp. Ordering by a nullable column would also sort
          // non-archived captures to the end regardless of when they were taken
          // (Postgres ASC is NULLS LAST), making "lastCapture" report a null for
          // a corpus that simply contains a direct capture.
          orderBy: { capturedAt: 'asc' },
        })
      : [];

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
          firstCapture: snapshots[0].capturedAt.toISOString(),
          lastCapture: snapshots[snapshots.length - 1].capturedAt.toISOString(),
          // The transaction from whichever capture spent it — the twins record
          // the same value, and null means no capture of this text is anchored.
          onChainTxHash: snapshots.find((s) => s.onChainTxHash)?.onChainTxHash ?? null,
        }
      : null;

  const result: OnChainStatusResult = {
    fileHash: input.fileHash,
    verdict: observation.verdict,
    safeToPromote: observation.verdict === ON_CHAIN_VERDICTS.PENDING_UNREGISTERED,
    consistent: observation.consistent,
    database: {
      inVault: observation.claim.inVault,
      evidenceId: record?.id ?? null,
      status: observation.claim.status,
      onChainTxHash: observation.claim.txHash,
    },
    chain: {
      registered: observation.registered,
      registryEvidenceId: observation.registryEvidenceId,
    },
    ...(snapshotSummary ? { snapshot: snapshotSummary } : {}),
    explanation: ON_CHAIN_EXPLANATIONS[observation.verdict],
  };

  if (input.recoverTxHash && observation.registered && !observation.claim.txHash) {
    try {
      // Constructed rather than carried: `observeOnChainStatus` returns an
      // answer, not a live connection, and this optional second query is the
      // only reason a caller would need one.
      result.chain.recoveredTxHash = await new Web3Service().findRegisteringTxHash(input.fileHash);
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
