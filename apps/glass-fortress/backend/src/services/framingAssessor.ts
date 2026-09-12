import { z } from 'zod';
import { LLMFactory, resolveModelId } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FRAMING_ASSESSMENT_PROMPT } from '../prompts/framingAssessment';

// ---------------------------------------------------------------------------
// THE FRAMING ASSESSOR — docs/gf-thesis-flows.md T1, A4 :1442–:1450.
//
// IT WRITES NOTHING AND IMPORTS NO DATABASE CLIENT. Thesis A7's
// `models-write-no-state` (:1639–:1642): "the model-actor modules … import no
// database client; their output reaches a row only through the tool that called
// them, AFTER THE AUDIT." `test/thesis/scans.test.ts` holds it by source scan and
// `test/thesis/invariants.test.ts` holds that it reaches no chain.
//
// WHAT IT IS HANDED IS THE COMPUTED REGISTER, AND ONLY THAT (T1 :226–:231): a
// capture's current text, or a pair's CURRENT chunks; the trajectories; the prior
// rounds. Never a classifier's summary, never a category, never a row retrieved
// by an embedding — the as-built tool did all three and T1 retires each.
//
// RECORDS ARE HANDED OVER BY LABEL, AND THE MODEL ECHOES THE LABEL. The retired
// prompt asked for a `fileHash` and a 64-hex string is what a model confabulates.
// A label outside the supplied set resolves to no record, and the audit records
// that assertion UNCHECKED rather than silently PRESENT.
// ---------------------------------------------------------------------------

/** A record as the assessor reads it: its label, what it is, and its CURRENT computed content. */
export type AssessedRecord =
  | { label: string; kind: 'CAPTURE'; url: string; capture: string; text: string }
  | {
      label: string;
      kind: 'DIFF';
      url: string;
      before: string;
      after: string;
      chunks: readonly { side: string; text: string }[];
    };

/** A trajectory as the assessor reads it — the detection pass's row, computed without a model. */
export interface AssessedTrajectory {
  id: string;
  claimText: string;
  firstSeen: string;
  lastSeen: string;
  finalState: string;
  transitions: number;
}

export interface FramingAssessmentInput {
  question: string;
  provision: string | null;
  /** The provision's required record shapes — the TEST, as structure (prosecutor plan §5). */
  elementShapes: readonly string[];
  proposedFraming: string;
  proposedElements: readonly { element: string; records: readonly string[] }[];
  records: readonly AssessedRecord[];
  trajectories: readonly AssessedTrajectory[];
  /** The framing's earlier rounds, oldest first. */
  priorTurns: readonly string[];
}

/**
 * A4 `:1446–:1449`' return, MINUS the three verdicts — `quoteVerified`,
 * `phraseVerified` and `filled` are the AUDIT's to add, mechanically and with no
 * model (T1 :253–:266). A schema that asked the model for them would let it grade
 * itself, which is the defect this whole audit exists for.
 *
 * A contradiction carries EXACTLY A4's three model-written fields. No field binds
 * it to an element: the structured bind is required of the CRITIC (T4 :592–:593)
 * and the PROSECUTOR (§10 :1069–:1070) and never of this actor, so the bind is
 * prose in `howToCheck`, and its structured form is step 22's `decide_gap` over a
 * gap that a MISSING element becomes at OPEN (T1 :279–:285, T4 :622–:623).
 */
export const FramingAssessmentSchema = z.object({
  candidateFramings: z
    .array(
      z.object({
        framing: z.string().describe('The framing, as a sentence the thesis could argue'),
        records: z.array(z.string()).describe('The LABELS of the records that anchor it, e.g. ["[1]","[3]"]'),
        scope: z.string().describe('How wide the claim is; narrow and well-anchored beats wide and thin'),
        strength: z.string().describe('What makes it strong: proximity to a documented event, independent records, a defined legal duty'),
        weakness: z.string().describe("Where the devil's advocate attacks first"),
      }),
    )
    .describe('Possible framings, each anchored in named records. Never invent a record.'),
  contradictions: z
    .array(
      z.object({
        researcherClaim: z
          .string()
          .describe(
            'A VERBATIM span of the proposed framing — copied, never paraphrased, never shortened, ' +
              'and never given a cause the researcher did not write. This is checked mechanically.',
          ),
        whatEvidenceShows: z
          .string()
          .describe(
            'A phrase that appears IN THE CONTENT of the record named below. This is checked ' +
              'mechanically against that record and labelled PRESENT, ABSENT or UNCHECKED.',
          ),
        record: z.string().describe('The LABEL of the record, e.g. "[2]"'),
      }),
    )
    .describe('Where the records do not support the proposed framing. Empty array when there are none.'),
  unverifiedAssumptions: z
    .array(
      z.object({
        assumption: z.string().describe('What the framing assumes and no record shown supports'),
        howToCheck: z
          .string()
          .describe(
            'How it could be verified. Where an element is left empty, name three things: which ' +
              'document would close the gap, who holds it, and over what date range. Do not draft ' +
              'the request itself.',
          ),
      }),
    )
    .describe('Not errors — things to check before building on them.'),
  elements: z
    .array(
      z.object({
        element: z.string().describe("The provision's element, exactly as it was given to you"),
        records: z.array(z.string()).describe('The LABELS of the records that supply it; empty when none does'),
      }),
    )
    .describe("One entry per element of the provision. An element with no record behind it keeps an EMPTY list — that is an honest output, not a failure."),
  recommendedFraming: z
    .string()
    .describe('The framing the records best support — a sentence or two, concrete, with dates and bodies. The researcher may refuse it.'),
  reasoning: z.string().describe('Professional legal Hebrew, briefly: the recommendation and the contradictions found.'),
});

export type FramingAssessment = z.infer<typeof FramingAssessmentSchema>;

assertSchemaCompatibility(FramingAssessmentSchema, 'framingAssessor');

/**
 * Which model judged it — recorded beside the round (A2 :1308).
 *
 * The PROMPT VERSION is not re-exported here. `FRAMING_ASSESSOR_PROMPT_VERSION` is imported at
 * the call site under its own name: one symbol, one name, and no alias that reads as though the
 * prompt TEXT were what the round stores.
 */
export const FRAMING_ASSESSOR_MODEL = (): string => resolveModelId('THESIS_FRAMING');

/** The record block, as the assessor reads it — Hebrew labels, the computed register, no opinion. */
function recordBlock(record: AssessedRecord): string {
  if (record.kind === 'CAPTURE') {
    return `${record.label} צילום ${record.capture} של ${record.url}\n--- הטקסט המחושב ---\n${record.text}`;
  }
  const removed = record.chunks.filter((c) => c.side === 'REMOVED').map((c) => c.text);
  const added = record.chunks.filter((c) => c.side === 'ADDED').map((c) => c.text);
  return [
    `${record.label} שינוי בין הצילומים ${record.before} ו-${record.after} של ${record.url}`,
    removed.length > 0 ? `נמחק:\n- ${removed.join('\n- ')}` : 'לא נמחק תוכן.',
    added.length > 0 ? `נוסף:\n- ${added.join('\n- ')}` : 'לא נוסף תוכן.',
  ].join('\n');
}

function trajectoryBlock(t: AssessedTrajectory): string {
  return `- "${t.claimText}" — נצפתה לראשונה ${t.firstSeen}, לאחרונה ${t.lastSeen}, מצב סופי ${t.finalState}, ${String(t.transitions)} מעברים`;
}

export class FramingAssessor {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('THESIS_FRAMING', { temperature: 0 });
    this.chain = model.withStructuredOutput(FramingAssessmentSchema, {
      name: 'framing_assessment',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  /** ONE DRAW. The caller spends it once per `assess_framing` and never inside a transaction. */
  async assess(input: FramingAssessmentInput): Promise<FramingAssessment> {
    const provision =
      input.provision === null
        ? 'לא נבחרה הוראה משפטית. אל תמציא יסודות; דווח על רשימת יסודות ריקה.'
        : `ההוראה: ${input.provision}\nהיסודות שהיא דורשת: ${input.elementShapes.join(' · ')}`;

    const proposedElements =
      input.proposedElements.length === 0
        ? 'החוקר לא מיפה יסודות.'
        : input.proposedElements
            .map((e) => `- ${e.element}: ${e.records.length === 0 ? 'חסר' : e.records.join(', ')}`)
            .join('\n');

    const trajectories =
      input.trajectories.length === 0
        ? 'לא הוצגו מסלולי טענות.'
        : `--- מסלולי טענות ---\n${input.trajectories.map(trajectoryBlock).join('\n')}`;

    const priors =
      input.priorTurns.length > 0
        ? `--- הדיון עד כה ---\n${input.priorTurns.join('\n\n')}\n--- סוף הדיון עד כה ---\n\n`
        : '';

    const raw = await this.chain.invoke([
      { role: 'system', content: FRAMING_ASSESSMENT_PROMPT },
      {
        role: 'user',
        content:
          `${priors}שאלת החוקר: ${input.question}\n\n${provision}\n\n` +
          `--- המסגור שהחוקר מציע ---\n${input.proposedFraming}\n\n` +
          `--- מיפוי היסודות של החוקר ---\n${proposedElements}\n\n` +
          `--- הרשומות ---\n${input.records.map(recordBlock).join('\n\n')}\n\n${trajectories}`,
      },
    ]);

    // PARSED, NEVER TRUSTED RAW — zod for every model output (CLAUDE.md), and the
    // audit runs on the PARSED value, never on `raw`.
    return FramingAssessmentSchema.parse(raw);
  }
}
