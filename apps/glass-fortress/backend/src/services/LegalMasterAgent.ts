import { z } from 'zod';
import { VectorStoreService } from './VectorStoreService';
import { LLMFactory } from '../factories/LLMFactory';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Zod output schema
// ---------------------------------------------------------------------------

export const ArgumentOutputSchema = z.object({
  title: z
    .string()
    .describe('A formal legal title for this argument section (e.g. "Argument I: ...").'),

  legalTheory: z
    .string()
    .describe('A 1-2 sentence summary of the core legal theory being argued.'),

  draftedText: z
    .string()
    .describe(
      'The full formal legal argument text, written as a brief section. ' +
        'Must cite specific evidence fileHashes in square brackets within the text, e.g. [0xabc...123].',
    ),

  citedHashes: z
    .array(z.string())
    .describe(
      'Array of fileHash values that are cited or referenced in the draftedText.',
    ),
});

export type ArgumentOutput = z.infer<typeof ArgumentOutputSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Senior Class-Action Litigator preparing a formal legal brief against state authorities and pharmaceutical entities regarding Covid-19 policy failures.

You will be provided with a JSON array of evidence items. Each item has a role — either "Incriminating" or "ContextAnchor" — along with summary, tier, category, targetEntity, and fileHash.

Your task:
1. Draft a compelling, formal legal argument section against the specified target entity.
2. Base your argument EXCLUSIVELY on the evidence provided — do not invent facts, laws, or citations.
3. Cite specific evidence fileHashes in square brackets within the draftedText, e.g. [0xabc...def].
4. The draftedText should read as a formal legal brief section — structured, professional, and persuasive.
5. Use "Incriminating" evidence to prove how the target entity violated the law.
6. Use "ContextAnchor" evidence strictly to establish the factual or regulatory baseline (e.g. "As of [date], FDA had only granted EUA — not full BLA approval [hash]"), then show how the defendant's conduct violated that known baseline.
7. Prioritise Tier 1 (Smoking Gun) and Tier 2 (Material) Incriminating evidence as primary citations.
8. Populate citedHashes with every fileHash you reference in the text.
9. CRITICAL LANGUAGE REQUIREMENT: You MUST draft the entire legal argument — title, legalTheory, and draftedText — in highly professional, formal Hebrew legal terminology (עברית משפטית תקנית). The argument must read as a proper Israeli legal pleading document.`;

// Tier sort order — lower number = higher priority
const TIER_PRIORITY: Record<string, number> = {
  'Tier 1: Smoking Gun': 1,
  'Tier 2: Material': 2,
  'Tier 3: Supporting': 3,
  'Tier 4: Anecdotal': 4,
};

// ---------------------------------------------------------------------------
// LegalMasterAgent
// ---------------------------------------------------------------------------

export class LegalMasterAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor(private readonly vectorStore: VectorStoreService) {
    const model = LLMFactory.getChatModel('LEGAL', { temperature: 0 });
    this.chain = model.withStructuredOutput(ArgumentOutputSchema, {
      name: 'legal_argument',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  /**
   * Retrieve evidence from the vector store and draft a formal legal argument.
   *
   * Strategy:
   *   1. Query with a category+targetEntity metadata filter to get the most relevant evidence.
   *   2. If the strict filter returns nothing, fall back to a category-only filter.
   *   3. Sort results to surface Tier 1 & 2 evidence first.
   *   4. Pass the evidence corpus to the LLM and return a validated ArgumentOutput.
   *
   * @param category     The legal category (e.g. "Side Effect Withholding").
   * @param targetEntity The named entity being argued against (e.g. "FDA").
   */
  async generateArgument(category: string, targetEntity: string): Promise<ArgumentOutput> {
    const query = `${targetEntity} ${category} evidence`;

    // 1. Semantic search — retrieve candidate fileHashes from Pinecone
    const vectorResults = await this.vectorStore.searchSimilarEvidence(query, 20);
    const candidateHashes = vectorResults.map((r) => r.fileHash);

    // 2. Enrich from Prisma — strict filter: Incriminating only, category AND targetEntity.
    //    ContextAnchor evidence (Factual Baseline) is excluded here; it's used for timeline
    //    context, not as direct offense evidence in argument building.
    let records = await prisma.evidence.findMany({
      where: { fileHash: { in: candidateHashes }, evidenceRole: 'Incriminating', category, targetEntity },
    });

    // 3. Fallback: Incriminating + category only
    if (records.length === 0) {
      records = await prisma.evidence.findMany({
        where: { fileHash: { in: candidateHashes }, evidenceRole: 'Incriminating', category },
      });
    }

    if (records.length === 0) {
      throw new Error(
        `No evidence found for category "${category}" and target entity "${targetEntity}".`,
      );
    }

    // 4. Sort to prioritise Tier 1 & 2
    const sorted = [...records].sort(
      (a, b) => (TIER_PRIORITY[a.evidenceTier] ?? 5) - (TIER_PRIORITY[b.evidenceTier] ?? 5),
    );

    // 5. Build the prompt
    const evidenceJson = JSON.stringify(
      sorted.map((e) => ({
        fileHash: e.fileHash,
        role: e.evidenceRole,
        tier: e.evidenceTier,
        category: e.category,
        targetEntity: e.targetEntity,
        summary: e.summary,
      })),
      null,
      2,
    );

    const humanMessage =
      `Draft a legal argument against "${targetEntity}" for the "${category}" legal theory.\n\n` +
      `Evidence corpus:\n${evidenceJson}`;

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'human' as const, content: humanMessage },
    ];

    const result = await this.chain.invoke(messages);
    return ArgumentOutputSchema.parse(result);
  }
}
