import { ethers } from 'ethers';
import type { Evidence } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { Web3Service, DuplicateEvidenceError } from './Web3Service';
import { VectorStoreService } from './VectorStoreService';
import { investigativeCategoriesField, onChainCategoryLabel } from '../lib/investigativeCategories';

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
  let txHash: string;
  try {
    txHash = await getWeb3().registerEvidenceHash(
      record.fileHash,
      ethers.ZeroAddress,
      onChainCategoryLabel(
        investigativeCategoriesField.parse(record.investigativeCategories),
        record.evidenceRole,
      ),
    );
  } catch (err) {
    if (err instanceof DuplicateEvidenceError) {
      // Already on-chain (e.g. promoted by another path) — continue to sync DB
      txHash = 'already-on-chain';
    } else {
      throw err;
    }
  }

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

  // 3. Mark CONFIRMED in Prisma
  await prisma.evidence.update({ where: { id: record.id }, data: { status: 'CONFIRMED' } });

  return {
    promoted: true,
    evidenceId: record.id,
    fileHash: record.fileHash,
    txHash,
    message: `Evidence promoted to CONFIRMED. Hash registered on-chain (tx: ${txHash}). Now searchable in the vault.`,
  };
}
