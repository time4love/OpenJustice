import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getWeb3Service } from '../../lib/web3';

export const registerOnChainSchema = {
  figureId: z
    .string()
    .optional()
    .describe('Optional: only register allegations for this key figure. Omit to process all pending.'),
};

interface OnChainResult {
  allegationId: string;
  allegationHash: string;
  txHash?: string;
  error?: string;
}

export async function registerOnChainHandler(input: { figureId?: string }): Promise<string> {
  const web3 = getWeb3Service();
  if (!web3) {
    return JSON.stringify({
      error: 'On-chain registration is not configured. Set BF_RPC_URL, BF_REGISTRAR_PRIVATE_KEY, and BF_EVIDENCE_REGISTRY_ADDRESS.',
    });
  }

  const pending = await prisma.allegation.findMany({
    where: {
      onChainTxHash: null,
      ...(input.figureId ? { figureId: input.figureId } : {}),
    },
    select: { id: true, allegationHash: true },
  });

  if (pending.length === 0) {
    return JSON.stringify({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      message: 'No pending allegations found.',
    });
  }

  let succeeded = 0;
  let failed = 0;
  const results: OnChainResult[] = [];

  for (const a of pending) {
    try {
      const txHash = await web3.registerCommitmentHash(a.allegationHash);
      await prisma.allegation.update({
        where: { id: a.id },
        data: { onChainTxHash: txHash },
      });
      succeeded++;
      results.push({ allegationId: a.id, allegationHash: a.allegationHash, txHash });
    } catch (err) {
      failed++;
      results.push({
        allegationId: a.id,
        allegationHash: a.allegationHash,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return JSON.stringify({
    attempted: pending.length,
    succeeded,
    failed,
    results,
  }, null, 2);
}
