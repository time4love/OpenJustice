import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { VectorStoreService } from '../../services/VectorStoreService';
import { DevilsAdvocateOutputSchema } from '../../services/DevilsAdvocateAgent';

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _vectorStore: VectorStoreService | null = null;
async function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStore) _vectorStore = await VectorStoreService.create();
  return _vectorStore;
}

// ---------------------------------------------------------------------------
// Tool schema + handler
// ---------------------------------------------------------------------------

export const getResearchAgendaSchema = {
  thesisId: z
    .string()
    .describe('The Thesis cuid to build a research agenda for'),
  maxHitsPerGap: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe('Max vault hits to return per gap (default 3)'),
};

export async function getResearchAgendaHandler(input: {
  thesisId: string;
  maxHitsPerGap?: number;
}): Promise<string> {
  const limit = input.maxHitsPerGap ?? 3;

  // -------------------------------------------------------------------------
  // 1. Fetch thesis head version with mentions
  // -------------------------------------------------------------------------

  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    include: {
      headVersion: {
        include: { mentions: true },
      },
    },
  });

  if (!thesis) {
    return JSON.stringify({ error: `No thesis found with id: "${input.thesisId}"` });
  }

  const head = thesis.headVersion;
  if (!head) {
    return JSON.stringify({ error: `Thesis "${input.thesisId}" has no version yet` });
  }

  if (head.status !== 'COMPLETE' || head.aiAnalysis === null) {
    return JSON.stringify({
      error: 'Thesis has not been analysed yet. Trigger AI analysis first (POST /api/thesis/:id/analyze), then retry.',
      status: head.status,
      thesisId: thesis.id,
      headVersionId: head.id,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Parse AI analysis — validate schema defensively
  // -------------------------------------------------------------------------

  const parsed = DevilsAdvocateOutputSchema.safeParse(head.aiAnalysis);
  if (!parsed.success) {
    return JSON.stringify({
      error: 'AI analysis is present but could not be parsed — schema may be from an older version.',
      thesisId: thesis.id,
    });
  }

  const analysis = parsed.data;

  // -------------------------------------------------------------------------
  // 3. Build set of already-cited evidence hashes
  // -------------------------------------------------------------------------

  const alreadyCitedHashes = new Set(
    head.mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId),
  );

  // -------------------------------------------------------------------------
  // 4. For each gap, search the vault with the suggestedSearch query
  // -------------------------------------------------------------------------

  let vectorStore: VectorStoreService | null = null;
  try {
    vectorStore = await getVectorStore();
  } catch {
    // Pinecone unavailable — return gaps without vault hits
  }

  const gaps = await Promise.all(
    analysis.evidenceGaps.map(async (gap, index) => {
      let vaultHits: object[] = [];

      if (vectorStore) {
        try {
          const vectorResults = await vectorStore.searchSimilarEvidence(
            gap.suggestedSearch,
            limit * 2, // over-fetch to account for filter drop
          );
          const hashes = vectorResults.map((r) => r.fileHash);

          if (hashes.length > 0) {
            const records = await prisma.evidence.findMany({
              where: { fileHash: { in: hashes }, status: 'CONFIRMED' },
              include: { figures: { select: { name: true } } },
              take: limit,
            });

            // Preserve semantic ranking order
            const rankMap = new Map(hashes.map((h, i) => [h, i]));
            records.sort(
              (a, b) => (rankMap.get(a.fileHash) ?? 999) - (rankMap.get(b.fileHash) ?? 999),
            );

            vaultHits = records.map((e) => ({
              fileHash: e.fileHash,
              summary: e.summary,
              evidenceTier: e.evidenceTier,
              evidenceRole: e.evidenceRole,
              evidenceDate: e.evidenceDate,
              category: e.category,
              targetEntity: e.targetEntity,
              keyFigures: e.figures.map((f) => f.name),
              sourceUrl: e.sourceUrl ?? null,
              alreadyCited: alreadyCitedHashes.has(e.fileHash),
            }));
          }
        } catch {
          // Per-gap search failure is non-fatal
        }
      }

      return {
        index,
        description: gap.description,
        suggestedSearch: gap.suggestedSearch,
        newHits: vaultHits.filter((h) => !(h as { alreadyCited: boolean }).alreadyCited).length,
        vaultHits,
      };
    }),
  );

  // -------------------------------------------------------------------------
  // 5. Return structured agenda
  // -------------------------------------------------------------------------

  return JSON.stringify({
    thesisId: thesis.id,
    headVersionId: head.id,
    overallStrength: analysis.overallStrengthAssessment,
    summaryHe: analysis.summaryHe,
    alreadyCitedCount: alreadyCitedHashes.size,
    alreadyCitedHashes: Array.from(alreadyCitedHashes),
    counterArguments: analysis.counterArguments,
    alternativeInterpretations: analysis.alternativeInterpretations,
    gaps,
    instructions:
      'For each gap, review vaultHits where alreadyCited=false — these are new evidence records ' +
      'already in the vault that may address the gap. To add one to the thesis, call ' +
      'add_thesis_version with the existing body plus an evidenceMention for that fileHash. ' +
      'If vaultHits is empty or insufficient, use create_evidence_from_url / ' +
      'create_evidence_from_text to submit new evidence, then call get_research_agenda again.',
  });
}
