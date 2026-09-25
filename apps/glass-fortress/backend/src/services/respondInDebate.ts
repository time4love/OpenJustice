import { prisma } from '../lib/prisma';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { FORENSIC_PROMOTION_ASSESSMENT_PROMPT_VERSION } from '../prompts/forensicPromotionAssessment';
import { auditDebateAssertions } from './debateAudit';
import { PROMOTION_ASSESSOR_MODEL, PromotionAssessor, type AssessedContent } from './promotionAssessor';

// ---------------------------------------------------------------------------
// A TURN IN THE DEBATE — docs/gf-evidence-flows.md §4, A4.
//
// "respond_in_debate(session, response) — as many times as it takes." The
// researcher answers an objection, or supplies what the substance gaps asked
// for, and the assessor reads THE ACCUMULATED ARGUMENT rather than the last
// response alone: "a response to an objection is usually about the inference,
// and there is no reason for it to quote the content again — the researcher
// already did that in the opening argument" (the assessor's own prompt).
//
// THE PAID DRAW IS TAKEN BETWEEN TRANSACTIONS, NEVER INSIDE ONE. A model call
// inside a transaction holds a connection open for the length of a model call,
// and the staging exercise of 2026-09-06 found a seventeen-rule approval rolling
// back under Prisma's unstated five-second default. Step 7's supersession
// already takes its classifier draw before the transaction opens, for the same
// reason. What that costs is a legible half-state — a session with an argument
// and no assessment yet, `hasSubstance: false`, answered by another call — and
// never a half row.
// ---------------------------------------------------------------------------

/** The researcher's answer, recorded verbatim before any model reads it. */
export async function recordResponse(sessionId: string, response: string): Promise<void> {
  await prisma.debateEvent.create({
    data: { sessionId, type: 'RESPONSE_SUBMITTED', content: response },
  });
}

export interface AssessmentRound {
  content: AssessedContent;
  passages: string[];
  rationale: string;
  priorTurns: string[];
  /** The page — null for a document, which has none. */
  url: string | null;
}

/**
 * One assessor call, and the two facts it moves — shared by `open_debate` and
 * `respond_in_debate` so a round is the same act whichever tool asked for it.
 *
 * The assessment is stored VERBATIM as the event's content; `hasSubstance` and
 * `verdict` are the two columns the gate and the promotion read. Nothing here
 * re-words what the model said, and nothing decides on the merits: "nothing here
 * can refuse on the merits — promotedOverObjection is recorded instead".
 *
 * BESIDE IT, SINCE DOCUMENT STEP 33: the ASSERTIONS with the audit's verdicts (evidence A4 :1121, R81 QA — audited
 * HERE, mechanically, before the row is written, the framing round's order) and WHICH MODEL AND PROMPT judged it
 * (thesis A4 :1476's `M`, "an A2 :1317 debt for the writer", paid; R82 Entry 2). A row written before carries none of
 * the three, and the transcript reads their absence as null.
 */
export async function assessAndRecord(sessionId: string, round: AssessmentRound): Promise<void> {
  const assessment = await new PromotionAssessor().assess({
    url: round.url,
    content: round.content,
    passages: round.passages,
    rationale: round.rationale,
    priorTurns: round.priorTurns,
  });

  // DERIVED BEFORE THE TRANSACTION OPENS: the audit is pure, and nothing computed inside the window spends it.
  const content = JSON.stringify({
    hasSubstance: assessment.hasSubstance,
    substanceGaps: assessment.substanceGaps,
    verdict: assessment.verdict,
    objection: assessment.objection,
    assessment: assessment.assessment,
    assertions: auditDebateAssertions(assessment.assertions, round.passages, round.content),
    model: PROMOTION_ASSESSOR_MODEL(),
    promptVersion: FORENSIC_PROMOTION_ASSESSMENT_PROMPT_VERSION,
  });

  // The event and the two columns move TOGETHER: a recorded assessment whose
  // verdict never landed would be a debate that says one thing in its log and
  // another in its state. One transaction, under the shared window.
  await prisma.$transaction(async (tx) => {
    await tx.debateEvent.create({
      data: { sessionId, type: 'ASSESSMENT_RETURNED', content },
    });
    await tx.debateSession.update({
      where: { id: sessionId },
      data: {
        hasSubstance: assessment.hasSubstance,
        // MEANINGFUL ONLY WITH SUBSTANCE (the schema's own comment on the enum).
        // A verdict recorded beside `hasSubstance: false` would be an opinion on
        // the merits of an argument the assessor just said it could not check.
        verdict: assessment.hasSubstance ? assessment.verdict : null,
      },
    });
  }, WRITE_TRANSACTION);
}
