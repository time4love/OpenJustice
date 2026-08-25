import { z } from 'zod';
import {
  openThesisFraming,
  assessThesisFraming,
  getThesisFraming,
} from '../../services/thesisFraming';
import { getResearcherId } from '../../context/researcherContext';
import { sessionConsentSchema } from './createResearchSession';

// ---------------------------------------------------------------------------
// Deciding what a thesis should argue, before writing one.
//
// suggest_thesis takes a topic string, interpolates it into a prompt and discards
// it. That string is the most consequential decision in the workflow — it
// determines which evidence is pulled semantically and what the Devil's Advocate
// attacks — and until now the conversation that chose it left no trace.
//
// The point is not to generate options. It is to be told when your own evidence
// points the other way, early, rather than discovering it from the Devil's
// Advocate after a thesis is written, or from the opposing side.
// ---------------------------------------------------------------------------

export const openThesisFramingSchema = {
  question: z
    .string()
    .min(1)
    .describe('The investigative question to frame a thesis around, before deciding what it should claim.'),
  name: z.string().optional().describe('Optional session name. Defaults to the question.'),
  ...sessionConsentSchema,
};

export async function openThesisFramingHandler(input: {
  question: string;
  name?: string;
  closeActiveSession?: boolean;
}): Promise<string> {
  const state = await openThesisFraming(input.question, input.name, getResearcherId(), {
    closeActiveSession: input.closeActiveSession,
  });
  if ('error' in state) return JSON.stringify(state);
  return JSON.stringify({
    ...state,
    explanation:
      'Framing session opened with no thesis attached. Propose a framing with assess_thesis_framing — ' +
      'it will be checked against confirmed evidence and told to you where the evidence disagrees.',
  });
}

export const assessThesisFramingSchema = {
  sessionId: z.string().min(1).describe('The framing session id from open_thesis_framing'),
  proposedFraming: z
    .string()
    .min(1)
    .describe('What you think the thesis should argue, in your own words. It will be checked against the evidence.'),
};

export async function assessThesisFramingHandler(input: {
  sessionId: string;
  proposedFraming: string;
}): Promise<string> {
  const result = await assessThesisFraming(input.sessionId, input.proposedFraming);

  if ('error' in result) return JSON.stringify(result);

  const { assessment } = result;
  return JSON.stringify({
    sessionId: result.sessionId,
    question: result.question,
    rounds: result.rounds,
    evidenceConsidered: result.evidenceConsidered,
    trajectoriesConsidered: result.trajectoriesConsidered,
    // Surfaced first and counted, because it is the reason this tool exists.
    contradictionCount: assessment.contradictions.length,
    contradictions: assessment.contradictions,
    unverifiedAssumptions: assessment.unverifiedAssumptions,
    candidateFramings: assessment.candidateFramings,
    recommendedTopicString: assessment.recommendedTopicString,
    assessment: assessment.assessment,
    explanation:
      assessment.contradictions.length > 0
        ? 'The evidence contradicts part of the proposed framing — see contradictions. Revise and call ' +
          'this again, or proceed knowingly: the exchange is recorded either way and attaches to the thesis.'
        : 'No contradiction found. Verify anything under unverifiedAssumptions before building on it, then ' +
          'pass recommendedTopicString to suggest_thesis.',
  });
}

export const getThesisFramingSchema = {
  sessionId: z.string().min(1).describe('The framing session id to read'),
};

export async function getThesisFramingHandler(input: { sessionId: string }): Promise<string> {
  return JSON.stringify(await getThesisFraming(input.sessionId));
}
