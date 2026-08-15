import { ethers } from 'ethers';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { Web3Service, DuplicateEvidenceError } from '../../services/Web3Service';
import { VectorStoreService } from '../../services/VectorStoreService';
import {
  investigativeCategoriesField,
  onChainCategoryLabel,
} from '../../lib/investigativeCategories';

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

export const promoteEvidenceSchema = {
  evidenceId: z.string().uuid().describe('UUID of the PENDING_REVIEW evidence record to promote'),
};

export interface PromoteEvidenceResult {
  promoted: boolean;
  alreadyConfirmed?: boolean;
  evidenceId: string;
  fileHash: string;
  txHash: string;
  message: string;
}

export async function promoteEvidenceHandler(input: { evidenceId: string }): Promise<string> {
  const record = await prisma.evidence.findUnique({ where: { id: input.evidenceId } });

  if (!record) {
    return JSON.stringify({ error: `No evidence found with id: "${input.evidenceId}"` });
  }

  if (record.status === 'CONFIRMED') {
    const result: PromoteEvidenceResult = {
      promoted: false,
      alreadyConfirmed: true,
      evidenceId: record.id,
      fileHash: record.fileHash,
      txHash: 'already-on-chain',
      message: 'Evidence is already CONFIRMED and registered on-chain.',
    };
    return JSON.stringify(result);
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
      txHash = 'already-on-chain';
    } else {
      throw err;
    }
  }

  // 2. Upsert embedding — best-effort with 15s timeout
  try {
    await Promise.race([
      getVectorStore().then((vs) => vs.upsertEvidence(record.summary, record.fileHash)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Vector upsert timed out')), 15_000),
      ),
    ]);
  } catch (err) {
    console.warn(
      '[MCP:promoteEvidence] vector upsert failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  // 3. Mark CONFIRMED in Prisma
  await prisma.evidence.update({ where: { id: input.evidenceId }, data: { status: 'CONFIRMED' } });

  const result: PromoteEvidenceResult = {
    promoted: true,
    evidenceId: record.id,
    fileHash: record.fileHash,
    txHash,
    message: `Evidence promoted to CONFIRMED. Hash registered on-chain (tx: ${txHash}). Now searchable in the vault.`,
  };
  return JSON.stringify(result);
}
