import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { THESIS_SYNTHESIS_PROMPT } from '../prompts/thesisSynthesis';
import type { EvidenceContext } from '../lib/evidenceContext';

// Evidence record passed in from Prisma, plus fields derived from relations
// (keyFigures) that aren't columns on Evidence itself.
export type EvidenceCorpusRecord = EvidenceContext & {
  keyFigures: string[];
  evidenceType?: string; // 'DOCUMENT' | 'FORENSIC_DIFF' — FORENSIC_DIFF = auto-detected page retraction
};

export const ThesisSynthesisOutputSchema = z.object({
  proposedTitle: z
    .string()
    .describe('A concise, declarative title for the proposed legal thesis (Hebrew or English).'),

  thesisStatement: z
    .string()
    .describe(
      '2-3 sentences stating the core legal claim: what happened, who is responsible, ' +
        'and what legal duty was breached. Written in Hebrew.',
    ),

  narrativeBody: z
    .string()
    .describe(
      'Full thesis narrative in Markdown, written in Hebrew. ' +
        'Use ## headings, bullet points, and bold for key terms. ' +
        'Weave the evidence naturally into the argument — do NOT use citation placeholders like [1] or (hash). ' +
        'The caller will append evidence mention chips automatically.',
    ),

  supportingHashes: z
    .array(z.string())
    .describe(
      'fileHash values (exactly as provided in the corpus) of the evidence records ' +
        'that directly support the proposed thesis. Ordered by relevance — strongest first.',
    ),

  keyFigures: z
    .array(z.string())
    .describe(
      'Names of public figures implicated across multiple evidence records. ' +
        'Use exact names as they appear in the corpus.',
    ),

  confidenceLevel: z
    .enum(['WEAK', 'MODERATE', 'STRONG'])
    .describe(
      'How defensible is this thesis given the current evidence corpus? ' +
        'WEAK = interesting pattern but thin proof, STRONG = tight causal chain with strong evidence.',
    ),

  missingEvidence: z
    .array(z.string())
    .describe(
      'Each string describes a specific type of evidence that would materially strengthen ' +
        'the thesis but is absent from the current corpus. Written in Hebrew.',
    ),

  summaryHe: z
    .string()
    .describe(
      'A 1-2 sentence executive summary of the proposed thesis in professional Hebrew. ' +
        'What does the evidence suggest happened, and who bears legal responsibility?',
    ),
});

export type ThesisSynthesisOutput = z.infer<typeof ThesisSynthesisOutputSchema>;

assertSchemaCompatibility(ThesisSynthesisOutputSchema, 'ThesisSynthesisAgent');

export class ThesisSynthesisAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('THESIS_SYNTHESIS', { temperature: 0.1 });
    this.chain = model.withStructuredOutput(ThesisSynthesisOutputSchema, {
      name: 'thesis_synthesis',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async synthesize(
    topic: string,
    corpus: EvidenceCorpusRecord[],
  ): Promise<ThesisSynthesisOutput> {
    const corpusBlock = corpus
      .map(
        (e, i) =>
          `[${i + 1}] Hash: ${e.fileHash}\n` +
          `    Type: ${e.evidenceType === 'FORENSIC_DIFF' ? 'FORENSIC_DIFF (silent page edit detected)' : 'DOCUMENT'}\n` +
          `    Date: ${e.evidenceDate} | Tier: ${e.evidenceTier} | Role: ${e.evidenceRole}\n` +
          `    Entity: ${e.targetEntity} | Concerns: ${e.investigativeCategories.join(", ") || "none"}\n` +
          `    Key Figures: ${e.keyFigures.length > 0 ? e.keyFigures.join(', ') : 'none identified'}\n` +
          `    Summary: ${e.summary.slice(0, 500)}`,
      )
      .join('\n\n');

    const messages = [
      { role: 'system' as const, content: THESIS_SYNTHESIS_PROMPT },
      {
        role: 'human' as const,
        content:
          `RESEARCH TOPIC: ${topic}\n\n` +
          `EVIDENCE CORPUS (${corpus.length} record${corpus.length !== 1 ? 's' : ''}):\n\n` +
          `${corpusBlock}\n\n` +
          `Based on this evidence corpus, propose the strongest defensible legal thesis. ` +
          `Identify the key figures implicated, the causal chain of misconduct, and what additional evidence would strengthen the case.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    return ThesisSynthesisOutputSchema.parse(result);
  }
}
