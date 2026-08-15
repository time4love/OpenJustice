import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { VectorStoreService } from '../../services/VectorStoreService';

// Lazy singleton — VectorStoreService requires async init
let _vectorStore: VectorStoreService | null = null;
async function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStore) _vectorStore = await VectorStoreService.create();
  return _vectorStore;
}

export const searchEvidenceSchema = {
  query: z.string().describe('Natural language search query'),
  targetEntity: z.string().optional().describe('Filter by entity name (e.g. "משרד הבריאות")'),
  tier: z.number().int().min(1).max(4).optional().describe('Filter by evidence tier (1=strongest)'),
  limit: z.number().int().min(1).max(20).optional().describe('Max results (default 5)'),
};

export async function searchEvidenceHandler(input: {
  query: string;
  targetEntity?: string;
  tier?: number;
  limit?: number;
}): Promise<string> {
  const limit = input.limit ?? 5;

  // Step 1: semantic search via Pinecone → ranked fileHashes
  const vectorStore = await getVectorStore();
  const vectorResults = await vectorStore.searchSimilarEvidence(input.query, limit * 2);
  const hashes = vectorResults.map((r) => r.fileHash);

  if (hashes.length === 0) {
    return JSON.stringify({ results: [], total: 0 });
  }

  // Step 2: enrich from Prisma, apply optional filters
  const records = await prisma.evidence.findMany({
    where: {
      fileHash: { in: hashes },
      ...(input.targetEntity ? { targetEntity: { contains: input.targetEntity } } : {}),
      ...(input.tier ? { evidenceTier: `Tier ${input.tier}` } : {}),
    },
    include: { figures: { select: { name: true } } },
    take: limit,
  });

  // Preserve semantic ranking order from Pinecone
  const rankMap = new Map(hashes.map((h, i) => [h, i]));
  records.sort((a, b) => (rankMap.get(a.fileHash) ?? 999) - (rankMap.get(b.fileHash) ?? 999));

  const results = records.map((e) => ({
    fileHash: e.fileHash,
    evidenceDate: e.evidenceDate,
    summary: e.summary,
    evidenceTier: e.evidenceTier,
    evidenceRole: e.evidenceRole,
    investigativeCategories: e.investigativeCategories,
    targetEntity: e.targetEntity,
    keyFigures: e.figures.map((f) => f.name),
    sourceUrl: e.sourceUrl ?? null,
  }));

  return JSON.stringify({ results, total: results.length });
}
