import { z } from 'zod';
import { auditAssessment, type AuditedAssessment } from '../../services/framingAudit';
import { FramingAssessor, FRAMING_ASSESSOR_MODEL } from '../../services/framingAssessor';
import { FRAMING_ASSESSOR_PROMPT_VERSION } from '../../prompts/framingAssessment';
import {
  appendRound,
  loadFraming,
  loadRecords,
  loadTrajectories,
  roundsOf,
  type NamedRecord,
} from '../../services/framingRounds';
import { elementShapesOf, requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// assess_framing({ framingId, proposedFraming, elements, records, trajectoryIds })
// WRITE · PAID, ONCE — docs/gf-thesis-flows.md T1, A4 :1442–:1450.
//
// "Loads CURRENT content per record and each trajectory; appends PROPOSED
// (verbatim); → the framing assessor; AUDITS every assertion (T1); appends
// ASSESSED with verdicts."
//
// TWO WRITES AROUND ONE DRAW, AND NO TRANSACTION ANYWHERE. Prisma's interactive
// transaction window is 5 s by default and the suite mocks Prisma, so no test can
// see it — the seventeen-rule approval that rolled back on staging 2026-09-06 is
// what that costs. `services/respondInDebate.ts` takes its draw between
// transactions for the same reason and says so in its own header.
//
// WHAT THE HALF-STATE IS. If the draw throws, the framing holds a PROPOSED round
// and no ASSESSED one. That is legible and it is CONTRACTED: it is exactly the
// state `choose_framing` refuses NOT_ASSESSED on. It is not a half row.
// ---------------------------------------------------------------------------

const captureRecord = z.strictObject({
  url: z.url().describe('The page — exact URL, as it was surveyed'),
  capture: z.string().describe('One capture, by its 14-digit wayback timestamp'),
});

const pairRecord = z.strictObject({
  url: z.url().describe('The page — exact URL, as it was surveyed'),
  before: z.string().describe('The EARLIER capture of the pair, 14 digits'),
  after: z.string().describe('The LATER capture of the pair, 14 digits'),
});

export const assessFramingSchema = {
  framingId: z.string().describe('The framing this round belongs to'),
  proposedFraming: z.string().describe('The sentence the thesis would argue, in your words'),
  elements: z
    .array(z.object({ element: z.string(), records: z.array(z.string()) }))
    .describe("Your element map: for each of the provision's elements, the records that supply it, or none"),
  records: z
    .array(z.union([captureRecord, pairRecord]))
    .describe('The corpus records you have been reading: { url, capture } or { url, before, after }. Never a row id'),
  trajectoryIds: z.array(z.string()).describe('Claim trajectories to hand the assessor, by the id get_claim_trajectories returned'),
};

export interface AssessFramingInput {
  framingId: string;
  proposedFraming: string;
  elements: { element: string; records: string[] }[];
  records: NamedRecord[];
  trajectoryIds: string[];
}

interface AssessFramingAnswer {
  framingId: string;
  round: number;
  assessment: AuditedAssessment;
}

export async function assessFramingHandler(input: AssessFramingInput): Promise<string> {
  return answer(async (): Promise<AssessFramingAnswer | Refusal> => {
    const researcher = requireResearcher('Assessing a framing');
    if ('error' in researcher) return researcher;

    const framing = await loadFraming(input.framingId);
    if (framing === null) {
      // NO_FRAMING, never NOT_YOURS: calling a framing that does not exist someone
      // else's is a false statement to a researcher (thesis step 17, Q2).
      return refusal('NO_FRAMING', `No framing ${input.framingId}.`);
    }
    if (framing.researcherId !== researcher.researcherId) {
      return refusal(
        'NOT_YOURS',
        `Framing ${input.framingId} is not yours. A framing belongs to the researcher who opened it; ` +
          'any researcher may READ it with get_framing.',
      );
    }

    // "A round naming no record and no trajectory" — a trajectory's history is one
    // of the corpus records the assessor is handed (T1 :226–:229), so a round that
    // names only trajectories names records.
    if (input.records.length === 0 && input.trajectoryIds.length === 0) {
      return refusal(
        'NO_RECORDS',
        'A framing round is assessed against the corpus. Name the records you have been reading — ' +
          'captures, diffs, or claim trajectories — and propose the framing again.',
      );
    }

    const records = await loadRecords(input.records);
    if ('error' in records) return records;

    const trajectories = await loadTrajectories(input.trajectoryIds);
    if ('error' in trajectories) return trajectories;

    const prior = await roundsOf(input.framingId);

    // WRITE #1 — the researcher's words and element map, VERBATIM, BEFORE any
    // model has read them (T1 :247–:248). A round that asserts a count the corpus
    // contradicts is recorded as written and the disagreement is readable from the
    // framing: "it is not refused and not corrected".
    await appendRound({
      framingId: input.framingId,
      type: 'PROPOSED',
      content: { framing: input.proposedFraming, elements: input.elements },
      researcherId: researcher.researcherId,
    });

    // THE PAID DRAW — once, outside any transaction, between the two writes.
    const assessment = await new FramingAssessor().assess({
      question: framing.question,
      provision: framing.provision,
      elementShapes: elementShapesOf(framing.provision),
      proposedFraming: input.proposedFraming,
      proposedElements: input.elements,
      records,
      trajectories,
      priorTurns: prior.map((r) => `${r.type}: ${JSON.stringify(r.content)}`),
    });

    // THE AUDIT, on the PARSED output, mechanically and with no model (T1 :253–:266).
    const audited = auditAssessment({
      proposedFraming: input.proposedFraming,
      elementShapes: elementShapesOf(framing.provision),
      records,
      assessment,
    });

    // WRITE #2 — every verdict beside its assertion, with the model and the prompt
    // version that produced it (A2 :1308).
    const round = await appendRound({
      framingId: input.framingId,
      type: 'ASSESSED',
      content: { ...audited, model: FRAMING_ASSESSOR_MODEL(), promptVersion: FRAMING_ASSESSOR_PROMPT_VERSION },
      researcherId: researcher.researcherId,
    });

    return { framingId: input.framingId, round: round.sequence, assessment: audited };
  });
}
