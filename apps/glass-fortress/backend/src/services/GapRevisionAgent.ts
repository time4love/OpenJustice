import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { GAP_REVISION_EDITING_PROMPT } from '../prompts/gapRevisionEditing';
import type { EvidenceContext } from '../lib/evidenceContext';

export type VaultHitRecord = EvidenceContext;

export const GapRevisionOutputSchema = z.object({
  suggestedBody: z
    .string()
    .describe(
      'The revised thesis body in Markdown. Must incorporate the new evidence naturally ' +
        'to address the identified gap. Make minimal structural changes — add or expand ' +
        'relevant sections rather than rewriting the whole thesis.',
    ),
});

export type GapRevisionOutput = z.infer<typeof GapRevisionOutputSchema>;

assertSchemaCompatibility(GapRevisionOutputSchema, 'GapRevisionAgent');

export class GapRevisionAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('GAP_REVISION', { temperature: 0.2 });
    this.chain = model.withStructuredOutput(GapRevisionOutputSchema, {
      name: 'gap_revision',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async suggest(
    currentBody: string,
    gapDescription: string,
    evidence: VaultHitRecord,
  ): Promise<GapRevisionOutput> {
    const messages = [
      { role: 'system' as const, content: GAP_REVISION_EDITING_PROMPT },
      {
        role: 'human' as const,
        content:
          `CURRENT THESIS BODY:\n${currentBody}\n\n` +
          `GAP TO ADDRESS:\n${gapDescription}\n\n` +
          `NEW EVIDENCE RECORD:\n` +
          `  Date: ${evidence.evidenceDate} | Tier: ${evidence.evidenceTier} | Role: ${evidence.evidenceRole}\n` +
          `  Entity: ${evidence.targetEntity} | Category: ${evidence.investigativeCategories.join(", ") || "none"}\n` +
          `  Summary: ${evidence.summary.slice(0, 600)}\n\n` +
          `Revise the thesis body to incorporate this evidence and address the gap.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return GapRevisionOutputSchema.parse(result);
  }
}
