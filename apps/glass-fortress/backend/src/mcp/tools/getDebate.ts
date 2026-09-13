import { z } from 'zod';
import { getResearcherId } from '../../context/researcherContext';
import { answer, refusal, type EvidenceWriteCode, type Refusal } from './evidenceRefusals';
import { loadDebate, type DebateState } from '../../services/debateState';
import { state } from './openDebate';

// ---------------------------------------------------------------------------
// get_debate({ sessionId }) — GATED read — evidence A4.
//
// GATED, AND NOT BY AUTHORSHIP. Thesis §9: "Any researcher READS any thesis's
// working state — the head, the arguments, the analyses, the gaps — because
// working state is gated from the public, not from colleagues." What keeps it
// off a public page is that it holds a model's opinions, which T5 lists among
// what a published page never shows: the assessment, the objection, the verdict.
//
// It writes nothing and calls no model: the assessment it returns is the one
// already recorded, verbatim.
// ---------------------------------------------------------------------------

export const getDebateSchema = {
  sessionId: z.string().describe('The debate to read'),
};

export async function getDebateHandler(input: { sessionId: string }): Promise<string> {
  return answer(async (): Promise<DebateState | Refusal<EvidenceWriteCode>> => {
    if (getResearcherId() === null) {
      return refusal('NO_RESEARCHER', "A debate is a researcher's working state. No researcher in context.");
    }
    const debate = await loadDebate(input.sessionId);
    if (debate === null) {
      return refusal('SESSION_NOT_FOUND', `No debate ${input.sessionId}.`);
    }
    return state(input.sessionId);
  });
}
