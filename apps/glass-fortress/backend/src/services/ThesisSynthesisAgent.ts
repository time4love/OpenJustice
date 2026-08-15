import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';

// Evidence record passed in from Prisma — only the fields the agent needs
export interface EvidenceCorpusRecord {
  fileHash: string;
  summary: string;
  evidenceTier: string;
  evidenceRole: string;
  evidenceDate: string;
  investigativeCategories: string[];
  targetEntity: string;
  keyFigures: string[];
  evidenceType?: string; // 'DOCUMENT' | 'FORENSIC_DIFF' — FORENSIC_DIFF = auto-detected page retraction
}

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

function assertSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(ThesisSynthesisOutputSchema) as {
    properties?: Record<string, unknown>;
  };
  const schemaFields = Object.keys(ThesisSynthesisOutputSchema.shape);
  const missing = schemaFields.filter((f) => !(f in (jsonSchema.properties ?? {})));
  if (missing.length > 0) {
    throw new Error(
      `[ThesisSynthesisAgent] Schema compatibility failure: fields dropped by zodToJsonSchema — [${missing.join(', ')}].`,
    );
  }
}

assertSchemaCompatibility();

const SYSTEM_PROMPT = `You are a legal intelligence analyst working on a class-action lawsuit against government health authorities for Covid-19 policy failures.

You are given a corpus of evidence records from the evidence vault — documents, communications, and forensic findings that have already been classified by AI and human reviewers.

Your task is to analyse the corpus and propose the strongest defensible legal thesis that the evidence supports.

EVIDENCE TYPES:
- DOCUMENT: A submitted file or web page — official report, statement, communication, or media article.
- FORENSIC_DIFF: A forensically captured content change on a government or official website, detected by comparing Wayback Machine archive snapshots. FORENSIC_DIFF records prove that a page was silently edited — content was removed or altered after publication without public announcement. These are particularly powerful evidence of retraction, cover-up, or post-hoc narrative correction. Treat any FORENSIC_DIFF record as strong corroborating evidence of intentional concealment, especially when the deleted content involved safety data, adverse event statistics, or efficacy claims.

RULES:
- Ground every claim in the provided evidence. Do not introduce facts not present in the corpus.
- Look for patterns across multiple records: same key figures appearing repeatedly, timelines that reveal coordination, contradictions between public statements and internal documents.
- A strong thesis has a clear causal chain: (1) a legal duty existed, (2) the duty was breached, (3) the breach caused harm, (4) the evidence proves each step.
- When FORENSIC_DIFF evidence shows a retraction of safety data alongside a DOCUMENT showing public reassurances, treat this combination as especially incriminating — it establishes both knowledge and deliberate concealment.
- Be specific about who did what and when — vague accusations make weak legal arguments.
- If the corpus is thin, say so honestly in confidenceLevel and missingEvidence.
- Tier 1 evidence (official documents) is more persuasive than Tier 4. Weight your thesis accordingly.
- Evidence with role "Incriminating" is more directly useful than "ContextAnchor" or "Factual Baseline".

LANGUAGE:
- thesisStatement, narrativeBody, missingEvidence, summaryHe must be written in professional Hebrew.
- proposedTitle may be in Hebrew or English.
- keyFigures: use names exactly as they appear in the corpus.`;

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
      { role: 'system' as const, content: SYSTEM_PROMPT },
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
