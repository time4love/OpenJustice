import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import type { DevilsAdvocateOutput } from './DevilsAdvocateAgent';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { THESIS_REVISION_PROMPT } from '../prompts/thesisRevision';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UncitedEvidence {
  fileHash: string;
  summary: string;
  investigativeCategories: string[];
  evidenceTier: string;
  evidenceRole: string;
  evidenceDate: string;
  targetEntity: string;
}

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

export const RevisionOutputSchema = z.object({
  revisedBody: z
    .string()
    .describe(
      'The full revised thesis in Markdown. Use # for H1, ## for H2, ### for H3, ' +
        '**bold**, *italic*, - for bullet lists. Write in the same language as the original ' +
        '(Hebrew prose is expected). Do NOT include evidence hash syntax — hashes are appended separately.',
    ),

  evidenceHashesToInclude: z
    .array(z.string())
    .describe(
      'fileHashes of the provided uncited evidence records that you referenced or that strengthen ' +
        'specific claims in the revised thesis. Only include hashes you actually used.',
    ),

  revisionsExplained: z
    .string()
    .describe(
      'A concise English summary (2-4 sentences) of the key changes made and the reasoning behind them. ' +
        'Be specific: which claims were softened, which evidence was added, which gaps were addressed.',
    ),
});

export type RevisionOutput = z.infer<typeof RevisionOutputSchema>;

// ---------------------------------------------------------------------------
// Schema guard
// ---------------------------------------------------------------------------

assertSchemaCompatibility(RevisionOutputSchema, 'RevisionAgent');

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// RevisionAgent
// ---------------------------------------------------------------------------

export class RevisionAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('REVISION', { temperature: 0.3 });
    this.chain = model.withStructuredOutput(RevisionOutputSchema, {
      name: 'thesis_revision',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async revise(
    originalText: string,
    critique: DevilsAdvocateOutput,
    uncitedEvidence: UncitedEvidence[],
  ): Promise<RevisionOutput> {
    const critiqueBlock = [
      `Overall strength: ${critique.overallStrengthAssessment}`,
      '',
      'Counter-arguments:',
      ...critique.counterArguments.map(
        (ca, i) =>
          `[${i + 1}] Claim: ${ca.claim}\n    Rebuttal: ${ca.rebuttal} (strength: ${ca.strength})`,
      ),
      '',
      'Evidence gaps:',
      ...critique.evidenceGaps.map(
        (g, i) => `[${i + 1}] ${g.description}\n    Suggested search: ${g.suggestedSearch}`,
      ),
      '',
      'Alternative interpretations:',
      ...critique.alternativeInterpretations.map((a, i) => `[${i + 1}] ${a}`),
    ].join('\n');

    const evidenceBlock =
      uncitedEvidence.length > 0
        ? uncitedEvidence
            .map(
              (e, i) =>
                `[${i + 1}] Hash: ${e.fileHash}\n` +
                `    Date: ${e.evidenceDate} | Tier: ${e.evidenceTier} | Role: ${e.evidenceRole}\n` +
                `    Entity: ${e.targetEntity} | Category: ${e.investigativeCategories.join(", ") || "none"}\n` +
                `    Summary: ${e.summary.slice(0, 400)}`,
            )
            .join('\n\n')
        : '(no uncited evidence available — revise based on critique alone)';

    const messages = [
      { role: 'system' as const, content: THESIS_REVISION_PROMPT },
      {
        role: 'human' as const,
        content:
          `ORIGINAL THESIS:\n${originalText}\n\n` +
          `DEVIL'S ADVOCATE CRITIQUE:\n${critiqueBlock}\n\n` +
          `UNCITED EVIDENCE (${uncitedEvidence.length} record${uncitedEvidence.length !== 1 ? 's' : ''}):\n` +
          `${evidenceBlock}\n\n` +
          `Produce the revised thesis.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return RevisionOutputSchema.parse(result);
  }
}
