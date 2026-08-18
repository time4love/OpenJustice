import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { THESIS_FALSIFICATION_PROMPT } from '../prompts/thesisFalsification';

// ---------------------------------------------------------------------------
// Evidence context passed into the validator
// ---------------------------------------------------------------------------

export interface EvidenceSummary {
  id: string;
  summary: string;
  investigativeCategories: string[];
  evidenceDate: string;
  targetEntity: string;
  evidenceRole: string;
}

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const FalsificationAttemptSchema = z.object({
  claim: z
    .string()
    .describe('The specific claim from the thesis being challenged.'),
  counterArgument: z
    .string()
    .describe(
      'The strongest opposing argument a defense attorney or opposing expert would raise against this claim.',
    ),
  evidenceGap: z
    .string()
    .describe(
      'What specific evidence would need to exist, or what the tagged evidence would need to prove, in order to defeat this counter-argument.',
    ),
});

export const FalsificationResultSchema = z.object({
  survivingClaims: z
    .array(z.string())
    .describe(
      'Claims that genuinely survive falsification — directly supported by the tagged evidence with no logical leaps. If no claims survive, return an empty array.',
    ),

  falsificationAttempts: z
    .array(FalsificationAttemptSchema)
    .describe(
      'One entry per claim that contains a logical vulnerability or an unsupported inference. ' +
        'Reference the actual evidence text when explaining why a claim fails. Be specific — name the gap, do not speak in generalities.',
    ),

  weakestLink: z
    .string()
    .describe(
      'The single inference in the thesis that carries the most argumentative weight but has the least evidentiary support. ' +
        'This is the priority gap the author must close before this thesis can withstand cross-examination.',
    ),

  recommendedEvidence: z
    .array(z.string())
    .describe(
      'Concrete types of documents, records, or testimony the author should seek to strengthen the weakest parts. ' +
        'Be actionable — e.g. "Internal ministry email chain from [date range] showing X knew about Y" rather than "more evidence".',
    ),
});

export type FalsificationResult = z.infer<typeof FalsificationResultSchema>;

// ---------------------------------------------------------------------------
// Schema integrity guard
// ---------------------------------------------------------------------------

assertSchemaCompatibility(FalsificationResultSchema, 'ThesisValidatorAgent');

// ---------------------------------------------------------------------------
// ThesisValidatorAgent
// ---------------------------------------------------------------------------

export class ThesisValidatorAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('THESIS', { temperature: 0 });
    this.chain = model.withStructuredOutput(FalsificationResultSchema, {
      name: 'thesis_falsification',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async validate(
    thesisText: string,
    taggedEvidence: EvidenceSummary[],
  ): Promise<FalsificationResult> {
    const evidenceBlock =
      taggedEvidence.length > 0
        ? taggedEvidence
            .map(
              (e, i) =>
                `[${i + 1}] ID: ${e.id}\n` +
                `    Date: ${e.evidenceDate} | Concerns: ${e.investigativeCategories.join(", ") || "none"} | Entity: ${e.targetEntity} | Role: ${e.evidenceRole}\n` +
                `    Summary: ${e.summary}`,
            )
            .join('\n\n')
        : '(no evidence was tagged — the thesis makes claims with no attached evidence)';

    const messages = [
      { role: 'system' as const, content: THESIS_FALSIFICATION_PROMPT },
      {
        role: 'human' as const,
        content:
          `THESIS FALSIFICATION REQUEST\n` +
          `============================\n\n` +
          `THESIS TEXT:\n${thesisText}\n\n` +
          `TAGGED EVIDENCE (${taggedEvidence.length} records):\n${evidenceBlock}\n\n` +
          `Apply rigorous cross-examination. Find every way this thesis can be challenged or falsified.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return FalsificationResultSchema.parse(result);
  }
}
