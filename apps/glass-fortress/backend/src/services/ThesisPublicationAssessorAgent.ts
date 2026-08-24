import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { THESIS_PUBLICATION_ASSESSMENT_PROMPT } from '../prompts/thesisPublicationAssessment';

// ---------------------------------------------------------------------------
// Assesses a researcher's argument for publishing a thesis — the model half of
// the publication gate (docs/gf-thesis-publication-gate-dev-plan.md §2.3,
// checks 10-12). Mirrors ForensicPromotionAssessorAgent: one judgment is a hard
// gate on the FORM of the argument, everything else is advisory and recorded.
//
//   rationaleHasSubstance — did the researcher state what the thesis claims,
//                           what the cited evidence supports, and where it
//                           stops? HARD gate. Never a judgment of correctness.
//   verdict               — is the argument persuasive? ADVISORY; dissent is
//                           recorded with the publication forever.
//   officialCapacityOk    — Rule 4: acts in office, not character. ADVISORY.
//   gapActionability      — does each gap name a document and a holder, the two
//                           things a FOIA request needs? ADVISORY.
// ---------------------------------------------------------------------------

const GapActionabilitySchema = z.object({
  gapIndex: z.number().int().describe('Index into the evidence gaps list as given.'),
  namesDocument: z
    .boolean()
    .describe('True if the gap names a specific document, dataset or record rather than "more evidence".'),
  namesHolder: z
    .boolean()
    .describe('True if the gap makes clear who holds that document — a ministry, unit, committee or office.'),
  note: z.string().describe('Briefly, what would make this gap actionable if it is not. Empty when both are true.'),
});

export const ThesisPublicationAssessmentSchema = z.object({
  rationaleHasSubstance: z
    .boolean()
    .describe(
      'True if the rationale states (1) what the thesis claims, (2) what the cited evidence supports, and ' +
        '(3) where it stops — what is alleged rather than established. Judges the FORM of the argument only, ' +
        'never whether the researcher is correct. False when no rationale was supplied.',
    ),
  substanceGaps: z
    .array(z.string())
    .describe(
      'When rationaleHasSubstance is false, exactly which of the three required statements is missing. ' +
        'Empty array when true. Phrase as what is missing, never as disagreement.',
    ),
  verdict: z
    .enum(['SUPPORTS', 'DISPUTES'])
    .describe(
      'Whether the argument, on its merits, supports publishing this thesis as written. Advisory only — ' +
        'the researcher may publish over DISPUTES. Meaningful only when rationaleHasSubstance is true.',
    ),
  objection: z
    .string()
    .describe(
      'When verdict is DISPUTES, the specific objection, recorded with the publication. Empty string when SUPPORTS.',
    ),
  officialCapacityOk: z
    .boolean()
    .describe(
      'True if every sentence naming a person concerns a specific act or omission in official capacity. ' +
        'False if any sentence asserts character, motive, honesty or intent.',
    ),
  characterClaims: z
    .array(z.string())
    .describe('The sentences, quoted, that make a character or motive claim. Empty when officialCapacityOk is true.'),
  gapActionability: z
    .array(GapActionabilitySchema)
    .describe('One entry per evidence gap given, in the same order.'),
  assessment: z
    .string()
    .describe('Professional Hebrew reasoning for all four judgments, kept on the record with the publication.'),
});

export type ThesisPublicationAssessment = z.infer<typeof ThesisPublicationAssessmentSchema>;

assertSchemaCompatibility(ThesisPublicationAssessmentSchema, 'ThesisPublicationAssessorAgent');

export interface PublicationAssessmentInput {
  thesisText: string;
  figureNames: string[];
  /** Short summaries of the cited evidence, with tier, for the merit judgment. */
  evidence: { fileHash: string; evidenceTier: string; summary: string }[];
  gaps: { gapIndex: number; description: string; suggestedSearch: string }[];
  publicInterestStatement: string | null;
  /** The researcher's argument, verbatim; null when checking readiness without one. */
  rationale: string | null;
}

export class ThesisPublicationAssessorAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('THESIS_PUBLICATION', { temperature: 0 });
    this.chain = model.withStructuredOutput(ThesisPublicationAssessmentSchema, {
      name: 'thesis_publication_assessment',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async assess(input: PublicationAssessmentInput): Promise<ThesisPublicationAssessment> {
    const evidenceText = input.evidence
      .map((e, i) => `  [${String(i + 1)}] ${e.fileHash.slice(0, 12)} | ${e.evidenceTier}\n      ${e.summary.slice(0, 400)}`)
      .join('\n');
    const gapsText = input.gaps
      .map((g) => `  [${String(g.gapIndex)}] ${g.description}\n      חיפוש מוצע: ${g.suggestedSearch}`)
      .join('\n');

    const raw = await this.chain.invoke([
      { role: 'system', content: THESIS_PUBLICATION_ASSESSMENT_PROMPT },
      {
        role: 'user',
        content:
          `--- התזה ---\n${input.thesisText}\n\n` +
          `--- אנשים הנזכרים בשם ---\n${input.figureNames.join(', ') || '(אין)'}\n\n` +
          `--- הראיות המצוטטות ---\n${evidenceText || '  (אין)'}\n\n` +
          `--- פערי הראיות שזיהה פרקליט השטן ---\n${gapsText || '  (אין)'}\n\n` +
          `--- הצהרת העניין הציבורי ---\n${input.publicInterestStatement ?? '(לא סופקה)'}\n\n` +
          `--- נימוק החוקר לפרסום ---\n${input.rationale ?? '(לא סופק נימוק)'}`,
      },
    ]);

    return ThesisPublicationAssessmentSchema.parse(raw);
  }
}
