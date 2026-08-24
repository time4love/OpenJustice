import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { THESIS_FRAMING_ASSESSMENT_PROMPT } from '../prompts/thesisFramingAssessment';
import type { EvidenceContext } from '../lib/evidenceContext';
import {
  formatTrajectoryContext,
  emptyTrajectoryBundle,
  type TrajectoryBundle,
} from '../lib/trajectoryContext';
import { formatSummaryCaveat, type SummaryCaveat } from '../lib/summaryProvenance';

// ---------------------------------------------------------------------------
// Assesses how a thesis should be FRAMED, before one exists.
//
// The topic string decides which evidence is pulled semantically and what the
// Devil's Advocate attacks, so a wrong framing produces a well-argued thesis
// about the wrong thing that no later iteration rescues. Until 2026-08-22 that
// decision happened entirely outside the system: suggest_thesis interpolated its
// `topic` into a prompt and discarded it.
//
// The valuable output is `contradictions`, not `candidateFramings`. Generating
// options is the easy half; telling a researcher that their own evidence points
// the other way is what saves a thesis. The design is taken from a real exchange
// in which a proposed framing — "the ministry removed safety statements while
// still recommending the vaccine as safe" — was contradicted by the very edit it
// relied on, which had removed the ministry's OWN assurances and recommendation.
// ---------------------------------------------------------------------------

const CandidateFramingSchema = z.object({
  framing: z.string().describe('The thesis this framing would argue, in one or two sentences.'),
  scope: z
    .enum(['NARROW', 'MODERATE', 'BROAD'])
    .describe(
      'How much the framing claims. A narrow framing resting on strong evidence beats a broad one ' +
        'resting on little — over-reach is the first thing the Devil\'s Advocate attacks.',
    ),
  backedByFileHashes: z
    .array(z.string())
    .describe('Evidence from the supplied list that anchors this framing. A framing with no anchor is an idea, not a framing.'),
  strength: z.string().describe('What makes it strong: proximity to a dated external event, independent records, a defined legal duty.'),
  weakness: z.string().describe('Where the Devil\'s Advocate would attack first.'),
});

const ContradictionSchema = z.object({
  researcherClaim: z.string().describe('The part of the proposed framing that the evidence does not support.'),
  whatEvidenceShows: z.string().describe('What the evidence actually shows instead.'),
  fileHash: z.string().describe('The evidence record that contradicts it.'),
});

const UnverifiedAssumptionSchema = z.object({
  assumption: z.string().describe('Something the framing assumes that no supplied evidence establishes.'),
  howToVerify: z.string().describe('A concrete check that would settle it.'),
});

export const ThesisFramingAssessmentSchema = z.object({
  candidateFramings: z
    .array(CandidateFramingSchema)
    .describe('Alternative framings, each anchored in specific supplied evidence.'),
  contradictions: z
    .array(ContradictionSchema)
    .describe(
      'Where the researcher\'s proposed framing conflicts with the evidence. THE most valuable output. ' +
        'Empty array when there are none — never invent one to appear critical.',
    ),
  unverifiedAssumptions: z
    .array(UnverifiedAssumptionSchema)
    .describe('What the framing takes for granted that the evidence does not establish, with how to check it.'),
  recommendedTopicString: z
    .string()
    .describe(
      'The framing best supported by the evidence, concrete and dated. This is what gets fed to ' +
        'suggest_thesis. It need not be the researcher\'s framing.',
    ),
  assessment: z.string().describe('Professional Hebrew reasoning for the recommendation, kept on the session record.'),
});

export type ThesisFramingAssessment = z.infer<typeof ThesisFramingAssessmentSchema>;

assertSchemaCompatibility(ThesisFramingAssessmentSchema, 'ThesisFramingAssessorAgent');

export interface FramingAssessmentInput {
  /** The question the session opened on. */
  question: string;
  /** The researcher's proposed framing, verbatim. */
  proposedFraming: string;
  /** Confirmed evidence retrieved from the vault for this question. */
  evidence: EvidenceContext[];
  /** Prior turns in this framing session, oldest first. Empty on the first. */
  priorTurns?: string[];
  /**
   * Deterministic claim trajectories for the tracked pages this evidence came
   * from. Supplied because an assessor reading only model-written summaries
   * contradicted a researcher who had read the archive — and was wrong.
   */
  trajectories?: TrajectoryBundle;
  /**
   * Which supplied summaries predate the self-contained-summary rule.
   * Required, not optional: a corpus silently missing this warning is exactly how
   * a thesis gets corroborated by its own premise.
   */
  summaryCaveat: SummaryCaveat | null;
}

export class ThesisFramingAssessorAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('THESIS_FRAMING', { temperature: 0 });
    this.chain = model.withStructuredOutput(ThesisFramingAssessmentSchema, {
      name: 'thesis_framing_assessment',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async assess(input: FramingAssessmentInput): Promise<ThesisFramingAssessment> {
    const evidenceText = input.evidence
      .map(
        (e, i) =>
          `  [${i + 1}] fileHash: ${e.fileHash}\n` +
          `      Date: ${e.evidenceDate} | Tier: ${e.evidenceTier} | Entity: ${e.targetEntity} | Role: ${e.evidenceRole}\n` +
          `      Concerns: ${e.investigativeCategories.join(', ') || 'none'}\n` +
          `      Summary: ${e.summary.slice(0, 500)}`,
      )
      .join('\n\n');

    const trajectoryText = formatTrajectoryContext(input.trajectories ?? emptyTrajectoryBundle());
    const caveatText = formatSummaryCaveat(input.summaryCaveat, 'he');

    const raw = await this.chain.invoke([
      { role: 'system', content: THESIS_FRAMING_ASSESSMENT_PROMPT },
      {
        role: 'user',
        content:
          (input.priorTurns && input.priorTurns.length > 0
            ? `--- מהלך הדיון עד כה ---\n${input.priorTurns.join('\n\n')}\n\n`
            : '') +
          `שאלת החוקר: ${input.question}\n\n` +
          `--- ראיות מאומתות מן המאגר ---\n${evidenceText || '  (לא נמצאו ראיות)'}\n\n` +
          `${caveatText ? `${caveatText}\n\n` : ''}` +
          `${trajectoryText ? `${trajectoryText}\n\n` : ''}` +
          `--- המסגור שהחוקר מציע ---\n${input.proposedFraming}`,
      },
    ]);

    return ThesisFramingAssessmentSchema.parse(raw);
  }
}
