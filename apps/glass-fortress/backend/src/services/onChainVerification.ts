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
import { normaliseAddress } from '../lib/anchoringTarget';
import { readChainIdentity } from '../lib/chainIdentity';
import { capturesAnchoredBy } from '../lib/anchoredCaptureHash';

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
      registry: ObservedRegistry;
    }
  | {
      reachable: false;
      /** Why the registry could not be questioned. Stored, never collapsed. */
      message: string;
      claim: OnChainClaim;
      registry: ObservedRegistry;
    };

/**
 * WHICH REGISTRY WAS ACTUALLY ASKED — reported on both arms, because a verdict
 * that does not name its registry is not a fact about one.
 *
 * OBSERVED, NOT CONFIGURED, and the distinction is the whole incident. On
 * 2026-08-29 the deployment believed it was production and its RPC was Base
 * Sepolia; stamping the belief would have written `8453` onto ninety-one rows
 * read off chain `84532` and made them indistinguishable from correct ones a
 * second time. `chainId` is what the RPC reported, so a wrong environment
 * records itself.
 *
 * `chainId` is null only when the chain could not be reached at all, which the
 * audit reads as no current answer rather than as a pass.
 */
export interface ObservedRegistry {
  chainId: number | null;
  registryAddress: string | null;
}

/** Where a hash's local claim is read from — one query shape, one meaning. */
export async function readOnChainClaim(fileHash: string): Promise<OnChainClaim> {
  const record = await prisma.evidence.findUnique({
    where: { fileHash },
    select: { status: true, onChainTxHash: true },
  });

  // Only when there is no Evidence row. A hash is one or the other, and the
  // query is skipped in the common case so the check costs what it did before.
  //
  // `capturesAnchoredBy` owns both which column is asked and the 0x strip. That
  // strip is load-bearing: fileHash carries the prefix and the capture columns do
  // not, and a lookup returning zero rows here turns SNAPSHOT_ANCHOR into
  // ORPHANED_ANCHOR — reporting every correctly anchored capture as a custody
  // incident, which has already happened to 12 of production's 19 registrations.
  const snapshots = record
    ? 0
    : await prisma.urlSnapshot.count({ where: capturesAnchoredBy(fileHash) });

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

  // Read the identity of the chain being asked BEFORE asking it anything, from
  // the wallet-free path: "which registry is this?" is not a signed question,
  // and a deployment that cannot answer it must not be trusted with the answer
  // to the signed one. Both calls resolve the same RPC_URL and
  // EVIDENCE_REGISTRY_ADDRESS in the same process, so the identity reported here
  // is the identity of the registry queried below.
  const identity = await readChainIdentity();
  const registry: ObservedRegistry = identity.reachable
    ? {
        chainId: identity.chainId,
        registryAddress: normaliseAddress(identity.registryAddress),
      }
    : {
        chainId: null,
        registryAddress:
          identity.registryAddress === null ? null : normaliseAddress(identity.registryAddress),
      };

  let web3: Web3Service;
  try {
    web3 = new Web3Service();
  } catch (err) {
    return { reachable: false, message: messageOf(err), claim, registry };
  }

  let registered: boolean;
  let registryEvidenceId: bigint;
  try {
    ({ registered, evidenceId: registryEvidenceId } = await web3.isHashRegistered(fileHash));
  } catch (err) {
    return { reachable: false, message: messageOf(err), claim, registry };
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
    registry,
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

  const detail: Record<string, Prisma.InputJsonValue | null> = observation.reachable
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
      detail: { ...detail, deploymentCommitSha: process.env.RAILWAY_GIT_COMMIT_SHA ?? null },
      // OFF THE OBSERVATION, never off configuration — see ObservedRegistry.
      // Recorded even when the chain was unreachable: an UNAVAILABLE verdict is
      // still a verdict about a specific registry, and one that cannot name it
      // is exactly the row these columns exist to make visible.
      chainId: observation.registry.chainId,
      registryAddress: observation.registry.registryAddress,
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
