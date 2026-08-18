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
      '2-3 sentences stating the potential legal claim: what the evidence shows happened, who ' +
        'may bear responsibility, and what legal duty may have been breached — framed as an ' +
        'allegation under investigation and a potential cause of action, never as an adjudicated ' +
        'conclusion. Written in Hebrew.',
    ),

  narrativeBody: z
    .string()
    .describe(
      'Full thesis narrative in Markdown, written in Hebrew, following the LEGAL FRAMING and ' +
        'CAUSES OF ACTION rules above. ' +
        'Use ## headings, bullet points, and bold for key terms. ' +
        'Cite every factual claim inline, immediately after the claim, using a Markdown footnote ' +
        'marker like [^1], [^2] — every marker used here must have exactly one matching entry in ' +
        'citations. Do not make a claim you cannot cite. The caller renders each marker as an ' +
        'inline evidence-mention chip automatically — do not also write out the hash or a ' +
        'citation placeholder like (hash) yourself.',
    ),

  citations: z
    .array(
      z.object({
        id: z
          .number()
          .int()
          .positive()
          .describe('Footnote number as used inline in narrativeBody — id 1 corresponds to marker [^1].'),
        fileHashes: z
          .array(z.string())
          .min(1)
          .describe(
            'Evidence file hash(es) (0x…, exactly as provided in the corpus) supporting this ' +
              'footnote — usually one, occasionally more when a single claim draws on multiple records.',
          ),
      }),
    )
    .describe(
      'One entry per footnote marker used in narrativeBody — every [^n] in the text needs a ' +
        'matching entry here, and every entry here needs a matching [^n] in the text. The same ' +
        'fileHash may appear in more than one entry when it supports more than one claim.',
    ),

  keyFigures: z
    .array(z.string())
    .describe(
      'Names of individuals discussed with a specific, evidence-grounded role in narrativeBody ' +
        '— not everyone tagged as a keyFigure on the underlying evidence corpus. See the ' +
        'KEY FIGURES — INCLUSION BAR rule above. Use exact names as they appear in the corpus.',
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

const FOOTNOTE_MARKER_PATTERN = /\[\^(\d+)\]/g;

function extractMarkerIds(narrativeBody: string): Set<number> {
  const ids = new Set<number>();
  for (const match of narrativeBody.matchAll(FOOTNOTE_MARKER_PATTERN)) {
    ids.add(Number(match[1]));
  }
  return ids;
}

/**
 * Cross-field check that can't live in the Zod schema itself — schemas passed to
 * withStructuredOutput can't carry .refine()/.superRefine() without
 * assertSchemaCompatibility failing the build (see that module's comment).
 * Run this after ThesisSynthesisOutputSchema.parse() succeeds.
 */
export function validateCitationConsistency(output: Pick<ThesisSynthesisOutput, 'narrativeBody' | 'citations'>): void {
  const markerIds = extractMarkerIds(output.narrativeBody);
  const citationIds = new Set(output.citations.map((c) => c.id));

  const uncited = [...markerIds].filter((id) => !citationIds.has(id));
  if (uncited.length > 0) {
    throw new Error(
      `ThesisSynthesisAgent: narrativeBody cites footnote marker(s) [${uncited.join(', ')}] with no matching citations entry.`,
    );
  }

  const unused = [...citationIds].filter((id) => !markerIds.has(id));
  if (unused.length > 0) {
    throw new Error(
      `ThesisSynthesisAgent: citations entry id(s) [${unused.join(', ')}] are not referenced by any [^n] marker in narrativeBody.`,
    );
  }
}

/**
 * Flattens citations into a deduplicated evidence hash list, ordered by each
 * hash's first footnote appearance in narrativeBody (not citations array order,
 * which the model has no reason to keep in text order). First-cited reads as
 * most load-bearing in a well-argued narrative, so this preserves the
 * "strongest first" intent the old LLM-generated supportingHashes field tried
 * to capture by judgment — without a second field that could drift out of
 * sync with what the text actually cites.
 */
export function deriveSupportingHashes(
  narrativeBody: string,
  citations: Pick<ThesisSynthesisOutput['citations'][number], 'id' | 'fileHashes'>[],
): string[] {
  const hashesById = new Map(citations.map((c) => [c.id, c.fileHashes]));
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const match of narrativeBody.matchAll(FOOTNOTE_MARKER_PATTERN)) {
    const hashes = hashesById.get(Number(match[1])) ?? [];
    for (const hash of hashes) {
      if (!seen.has(hash)) {
        seen.add(hash);
        ordered.push(hash);
      }
    }
  }

  return ordered;
}

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
    const parsed = ThesisSynthesisOutputSchema.parse(result);
    validateCitationConsistency(parsed);
    return parsed;
  }
}
