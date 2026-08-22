import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { VectorStoreService } from '../../services/VectorStoreService';
import { ThesisSynthesisAgent, deriveSupportingHashes } from '../../services/ThesisSynthesisAgent';
import { loadTrajectoryContext } from '../../lib/trajectoryContext';

// ---------------------------------------------------------------------------
// Lazy singletons
// ---------------------------------------------------------------------------

let _vectorStore: VectorStoreService | null = null;
async function getVectorStore(): Promise<VectorStoreService> {
  if (!_vectorStore) _vectorStore = await VectorStoreService.create();
  return _vectorStore;
}

// ---------------------------------------------------------------------------
// Tool schema + handler
// ---------------------------------------------------------------------------

export const suggestThesisSchema = {
  topic: z
    .string()
    .min(1)
    .describe(
      'The legal question or subject area to investigate. ' +
        'E.g. "suppression of adverse event data during vaccine rollout" or ' +
        '"coordination between MOH and pharmaceutical companies". ' +
        'Used to search the evidence vault semantically.',
    ),
  maxEvidence: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum number of evidence records to include in the analysis corpus (default 10).'),
};

export async function suggestThesisHandler(input: {
  topic: string;
  maxEvidence?: number;
}): Promise<string> {
  const limit = input.maxEvidence ?? 10;

  // -------------------------------------------------------------------------
  // 1. Search the evidence vault semantically
  // -------------------------------------------------------------------------

  let vectorStore: VectorStoreService;
  try {
    vectorStore = await getVectorStore();
  } catch {
    return JSON.stringify({
      error: 'Vector store unavailable. Cannot search evidence vault.',
    });
  }

  let vectorResults: { fileHash: string }[];
  try {
    vectorResults = await vectorStore.searchSimilarEvidence(input.topic, limit * 2);
  } catch {
    return JSON.stringify({
      error: 'Vector store unavailable. Cannot search evidence vault.',
    });
  }

  if (vectorResults.length === 0) {
    return JSON.stringify({
      error:
        'No evidence found for this topic. Add relevant evidence to the vault first using ' +
        'create_evidence_from_url or create_evidence_from_text.',
      topic: input.topic,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Enrich with Prisma — full evidence metadata + key figures
  // -------------------------------------------------------------------------

  const hashes = vectorResults.map((r) => r.fileHash);

  const records = await prisma.evidence.findMany({
    where: { fileHash: { in: hashes }, status: 'CONFIRMED' },
    include: { figures: { select: { name: true } } },
    take: limit,
  });

  if (records.length === 0) {
    return JSON.stringify({
      error:
        'Evidence records found in vector index but none are CONFIRMED in the vault. ' +
        'Evidence must be confirmed before it can be used for thesis synthesis.',
      topic: input.topic,
    });
  }

  // Preserve semantic ranking order from vector search
  const rankMap = new Map(hashes.map((h, i) => [h, i]));
  records.sort((a, b) => (rankMap.get(a.fileHash) ?? 999) - (rankMap.get(b.fileHash) ?? 999));

  const corpus = records.map((e) => ({
    fileHash: e.fileHash,
    summary: e.summary,
    evidenceTier: e.evidenceTier,
    evidenceRole: e.evidenceRole,
    evidenceDate: e.evidenceDate,
    investigativeCategories: e.investigativeCategories,
    targetEntity: e.targetEntity,
    evidenceType: e.evidenceType,
    keyFigures: e.figures.map((f) => f.name),
  }));

  // -------------------------------------------------------------------------
  // 3. Run ThesisSynthesisAgent
  // -------------------------------------------------------------------------

  // The strongest layer in the vault, for the pages this corpus came from.
  // Synthesis without it produces a thesis that asserts what model-written
  // summaries say, on pages whose archived text can say otherwise.
  const trajectories = await loadTrajectoryContext(corpus);

  const agent = new ThesisSynthesisAgent();
  const proposal = await agent.synthesize(input.topic, corpus, trajectories);

  // supportingHashes is derived, not LLM-generated — see ThesisSynthesisAgent.ts for why
  // (a second AI-generated field here could drift from what citations/narrativeBody actually say).
  const supportingHashes = deriveSupportingHashes(proposal.narrativeBody, proposal.citations);

  // -------------------------------------------------------------------------
  // 4. Return proposal + ready-to-use create_thesis_draft arguments
  // -------------------------------------------------------------------------

  return JSON.stringify({
    topic: input.topic,
    evidenceCorpusSize: corpus.length,
    proposedTitle: proposal.proposedTitle,
    thesisStatement: proposal.thesisStatement,
    confidenceLevel: proposal.confidenceLevel,
    summaryHe: proposal.summaryHe,
    keyFigures: proposal.keyFigures,
    supportingHashes,
    citations: proposal.citations,
    missingEvidence: proposal.missingEvidence,
    narrativeBody: proposal.narrativeBody,
    readyForDraft: {
      title: proposal.proposedTitle,
      body: proposal.narrativeBody,
      evidenceHashes: supportingHashes,
      keyFigures: proposal.keyFigures,
      citations: proposal.citations,
    },
    instructions:
      'Review the proposal above. If it looks correct, call create_thesis_draft with the ' +
      'readyForDraft object to save it. Each [^n] marker in narrativeBody renders as an inline ' +
      'evidence-mention chip via citations; key figure chips are appended automatically. You can ' +
      'also edit narrativeBody before passing it to create_thesis_draft — if you add or remove a ' +
      'claim, update citations to match.',
  });
}
