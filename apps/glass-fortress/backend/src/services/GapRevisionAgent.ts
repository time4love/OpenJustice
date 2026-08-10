import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';

export interface VaultHitRecord {
  fileHash: string;
  summary: string;
  evidenceTier: string;
  evidenceRole: string;
  evidenceDate: string;
  category: string;
  targetEntity: string;
}

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

function assertSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(GapRevisionOutputSchema) as {
    properties?: Record<string, unknown>;
  };
  const schemaFields = Object.keys(GapRevisionOutputSchema.shape);
  const missing = schemaFields.filter((f) => !(f in (jsonSchema.properties ?? {})));
  if (missing.length > 0) {
    throw new Error(
      `[GapRevisionAgent] Schema compatibility failure: fields dropped by zodToJsonSchema — [${missing.join(', ')}].`,
    );
  }
}

assertSchemaCompatibility();

const SYSTEM_PROMPT = `You are a legal thesis editor working on a class-action lawsuit against government health authorities for Covid-19 policy failures.

You are given:
1. The CURRENT THESIS BODY — the existing narrative in plain text
2. A GAP — a specific type of evidence that is absent but needed to prove the thesis
3. A NEW EVIDENCE RECORD — a piece of evidence from the vault that addresses the gap

Your task is to revise the thesis body to incorporate the new evidence so that it closes the identified gap.

RULES:
- Write the output in Markdown (## headings, **bold**, - bullets)
- Write in Hebrew — the thesis is in Hebrew
- Make MINIMAL changes: add a sentence or paragraph where the evidence fits; do not restructure unrelated sections
- Reference the evidence by its factual content (summary), not by its fileHash
- The evidence mention chip (the #hash citation) will be appended automatically by the caller — do not add it yourself
- Do not fabricate facts. Only use what is stated in the evidence summary
- If the current body already adequately addresses the gap (despite the gap being flagged), write the body as-is with a minimal note acknowledging the evidence`;

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
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'human' as const,
        content:
          `CURRENT THESIS BODY:\n${currentBody}\n\n` +
          `GAP TO ADDRESS:\n${gapDescription}\n\n` +
          `NEW EVIDENCE RECORD:\n` +
          `  Date: ${evidence.evidenceDate} | Tier: ${evidence.evidenceTier} | Role: ${evidence.evidenceRole}\n` +
          `  Entity: ${evidence.targetEntity} | Category: ${evidence.category}\n` +
          `  Summary: ${evidence.summary.slice(0, 600)}\n\n` +
          `Revise the thesis body to incorporate this evidence and address the gap.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return GapRevisionOutputSchema.parse(result);
  }
}
