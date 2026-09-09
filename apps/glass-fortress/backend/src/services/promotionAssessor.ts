import { z } from 'zod';
import { LLMFactory, resolveModelId } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FORENSIC_PROMOTION_ASSESSMENT_PROMPT } from '../prompts/forensicPromotionAssessment';

// ---------------------------------------------------------------------------
// THE DEBATE'S ASSESSOR — docs/gf-evidence-flows.md §4 and docs/gf-thesis-flows.md T3.
//
// It answers TWO SEPARATE QUESTIONS and the separation is the whole design:
// SUBSTANCE, "did the researcher make an argument that can be checked", a HARD
// gate; and MERIT, "does the assessor agree", ADVISORY — "nothing here can
// refuse on the merits; promotedOverObjection is recorded instead" (§4).
//
// A SUCCESSOR, NOT THE RETIRED AGENT. `services/ForensicPromotionAssessorAgent`
// is a retired import path (test/walk/retiredNames.test.ts) and may not return.
// What is kept from it is its SHAPE — the output schema, one structured call,
// the version stamp — because §4 says the debate keeps the shape it was built
// with. What CHANGES is what it is handed, and every change is a design clause:
//
//   the classifier's reasoning and categories  →  NOTHING of the opinion.
//     T3: "Nothing else: no classifier reasoning, no categories, no
//     significance." The retired input handed the model the very register A7's
//     `opinions-not-facts` keeps out of a public read; handing it to the judge
//     of an argument is worse, because the judge then grades the researcher
//     against a machine's prior.
//   two date strings                           →  the record, named as A1 names
//     it: a page and one or two 14-digit timestamps. Never a date pair.
//   the classifier's items                     →  CURRENT's COMPUTED chunks, or
//     a capture's current text.
//   —                                          →  THE PASSAGE (T3), the
//     paragraph(s) of the head version that cite the record. The debate's
//     question is "does this record support what thesis T says it does", and
//     "what T says" is a sentence, not a thesis.
//
// IT WRITES NOTHING AND IMPORTS NO DATABASE CLIENT. Thesis A7's
// `models-write-no-state`: "the model-actor modules … import no database client;
// their output reaches a row only through the tool that called them." Its input
// is a value the caller built; its output is returned to the caller, which
// records it as an event verbatim.
// ---------------------------------------------------------------------------

export const PromotionAssessmentSchema = z.object({
  hasSubstance: z
    .boolean()
    .describe(
      'True if the rationale makes specific, falsifiable claims about the record\'s computed content ' +
        'and ties them to what the citing passage says. False for bare assertion. This judges the ' +
        'FORM of the argument, never whether the researcher is correct.',
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
      'Whether the argument, on its merits, supports the record carrying what the passage says. ' +
        'Advisory only — the researcher may proceed over DISPUTES. Meaningful only when hasSubstance.',
    ),
  objection: z
    .string()
    .describe(
      'When verdict is DISPUTES, the specific objection the researcher must answer before promoting. ' +
        'Empty string when SUPPORTS. A counter-argument deserving a reply, not a refusal.',
    ),
  assessment: z
    .string()
    .describe('Professional Hebrew reasoning for both judgements, kept on the record beside the evidence.'),
});

export type PromotionAssessment = z.infer<typeof PromotionAssessmentSchema>;

assertSchemaCompatibility(PromotionAssessmentSchema, 'promotionAssessor');

/** The record's CURRENT COMPUTED content — and nothing else about it (§3's two registers). */
export type AssessedContent =
  | { kind: 'CAPTURE'; capture: string; text: string }
  | { kind: 'DIFF'; before: string; after: string; chunks: { side: string; text: string }[] };

export interface PromotionAssessmentInput {
  /** The page, by the exact URL it was surveyed under (A1). */
  url: string;
  /** What the record's current version computes to — never its classification. */
  content: AssessedContent;
  /**
   * The paragraphs of the head version that carry the citation, in document
   * order. More than one is a thesis saying more than one thing with the record,
   * and all of them are its material (§6c).
   */
  passages: string[];
  /** The researcher's argument for THIS round, verbatim. */
  rationale: string;
  /**
   * The debate so far, oldest first. Without it every reply reads as a fresh
   * opening argument and a researcher defending an inference loses credit for
   * the specific claims they already made.
   */
  priorTurns: string[];
}

/** Which model judged it — recorded beside the assessment, as every model output is. */
export const PROMOTION_ASSESSOR_MODEL = (): string => resolveModelId('FORENSIC_PROMOTION');

/** The computed content, as the assessor reads it — Hebrew labels, no opinion. */
function contentBlock(content: AssessedContent): string {
  if (content.kind === 'CAPTURE') {
    return `רשומה: צילום ${content.capture}\n\n--- הטקסט המחושב של הצילום ---\n${content.text}`;
  }
  const removed = content.chunks.filter((c) => c.side === 'REMOVED').map((c) => c.text);
  const added = content.chunks.filter((c) => c.side === 'ADDED').map((c) => c.text);
  return [
    `רשומה: שינוי בין הצילומים ${content.before} ו-${content.after}`,
    '',
    removed.length > 0 ? `נמחק:\n- ${removed.join('\n- ')}` : 'לא נמחק תוכן.',
    '',
    added.length > 0 ? `נוסף:\n- ${added.join('\n- ')}` : 'לא נוסף תוכן.',
  ].join('\n');
}

export class PromotionAssessor {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('FORENSIC_PROMOTION', { temperature: 0 });
    this.chain = model.withStructuredOutput(PromotionAssessmentSchema, {
      name: 'promotion_assessment',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async assess(input: PromotionAssessmentInput): Promise<PromotionAssessment> {
    const priors =
      input.priorTurns.length > 0
        ? `--- מהלך הדיון עד כה ---\n${input.priorTurns.join('\n\n')}\n\n--- סוף הדיון עד כה ---\n\n`
        : '';
    const passages =
      input.passages.length === 1
        ? `--- הפסקה המצטטת ---\n${input.passages[0]}`
        : `--- ${String(input.passages.length)} הפסקאות המצטטות, לפי סדרן ---\n${input.passages.join('\n\n')}`;
    const argument =
      input.priorTurns.length > 0
        ? `--- תגובת החוקר הנוכחית (העריכו את הטיעון המצטבר, לא את התגובה לבדה) ---\n${input.rationale}`
        : `--- טיעון החוקר ---\n${input.rationale}`;

    const raw = await this.chain.invoke([
      { role: 'system', content: FORENSIC_PROMOTION_ASSESSMENT_PROMPT },
      {
        role: 'user',
        content: `${priors}דף: ${input.url}\n\n${contentBlock(input.content)}\n\n${passages}\n\n${argument}`,
      },
    ]);

    // PARSED, NEVER TRUSTED RAW — zod for every model output (CLAUDE.md).
    return PromotionAssessmentSchema.parse(raw);
  }
}
