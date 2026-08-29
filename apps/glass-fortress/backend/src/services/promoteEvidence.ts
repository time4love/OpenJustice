import { IntegrityCheckSubject, type Evidence } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Web3Service } from './Web3Service';
import { VectorStoreService } from './VectorStoreService';
import { investigativeCategoriesField } from '../lib/investigativeCategories';
import { registerEvidenceOnChain } from './evidenceOnChain';
import {
  recordOnChainCheckNeverThrowing,
  type RecordedOnChainCheck,
} from './onChainVerification';

let _web3: Web3Service | null = null;
let _vectorStorePromise: Promise<VectorStoreService> | null = null;

function getWeb3(): Web3Service {
  if (!_web3) _web3 = new Web3Service();
  return _web3;
}

function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStorePromise) {
    _vectorStorePromise = VectorStoreService.create().catch((err: unknown) => {
      _vectorStorePromise = null;
      throw err;
    });
  }
  return _vectorStorePromise;
}

export interface PromoteEvidenceResult {
  promoted: boolean;
  alreadyConfirmed?: boolean;
  evidenceId: string;
  fileHash: string;
  txHash: string;
  message: string;
  /**
   * LEVEL 3a — WHAT THE CHAIN ITSELF SAID, after the write.
   *
   * The promotion above is an ASSERTION that this record is anchored; this is
   * the CHECK of it, recorded as an IntegrityCheck row rather than left for
   * whoever remembers to call check_on_chain_status. Null means even the check
   * could not be recorded, which is the one thing that must never be read as a
   * pass — see `anchorVerificationLine`.
   */
  anchorVerification: RecordedOnChainCheck | null;
}

/**
 * One sentence about the anchor, for every promotion result.
 *
 * WRITTEN AS A FUNCTION so that all three outcomes — verified, contradicted,
 * and could-not-check — are produced in one place. A message assembled per call
 * site is how "we could not check" comes to be phrased like "we checked", which
 * is the §3 conflation this level exists to end.
 */
function anchorVerificationLine(check: RecordedOnChainCheck | null): string {
  if (!check) {
    return (
      ' The anchor check could not be recorded, so this record is NOT verified — ' +
      'run check_on_chain_status before citing it.'
    );
  }
  if (check.verdict === 'VERIFIED') return ` Anchor verified on-chain: ${check.onChainVerdict}.`;
  if (check.verdict === 'UNAVAILABLE') return ` Anchor NOT verified: ${check.explanation}`;
  return ` Anchor check CONTRADICTED (${check.onChainVerdict}): ${check.explanation}`;
}

/**
 * Register evidence on-chain, upsert its embedding for vector search, and
 * mark it CONFIRMED. Shared by the REST /promote route (looks up by
 * fileHash) and the MCP promote_evidence tool (looks up by id) — both
 * resolve their own `Evidence` record and hand it to this function, which
 * does the rest identically for both paths.
 */
export async function promoteEvidence(record: Evidence): Promise<PromoteEvidenceResult> {
  if (record.status === 'CONFIRMED') {
    // THE CHECK RUNS HERE TOO, and this path is the reason Level 3a exists.
    //
    // Nothing is written, so it is tempting to return early. But this branch
    // ASSERTS "already CONFIRMED and registered on-chain" without ever having
    // asked the contract — which is precisely the sentence the 2026-08-20 audit
    // found to be false on 5 of 7 staging rows. A path that repeats an
    // unverified claim is the path where an unverified claim survives.
    const check = await recordOnChainCheckNeverThrowing({
      subjectType: IntegrityCheckSubject.EVIDENCE,
      subjectId: record.id,
      fileHash: record.fileHash,
    });
    return {
      promoted: false,
      alreadyConfirmed: true,
      evidenceId: record.id,
      fileHash: record.fileHash,
      txHash: 'already-on-chain',
      message: 'Evidence is already CONFIRMED and registered on-chain.' + anchorVerificationLine(check),
      anchorVerification: check,
    };
  }

  // 1. Register on-chain — ZeroAddress preserves submitter anonymity
  const registration = await registerEvidenceOnChain(
    getWeb3(),
    record.fileHash,
    investigativeCategoriesField.parse(record.investigativeCategories),
    record.evidenceRole,
  );

  // getWeb3() always returns a real instance or throws (never null), so the
  // only way registration.confirmed is false here is an unrecoverable
  // duplicate (registered on-chain, but its original transaction couldn't be
  // found — see Web3Service.findRegisteringTxHash). Leave the record exactly
  // as it was: never mark CONFIRMED without a real transaction hash to show
  // for it.
  if (!registration.confirmed) {
    const check = await recordOnChainCheckNeverThrowing({
      subjectType: IntegrityCheckSubject.EVIDENCE,
      subjectId: record.id,
      fileHash: record.fileHash,
    });
    return {
      promoted: false,
      evidenceId: record.id,
      fileHash: record.fileHash,
      txHash: '',
      message:
        'This hash is already registered on-chain, but its original transaction could not be ' +
        'located — left as PENDING_REVIEW rather than confirmed without proof. Try again shortly.' +
        anchorVerificationLine(check),
      anchorVerification: check,
    };
  }
  const txHash = registration.txHash;

  // 2. Upsert embedding to Pinecone — best-effort with 15s timeout.
  // Failure here does not block promotion; on-chain hash is the source of truth.
  try {
    await Promise.race([
      getVectorStore().then((vs) => vs.upsertEvidence(record.summary, record.fileHash)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Vector upsert timed out')), 15_000),
      ),
    ]);
  } catch (err) {
    console.warn(
      '[promoteEvidence] vector upsert failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  // 3. Mark CONFIRMED in Prisma, with the real transaction hash that earned it.
  await prisma.evidence.update({
    where: { id: record.id },
    data: { status: 'CONFIRMED', onChainTxHash: txHash },
  });

  // 4. LEVEL 3a — ask the contract whether the claim just written is true.
  //
  // AFTER the update, never before: the check reads the database claim, and a
  // verdict reached against the pre-promotion row would describe a state that
  // no longer exists the moment it is stored. Its `sourceStateHash` would then
  // certify freshness for a claim that had already moved.
  const check = await recordOnChainCheckNeverThrowing({
    subjectType: IntegrityCheckSubject.EVIDENCE,
    subjectId: record.id,
    fileHash: record.fileHash,
  });

  return {
    promoted: true,
    evidenceId: record.id,
    fileHash: record.fileHash,
    txHash,
    message:
      `Evidence promoted to CONFIRMED. Hash registered on-chain (tx: ${txHash}). ` +
      `Now searchable in the vault.` + anchorVerificationLine(check),
    anchorVerification: check,
  };
}
