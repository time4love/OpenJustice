import type { Evidence } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Web3Service } from './Web3Service';
import { VectorStoreService } from './VectorStoreService';
import { investigativeCategoriesField } from '../lib/investigativeCategories';
import { registerEvidenceOnChain } from './evidenceOnChain';

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
    return {
      promoted: false,
      alreadyConfirmed: true,
      evidenceId: record.id,
      fileHash: record.fileHash,
      txHash: 'already-on-chain',
      message: 'Evidence is already CONFIRMED and registered on-chain.',
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
    return {
      promoted: false,
      evidenceId: record.id,
      fileHash: record.fileHash,
      txHash: '',
      message:
        'This hash is already registered on-chain, but its original transaction could not be ' +
        'located — left as PENDING_REVIEW rather than confirmed without proof. Try again shortly.',
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

  return {
    promoted: true,
    evidenceId: record.id,
    fileHash: record.fileHash,
    txHash,
    message: `Evidence promoted to CONFIRMED. Hash registered on-chain (tx: ${txHash}). Now searchable in the vault.`,
  };
}
