import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { VectorStoreService } from '../../services/VectorStoreService';
import { DevilsAdvocateOutputSchema } from '../../services/DevilsAdvocateAgent';
import { GapRevisionAgent } from '../../services/GapRevisionAgent';
import { extractText } from '../../services/thesisAnalysis';

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
  includeSuggestions: z
    .boolean()
    .optional()
    .describe(
      'When true, generate a suggestedVersionBody for each open gap that has new vault hits. ' +
        'The suggested body is a revised Markdown thesis incorporating the top vault hit — ' +
        'pass it directly as body to add_thesis_version. Adds one LLM call per open gap with hits. ' +
        'Default false.',
    ),
};

export async function getResearchAgendaHandler(input: {
  thesisId: string;
  maxHitsPerGap?: number;
  includeSuggestions?: boolean;
}): Promise<string> {
  const limit = input.maxHitsPerGap ?? 3;
  const includeSuggestions = input.includeSuggestions ?? false;

  // -------------------------------------------------------------------------
  // 1. Fetch thesis head version with mentions
  // -------------------------------------------------------------------------

  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    include: {
      headVersion: {
        include: {
          mentions: true,
          gapResolutions: {
            include: { evidence: { select: { summary: true } } },
            orderBy: { gapIndex: 'asc' },
          },
        },
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

  // Extract plain text from TipTap JSON once — used by GapRevisionAgent if requested
  const currentBodyText = extractText(head.userContent);

  // -------------------------------------------------------------------------
  // 3. Build set of already-cited evidence hashes + gap resolution map
  // -------------------------------------------------------------------------

  const alreadyCitedHashes = new Set(
    head.mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId),
  );

  // Map gapIndex → resolution metadata for O(1) lookup per gap
  const resolutionMap = new Map(
    head.gapResolutions.map((r) => [
      r.gapIndex,
      {
        resolvedAt: r.createdAt.toISOString(),
        resolvedBy: r.evidenceId,
        evidenceSummary: r.evidence.summary.slice(0, 200),
      },
    ]),
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
              investigativeCategories: e.investigativeCategories,
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

      const resolution = resolutionMap.get(index);
      const isResolved = resolution !== undefined;

      // Generate a ready-to-apply body revision for this gap when requested.
      // Only for open gaps with at least one new (uncited) vault hit.
      let suggestedVersionBody: string | null = null;
      if (includeSuggestions && !isResolved) {
        const topNewHit = (vaultHits as Array<{
          fileHash: string; summary: string; evidenceTier: string; evidenceRole: string;
          evidenceDate: string; investigativeCategories: string[]; targetEntity: string; alreadyCited: boolean;
        }>).find((h) => !h.alreadyCited);

        if (topNewHit) {
          try {
            const agent = new GapRevisionAgent();
            const revision = await agent.suggest(currentBodyText, gap.description, topNewHit);
            suggestedVersionBody = revision.suggestedBody;
          } catch {
            // Non-fatal — gap returned without suggestion
          }
        }
      }

      return {
        index,
        description: gap.description,
        suggestedSearch: gap.suggestedSearch,
        resolved: isResolved,
        resolvedAt: resolution?.resolvedAt ?? null,
        resolvedBy: resolution?.resolvedBy ?? null,
        resolutionSummary: resolution?.evidenceSummary ?? null,
        newHits: vaultHits.filter((h) => !(h as { alreadyCited: boolean }).alreadyCited).length,
        vaultHits,
        suggestedVersionBody,
      };
    }),
  );

  // -------------------------------------------------------------------------
  // 5. Return structured agenda
  // -------------------------------------------------------------------------

  return JSON.stringify({
    thesisId: thesis.id,
    title: thesis.title ?? null,
    headVersionId: head.id,
    overallStrength: analysis.overallStrengthAssessment,
    summaryHe: analysis.summaryHe,
    alreadyCitedCount: alreadyCitedHashes.size,
    alreadyCitedHashes: Array.from(alreadyCitedHashes),
    counterArguments: analysis.counterArguments,
    alternativeInterpretations: analysis.alternativeInterpretations,
    gaps,
    instructions:
      'Focus on gaps where resolved=false. For each open gap, review vaultHits where ' +
      'alreadyCited=false — these are evidence records already in the vault that may address the gap. ' +
      'To cite one, call add_thesis_version with the existing body plus an evidenceMention for that ' +
      'fileHash. If vaultHits is empty or insufficient, use create_evidence_from_url / ' +
      'create_evidence_from_text to submit new evidence, then call get_research_agenda again. ' +
      'Gaps where resolved=true have already been addressed — skip them unless resolutionSummary ' +
      'suggests the resolution was partial.',
  });
}
