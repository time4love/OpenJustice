import { z } from 'zod';
import { VectorStoreService } from './VectorStoreService';
import { LLMFactory } from '../factories/LLMFactory';
import { prisma } from '../lib/prisma';
import {
  INVESTIGATIVE_CATEGORY_LABELS,
  type InvestigativeCategory,
} from '../lib/investigativeCategories';
import { EVIDENCE_TIER } from './IntakeAgent';

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

You will be provided with a JSON array of evidence items. Each item has a role — either "Incriminating" or "ContextAnchor" — along with summary, tier, investigativeCategories, targetEntity, and fileHash.

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
  [EVIDENCE_TIER.SMOKING_GUN]: 1,
  [EVIDENCE_TIER.MATERIAL]: 2,
  [EVIDENCE_TIER.SUPPORTING]: 3,
  [EVIDENCE_TIER.ANECDOTAL]: 4,
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
   *   1. Query with a concern+targetEntity metadata filter to get the most relevant evidence.
   *   2. If the strict filter returns nothing, fall back to a concern-only filter.
   *   3. Sort results to surface Tier 1 & 2 evidence first.
   *   4. Pass the evidence corpus to the LLM and return a validated ArgumentOutput.
   *
   * @param concern      The investigative concern to argue (e.g. "WITHHOLDING_INFORMATION").
   * @param targetEntity The named entity being argued against (e.g. "FDA").
   */
  async generateArgument(
    concern: InvestigativeCategory,
    targetEntity: string,
  ): Promise<ArgumentOutput> {
    const query = `${targetEntity} ${INVESTIGATIVE_CATEGORY_LABELS[concern]} evidence`;

    // 1. Semantic search — retrieve candidate fileHashes from Pinecone
    const vectorResults = await this.vectorStore.searchSimilarEvidence(query, 20);
    const candidateHashes = vectorResults.map((r) => r.fileHash);

    // 2. Enrich from Prisma — strict filter: Incriminating only, concern AND targetEntity.
    //    ContextAnchor evidence is excluded here; it establishes timeline context rather
    //    than direct offence evidence. `has` matches one element of the array column.
    let records = await prisma.evidence.findMany({
      where: {
        fileHash: { in: candidateHashes },
        evidenceRole: 'Incriminating',
        investigativeCategories: { has: concern },
        targetEntity,
      },
    });

    // 3. Fallback: Incriminating + concern only
    if (records.length === 0) {
      records = await prisma.evidence.findMany({
        where: {
          fileHash: { in: candidateHashes },
          evidenceRole: 'Incriminating',
          investigativeCategories: { has: concern },
        },
      });
    }

    if (records.length === 0) {
      throw new Error(
        `No evidence found for concern "${concern}" and target entity "${targetEntity}".`,
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
        investigativeCategories: e.investigativeCategories,
        targetEntity: e.targetEntity,
        summary: e.summary,
      })),
      null,
      2,
    );

    const humanMessage =
      `Draft a legal argument against "${targetEntity}" for the "${INVESTIGATIVE_CATEGORY_LABELS[concern]}" legal theory.\n\n` +
      `Evidence corpus:\n${evidenceJson}`;

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'human' as const, content: humanMessage },
    ];

    const result = await this.chain.invoke(messages);
    return ArgumentOutputSchema.parse(result);
  }
}
