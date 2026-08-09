import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';

// A resolved gap passed in as context — tells the agent that a gap was addressed
export interface ResolvedGapContext {
  gapIndex: number;
  description: string;
  evidenceSummary: string;
}

// Evidence record passed in from Prisma — only the fields the agent needs
export interface ReferencedEvidence {
  fileHash: string;
  category: string;
  targetEntity: string;
  evidenceTier: string;
  evidenceRole: string;
  evidenceDate: string;
  summary: string;
}

const CounterArgumentSchema = z.object({
  claim: z
    .string()
    .describe('The specific claim from the thesis being challenged, quoted or closely paraphrased.'),
  rebuttal: z
    .string()
    .describe(
      'The counter-argument. Must be grounded in the provided evidence or a known gap in it — ' +
        'do not introduce external facts not present in the referenced evidence.',
    ),
  strength: z
    .enum(['WEAK', 'MODERATE', 'STRONG'])
    .describe(
      'How strong is this counter-argument? WEAK = easy to dismiss, STRONG = seriously undermines the claim.',
    ),
});

const EvidenceGapSchema = z.object({
  description: z
    .string()
    .describe('What critical evidence is absent from this thesis that would be needed to prove it.'),
  suggestedSearch: z
    .string()
    .describe('A concrete search query or evidence request that would address this gap.'),
});

export const DevilsAdvocateOutputSchema = z.object({
  counterArguments: z
    .array(CounterArgumentSchema)
    .describe(
      'One entry per challengeable claim in the thesis. Focus on the strongest claims — ' +
        'do not manufacture trivial objections.',
    ),

  evidenceGaps: z
    .array(EvidenceGapSchema)
    .describe(
      'Evidence that is conspicuously absent from the thesis. ' +
        'If the referenced evidence is sufficient to prove the claim, return an empty array.',
    ),

  alternativeInterpretations: z
    .array(z.string())
    .describe(
      'Each string is a plausible alternative explanation for the facts presented ' +
        'that does NOT require malicious intent or coordination. ' +
        'Return an empty array if no credible alternative exists.',
    ),

  overallStrengthAssessment: z
    .enum(['WEAK', 'MODERATE', 'STRONG', 'COMPELLING'])
    .describe(
      'Your overall assessment of the thesis as a legal argument, considering the evidence cited. ' +
        'COMPELLING = strong evidence, tight reasoning, few gaps.',
    ),

  summaryHe: z
    .string()
    .describe(
      'A 2-4 sentence summary of this devil\'s advocate analysis in highly professional Hebrew. ' +
        'Be direct about the weaknesses found.',
    ),
});

export type DevilsAdvocateOutput = z.infer<typeof DevilsAdvocateOutputSchema>;

function assertSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(DevilsAdvocateOutputSchema) as {
    properties?: Record<string, unknown>;
  };
  const schemaFields = Object.keys(DevilsAdvocateOutputSchema.shape);
  const missing = schemaFields.filter((f) => !(f in (jsonSchema.properties ?? {})));
  if (missing.length > 0) {
    throw new Error(
      `[DevilsAdvocateAgent] Schema compatibility failure: fields dropped by zodToJsonSchema — [${missing.join(', ')}].`,
    );
  }
}

assertSchemaCompatibility();

const SYSTEM_PROMPT = `You are a Devil's Advocate legal analyst reviewing a crowdsourced thesis submitted to an evidence platform building a class-action lawsuit against government health authorities for Covid-19 policy failures.

Your job is NOT to agree with the thesis. Your job is to rigorously challenge it — find logical gaps, unsupported leaps, and alternative explanations — so that only the strongest arguments survive into the public record.

You are given:
1. The THESIS TEXT — the user's narrative argument
2. REFERENCED EVIDENCE — specific evidence records the user cited, with their metadata and summaries

RULES:
- Every counter-argument must be grounded in the referenced evidence or a stated absence of it. Do not invent external facts.
- Identify claims that the cited evidence does not actually support, even if the evidence is real.
- Flag logical leaps: correlation presented as causation, cherry-picked timelines, overstated conclusions.
- Alternative interpretations must be genuinely plausible — do not construct strawmen.
- If the thesis is well-supported by the evidence cited, say so. A COMPELLING rating is valid and honest.

LANGUAGE: All text fields must be written in professional Hebrew — this includes counterArguments (claim, rebuttal), evidenceGaps (description, suggestedSearch), and alternativeInterpretations. The thesis is in Hebrew; your analysis must match. summaryHe is also in Hebrew.`;

export class DevilsAdvocateAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('DEVILS_ADVOCATE', { temperature: 0 });
    this.chain = model.withStructuredOutput(DevilsAdvocateOutputSchema, {
      name: 'devils_advocate_analysis',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async analyze(
    thesisText: string,
    referencedEvidence: ReferencedEvidence[],
    resolvedGaps: ResolvedGapContext[] = [],
  ): Promise<DevilsAdvocateOutput> {
    const evidenceBlock =
      referencedEvidence.length > 0
        ? referencedEvidence
            .map(
              (e, i) =>
                `[${i + 1}] Hash: ${e.fileHash}\n` +
                `    Date: ${e.evidenceDate} | Tier: ${e.evidenceTier} | Role: ${e.evidenceRole}\n` +
                `    Entity: ${e.targetEntity} | Category: ${e.category}\n` +
                `    Summary: ${e.summary.slice(0, 400)}`,
            )
            .join('\n\n')
        : '(no evidence records were cited in this thesis)';

    const resolvedBlock = resolvedGaps.length > 0
      ? '\n\nPREVIOUSLY RESOLVED GAPS (the user marked these as addressed):\n' +
        resolvedGaps
          .map(
            (r) =>
              `Gap #${r.gapIndex + 1}: "${r.description}"\n` +
              `  → Resolved by: ${r.evidenceSummary.slice(0, 300)}`,
          )
          .join('\n\n') +
        '\n\nWhen evaluating evidenceGaps, assess whether the resolution evidence truly closes each gap or only partially addresses it. If a gap was resolved with strong evidence, you may omit it or downgrade its severity.'
      : '';

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'human' as const,
        content:
          `THESIS TEXT:\n${thesisText}\n\n` +
          `REFERENCED EVIDENCE (${referencedEvidence.length} record${referencedEvidence.length !== 1 ? 's' : ''}):\n` +
          `${evidenceBlock}` +
          `${resolvedBlock}\n\n` +
          `Provide your devil's advocate analysis of this thesis.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return DevilsAdvocateOutputSchema.parse(result);
  }
}
