import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import {
  ON_CHAIN_EXPLANATIONS,
  ON_CHAIN_VERDICTS,
  type OnChainVerdict,
} from '../../lib/onChainVerdict';
import { observeOnChainStatus } from '../../services/onChainVerification';
import { Web3Service } from '../../services/Web3Service';
import { capturesAnchoredBy } from '../../lib/anchoredCaptureHash';

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
  /**
   * WHAT THIS ROW'S OWN TRANSACTION WAS OBSERVED TO REGISTER — the question
   * `verdict` does not ask.
   *
   * `verdict: CONSISTENT` means the hash is registered and the row carries a
   * transaction hash. It never asks whether THAT transaction registered THIS
   * hash, which is the question that can fail and the one
   * `forensics:confirm-anchors` exists for. Surfacing the two columns it writes
   * is what stops a caller reading consistency as attribution — a reading this
   * tool actively invited on 2026-08-30, about a record the audit calls
   * UNATTRIBUTED, to a session that had just published a thesis citing it.
   */
  attribution: {
    /** The hash observed in the transaction's own log. Null when never observed. */
    anchoredHash: string | null;
    /**
     * The stored terminal verdict from `forensics:confirm-anchors`. Null means
     * the question has never been asked — which is NOT the same as an answer,
     * and TX_UNREADABLE is an answer rather than a gap.
     */
    anchorCheck: string | null;
    /** True only when the recorded transaction was observed registering THIS hash. */
    confirmed: boolean;
  };
  explanation: string;
}

/**
 * One sentence naming what attribution is known, appended to the verdict's own
 * explanation. Never silent: "not asked" and "asked, terminally unanswerable"
 * license different decisions and must not collapse into the same absence.
 */
export function attributionSentence(
  a: { anchoredHash: string | null; anchorCheck: string | null; confirmed: boolean },
  fileHash: string,
): string {
  if (a.confirmed) {
    return 'ATTRIBUTION CONFIRMED: the transaction this row records was observed registering this hash.';
  }
  if (a.anchoredHash !== null && a.anchoredHash !== fileHash) {
    return `ATTRIBUTION MISMATCH: the transaction this row records was observed registering ${a.anchoredHash}, not this hash. Do not cite it for this hash.`;
  }
  if (a.anchorCheck !== null) {
    return `ATTRIBUTION NOT ESTABLISHED, and the answer is terminal: anchorCheck is ${a.anchorCheck}. The registration is real; which transaction made it is not recoverable. Do not cite this as a verified anchor.`;
  }
  return 'ATTRIBUTION NEVER OBSERVED: nothing has checked whether the recorded transaction registered this hash. Run forensics:confirm-anchors before citing it as verified.';
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
        // anchoredHash / anchorCheck are what `forensics:confirm-anchors` writes,
        // and until 2026-08-30 no tool exposed either — so a row's attribution
        // state had to be believed rather than read.
        select: { id: true, anchoredHash: true, anchorCheck: true },
      })
    : null;

  const snapshots =
    observation.claim.snapshots > 0
      ? await prisma.urlSnapshot.findMany({
          where: capturesAnchoredBy(input.fileHash),
          select: {
            capturedAt: true,
            onChainTxHash: true,
            anchoredHash: true,
            anchorCheck: true,
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

  // The subject the verdict is ABOUT: the evidence row when there is one, else
  // whichever capture carries an observed hash, else any capture. `.at(0)`
  // rather than `[0]` — the two debt ratchets disagree about indexed access and
  // only `.at` is typed `T | undefined` unconditionally.
  const attributionSource: { anchoredHash: string | null; anchorCheck: string | null } | null =
    record ?? snapshots.find((s) => s.anchoredHash !== null) ?? snapshots.at(0) ?? null;
  const attribution = {
    anchoredHash: attributionSource?.anchoredHash ?? null,
    anchorCheck: attributionSource?.anchorCheck ?? null,
    confirmed: attributionSource?.anchoredHash === input.fileHash,
  };

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
    attribution,
    explanation: `${ON_CHAIN_EXPLANATIONS[observation.verdict]} ${attributionSentence(attribution, input.fileHash)}`,
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
