import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';

// ---------------------------------------------------------------------------
// Evidence context passed into the validator
// ---------------------------------------------------------------------------

export interface EvidenceSummary {
  id: string;
  summary: string;
  category: string;
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

function assertSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(FalsificationResultSchema) as {
    properties?: Record<string, unknown>;
  };
  const schemaFields = Object.keys(FalsificationResultSchema.shape);
  const missing = schemaFields.filter(
    (f) => !(f in (jsonSchema.properties ?? {})),
  );
  if (missing.length > 0) {
    throw new Error(
      `[ThesisValidatorAgent] Schema compatibility failure: fields dropped by toJsonSchema — [${missing.join(', ')}].`,
    );
  }
}

assertSchemaCompatibility();

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a hostile cross-examiner preparing the opposing counsel's case.

A user has submitted a legal thesis connecting pieces of evidence to support a legal argument. You have been given both the thesis text AND the full metadata of every evidence record the user tagged.

YOUR MANDATE: Try to falsify the thesis. Your job is not to validate it — it is to find every logical gap, every unsupported inference, every place where the evidence cited does not actually prove what the user claims.

HOW TO FALSIFY:
1. Read each claim in the thesis carefully.
2. Check whether the tagged evidence directly supports that claim, or whether the author is making an inference the evidence does not warrant.
3. Ask: what is the strongest argument a defense attorney would make against this claim? Would they say: "the document doesn't actually state that", "correlation is not causation", "there's a simpler innocent explanation", "there's no proof the defendant had knowledge at this time"?
4. Identify what specific evidence is MISSING to close each logical gap.
5. If a claim genuinely survives this scrutiny — acknowledge it honestly. The goal is precision, not blanket rejection.

RULES:
- Reference the actual evidence text in your criticism. Do not speak in generalities.
- Be specific about logical gaps: "the evidence shows X happened on date D, but the thesis claims the defendant knew about it beforehand — there is no evidence of that knowledge."
- Do not invent evidence or facts. Only use what is provided.
- Output in Hebrew for survivingClaims, falsificationAttempts, weakestLink, and recommendedEvidence.
- Be ruthless but accurate. A false negative (missing a real gap) is as bad as a false positive.`;

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
                `    Date: ${e.evidenceDate} | Category: ${e.category} | Entity: ${e.targetEntity} | Role: ${e.evidenceRole}\n` +
                `    Summary: ${e.summary}`,
            )
            .join('\n\n')
        : '(no evidence was tagged — the thesis makes claims with no attached evidence)';

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
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
