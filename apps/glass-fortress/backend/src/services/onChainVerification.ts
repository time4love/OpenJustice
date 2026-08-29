import {
  IntegrityCheckSubject,
  IntegrityCheckType,
  IntegrityCheckVerdict,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  CONSISTENT_VERDICTS,
  ON_CHAIN_CHECK_VERSION,
  ON_CHAIN_EXPLANATIONS,
  decideOnChainVerdict,
  onChainSourceStateHash,
  type OnChainClaim,
  type OnChainVerdict,
} from '../lib/onChainVerdict';
import { Web3Service } from './Web3Service';

/**
 * LEVEL 3a — THE CHECK RUNS ON THE WRITE PATH, AND ITS VERDICT IS STORED.
 *
 * WHY THIS MODULE EXISTS. `checkOnChainStatus` was reachable only as an MCP
 * tool. So the platform's strongest evidentiary claim — CONFIRMED, anchored,
 * citable — was asserted by the write path and verified only if a human
 * remembered to ask afterwards. §3 of the rebuild plan calls that a check that
 * has not been performed, and the 2026-08-20 audit is what it looks like when
 * nobody asks: 5 of 7 staging rows marked CONFIRMED with no anchor behind them,
 * unnoticed for two months.
 *
 * ONE IMPLEMENTATION, THREE KINDS OF CALLER, mirroring `computeDiffSurvival`
 * one level up:
 *
 *   - `promoteEvidence` / `promoteForensicDiff` — a record has just claimed to
 *     be anchored, and the claim is checked before anyone can rely on it
 *   - `anchorSnapshots`                         — a capture has just been
 *     registered, or had a pointer copied
 *   - `checkOnChainStatus` (MCP)                — a person asking directly
 *
 * The first two STORE the verdict; the third reads the chain without writing,
 * because a read-only tool that writes is a different tool.
 *
 * `UNAVAILABLE` IS NOT A PASS, and this module is where that is made true
 * rather than documented. `observeOnChainStatus` returns a discriminated union
 * whose unreachable arm carries no verdict at all, so there is no shape in
 * which a caller can read a chain failure as agreement — it has to handle the
 * arm to get at anything.
 */

/**
 * What the chain and the database jointly said, or that the chain would not say.
 *
 * A DISCRIMINATED UNION rather than a verdict plus an error field. The old MCP
 * tool returned a different JSON shape on chain failure, which worked because
 * its only consumer was a human reading prose. A caller that must not treat
 * silence as assent needs the compiler's help: with `reachable: false` there is
 * no `verdict` property to misread, so `if (!obs.reachable) …` is not a
 * convention anyone can forget.
 */
export type OnChainObservation =
  | {
      reachable: true;
      verdict: OnChainVerdict;
      consistent: boolean;
      registered: boolean;
      registryEvidenceId: string | null;
      claim: OnChainClaim;
      explanation: string;
    }
  | {
      reachable: false;
      /** Why the registry could not be questioned. Stored, never collapsed. */
      message: string;
      claim: OnChainClaim;
    };

/** Where a hash's local claim is read from — one query shape, one meaning. */
export async function readOnChainClaim(fileHash: string): Promise<OnChainClaim> {
  const record = await prisma.evidence.findUnique({
    where: { fileHash },
    select: { status: true, onChainTxHash: true },
  });

  // Only when there is no Evidence row. A hash is one or the other, and the
  // query is skipped in the common case so the check costs what it did before.
  //
  // `contentHash` is stored bare hex while fileHash is 0x-prefixed — the same
  // mismatch that made snapshot anchoring silently fail for 83 snapshots by
  // passing bare hex where bytes32 was required.
  const snapshots = record
    ? 0
    : await prisma.urlSnapshot.count({ where: { contentHash: fileHash.replace(/^0x/, '') } });

  return {
    inVault: Boolean(record),
    status: record?.status ?? null,
    txHash: record?.onChainTxHash ?? null,
    snapshots,
  };
}

/**
 * Ask the contract, and pair its answer with what the database claims.
 *
 * Reads only. Both failure modes of the chain are folded into `reachable:
 * false` on purpose: a missing RPC configuration and a healthy-backend-less
 * public endpoint license the same decision — decide nothing — and the message
 * carries which one it was. Absence of an answer is never a definitive
 * negative, because the two license opposite decisions about an irreversible
 * write and the caller cannot tell them apart once the distinction is lost.
 */
export async function observeOnChainStatus(fileHash: string): Promise<OnChainObservation> {
  const claim = await readOnChainClaim(fileHash);

  let web3: Web3Service;
  try {
    web3 = new Web3Service();
  } catch (err) {
    return { reachable: false, message: messageOf(err), claim };
  }

  let registered: boolean;
  let registryEvidenceId: bigint;
  try {
    ({ registered, evidenceId: registryEvidenceId } = await web3.isHashRegistered(fileHash));
  } catch (err) {
    return { reachable: false, message: messageOf(err), claim };
  }

  const verdict = decideOnChainVerdict(claim, registered);
  return {
    reachable: true,
    verdict,
    consistent: CONSISTENT_VERDICTS.has(verdict),
    registered,
    registryEvidenceId: registered ? registryEvidenceId.toString() : null,
    claim,
    explanation: ON_CHAIN_EXPLANATIONS[verdict],
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The coarse verdict a stored check records.
 *
 * `CONSISTENT_VERDICTS` is the single definition of agreement, reused rather
 * than re-listed: a verdict added to the on-chain set later is CONTRADICTED
 * here until someone deliberately admits it, which is the same fail-safe
 * direction that positive list was written for.
 */
function storedVerdictFor(observation: OnChainObservation): IntegrityCheckVerdict {
  if (!observation.reachable) return IntegrityCheckVerdict.UNAVAILABLE;
  return observation.consistent
    ? IntegrityCheckVerdict.VERIFIED
    : IntegrityCheckVerdict.CONTRADICTED;
}

/**
 * A stored check, as its caller sees it.
 *
 * A DISCRIMINATED UNION for the same reason `OnChainObservation` is one: only an
 * unreachable chain produces UNAVAILABLE, and only UNAVAILABLE lacks a specific
 * on-chain verdict. Written as a flat interface with a nullable field, that
 * invariant is a comment, and every consumer has to re-derive it — usually by
 * interpolating a possibly-null value into a sentence.
 */
export type RecordedOnChainCheck =
  | {
      verdict: typeof IntegrityCheckVerdict.VERIFIED | typeof IntegrityCheckVerdict.CONTRADICTED;
      onChainVerdict: OnChainVerdict;
      explanation: string;
    }
  | {
      verdict: typeof IntegrityCheckVerdict.UNAVAILABLE;
      onChainVerdict: null;
      explanation: string;
    };

/**
 * Run the check against a subject and STORE the verdict. The write path's call.
 *
 * NEVER THROWS ON A CHAIN FAILURE. This runs immediately after an irreversible
 * on-chain write, and a promotion that has already spent a transaction must not
 * be reported as failed because the verification read afterwards could not
 * reach the same endpoint. An unreachable chain is recorded as UNAVAILABLE —
 * which is a verdict about the check and never a pass — and the caller is told,
 * so the fact travels instead of evaporating.
 *
 * A DATABASE failure is different and is allowed to propagate: if the verdict
 * cannot be stored, the check has not been performed, and silently continuing
 * would recreate exactly the state this level exists to end.
 */
export async function recordOnChainCheck(input: {
  subjectType: IntegrityCheckSubject;
  subjectId: string;
  fileHash: string;
}): Promise<RecordedOnChainCheck> {
  const observation = await observeOnChainStatus(input.fileHash);
  const verdict = storedVerdictFor(observation);

  const detail: Prisma.InputJsonValue = observation.reachable
    ? {
        onChainVerdict: observation.verdict,
        registered: observation.registered,
        registryEvidenceId: observation.registryEvidenceId,
        fileHash: input.fileHash,
        explanation: observation.explanation,
      }
    : {
        onChainVerdict: null,
        fileHash: input.fileHash,
        error: 'CHAIN_UNAVAILABLE',
        message: observation.message,
        explanation:
          'The on-chain registry could not be reached, so no verdict is possible. ' +
          'This is not evidence that the hash is unregistered.',
      };

  await prisma.integrityCheck.create({
    data: {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      checkType: IntegrityCheckType.ON_CHAIN_ANCHOR,
      verdict,
      detail,
      // The SAME claim the verdict was reached against, so the commitment is to
      // what was actually checked rather than to what the row holds afterwards.
      sourceStateHash: onChainSourceStateHash({
        fileHash: input.fileHash,
        claim: observation.claim,
      }),
      verifierVersion: ON_CHAIN_CHECK_VERSION,
    },
  });

  // Narrowed off `observation`, not off `verdict`: the observation is what
  // actually determines whether there is an on-chain verdict to report, and
  // deriving the union's discriminant from the same value that produced it is
  // what keeps the two from ever disagreeing.
  if (!observation.reachable) {
    return {
      verdict: IntegrityCheckVerdict.UNAVAILABLE,
      onChainVerdict: null,
      explanation:
        `The anchor could not be verified: ${observation.message}. This is not evidence that ` +
        'the hash is unregistered, and it is not a pass — the check is recorded as UNAVAILABLE.',
    };
  }
  return {
    verdict: observation.consistent
      ? IntegrityCheckVerdict.VERIFIED
      : IntegrityCheckVerdict.CONTRADICTED,
    onChainVerdict: observation.verdict,
    explanation: observation.explanation,
  };
}

/**
 * NEVER LET VERIFICATION FAIL A WRITE THAT ALREADY HAPPENED.
 *
 * The write paths call this. The transaction is spent and the row is updated
 * before the check runs, so throwing here would report a completed promotion as
 * an error and invite a retry that reverts as a duplicate. The failure is
 * logged and returned as null, which every caller renders as "not verified" —
 * the one thing it must never render as is verified.
 */
export async function recordOnChainCheckNeverThrowing(input: {
  subjectType: IntegrityCheckSubject;
  subjectId: string;
  fileHash: string;
}): Promise<RecordedOnChainCheck | null> {
  try {
    return await recordOnChainCheck(input);
  } catch (err) {
    console.error(
      '[onChainVerification] failed to record the anchor check for',
      input.subjectType,
      input.subjectId,
      messageOf(err),
    );
    return null;
  }
}

/**
 * The newest check of one kind for one subject.
 *
 * The table is append-only, so "the current verdict" is a read rather than a
 * column. Ordered by `checkedAt` and then by `id` so two checks recorded inside
 * the same millisecond still resolve to a stable, defined answer rather than to
 * whichever row Postgres happens to return first.
 */
export async function latestOnChainCheck(
  subjectType: IntegrityCheckSubject,
  subjectId: string,
): Promise<{
  verdict: IntegrityCheckVerdict;
  checkedAt: Date;
  verifierVersion: string;
  sourceStateHash: string;
  detail: Prisma.JsonValue;
} | null> {
  const row = await prisma.integrityCheck.findFirst({
    where: { subjectType, subjectId, checkType: IntegrityCheckType.ON_CHAIN_ANCHOR },
    orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    select: {
      verdict: true,
      checkedAt: true,
      verifierVersion: true,
      sourceStateHash: true,
      detail: true,
    },
  });
  return row;
}
