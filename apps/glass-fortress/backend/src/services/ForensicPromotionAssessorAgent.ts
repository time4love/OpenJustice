import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FORENSIC_PROMOTION_ASSESSMENT_PROMPT } from '../prompts/forensicPromotionAssessment';

// ---------------------------------------------------------------------------
// Assesses a researcher's argument for promoting a page change the forensic
// classifier passed over.
//
// Makes two separate judgments, and the separation is the whole design:
//
//   hasSubstance — did they make a reviewable argument? A HARD gate. Judging
//   only whether someone argued, never whether they are right, keeps a fallible
//   classifier from being the final authority on significance.
//
//   verdict — is the argument persuasive? ADVISORY. The researcher may promote
//   over a DISPUTES, and that dissent is recorded on the evidence forever.
// ---------------------------------------------------------------------------

export const ForensicPromotionAssessmentSchema = z.object({
  hasSubstance: z
    .boolean()
    .describe(
      'True if the rationale makes specific, falsifiable claims about the changed content and ties them ' +
        'to an investigative concern. False for bare assertion. This judges the FORM of the argument, ' +
        'never whether the researcher is correct.',
    ),
  substanceGaps: z
    .array(z.string())
    .describe(
      'When hasSubstance is false, exactly what the rationale must add to become reviewable. ' +
        'Empty array when hasSubstance is true. Phrase as what is missing, never as disagreement.',
    ),
  verdict: z
    .enum(['SUPPORTS', 'DISPUTES'])
    .describe(
      'Whether the argument, on its merits, supports treating this change as evidence. Advisory only — ' +
        'the researcher may proceed over DISPUTES. Meaningful only when hasSubstance is true.',
    ),
  objection: z
    .string()
    .describe(
      'When verdict is DISPUTES, the specific objection the researcher must answer before confirming. ' +
        'Empty string when SUPPORTS. A counter-argument deserving a reply, not a refusal.',
    ),
  assessment: z
    .string()
    .describe('Professional Hebrew reasoning for both judgments, kept on the record alongside the evidence.'),
});

export type ForensicPromotionAssessment = z.infer<typeof ForensicPromotionAssessmentSchema>;

assertSchemaCompatibility(ForensicPromotionAssessmentSchema, 'ForensicPromotionAssessorAgent');

export interface PromotionAssessmentInput {
  /** The live page the change was detected on. */
  url: string;
  beforeDate: string;
  afterDate: string;
  /** The classifier's own reasoning for passing it over — empty if it produced none. */
  classifierReasoning: string;
  classifierCategories: string[];
  deletedItems: string[];
  addedItems: string[];
  /** The researcher's argument, verbatim. */
  rationale: string;
}

export class ForensicPromotionAssessorAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('FORENSIC_PROMOTION', { temperature: 0 });
    this.chain = model.withStructuredOutput(ForensicPromotionAssessmentSchema, {
      name: 'forensic_promotion_assessment',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async assess(input: PromotionAssessmentInput): Promise<ForensicPromotionAssessment> {
    const changed = [
      input.deletedItems.length > 0 ? `נמחק:\n- ${input.deletedItems.join('\n- ')}` : 'לא נמחק תוכן.',
      input.addedItems.length > 0 ? `נוסף:\n- ${input.addedItems.join('\n- ')}` : 'לא נוסף תוכן.',
    ].join('\n\n');

    const raw = await this.chain.invoke([
      { role: 'system', content: FORENSIC_PROMOTION_ASSESSMENT_PROMPT },
      {
        role: 'user',
        content:
          `דף: ${input.url}\n` +
          `חלון השינוי: ${input.beforeDate} → ${input.afterDate}\n\n` +
          `${changed}\n\n` +
          `נימוק המסווג האוטומטי לאי-סימון: ${input.classifierReasoning || '(לא ניתן נימוק)'}\n` +
          `עילות שזוהו על ידי המסווג: ${input.classifierCategories.join(', ') || '(אין)'}\n\n` +
          `--- טיעון החוקר ---\n${input.rationale}`,
      },
    ]);

    return ForensicPromotionAssessmentSchema.parse(raw);
  }
}
