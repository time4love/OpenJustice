import { z } from 'zod';
import {
  openDiffDebate,
  respondInDiffDebate,
  promoteFromDiffDebate,
  getDiffDebate,
} from '../../services/diffDebate';

// ---------------------------------------------------------------------------
// Debating a page change into (or out of) evidence.
//
// A forensic scan promotes nothing on its own, and promote_scan_findings only
// confirms what its classifier flagged. These four tools cover the other case:
// a change the classifier passed over that a researcher believes matters.
//
// It cannot be a one-call override. That would let anything enter the evidence
// corpus, anchored on-chain permanently, on an unexamined say-so — the mirror
// image of the auto-promotion this workflow just removed. So promotion by hand
// requires an argument, the argument is assessed, and the whole exchange is kept.
// ---------------------------------------------------------------------------

const RATIONALE_GUIDANCE =
  'Make specific, falsifiable claims: name the content that changed, and explain why it bears on an ' +
  'investigative concern. Bare assertion ("this is important") will not clear the substance gate.';

export const openDiffDebateSchema = {
  urlVersionDiffId: z
    .string()
    .min(1)
    .describe('The diff id to argue about, from the id field of get_forensic_timeline'),
  rationale: z.string().min(1).describe(`Your argument for why this change is evidence. ${RATIONALE_GUIDANCE}`),
};

export async function openDiffDebateHandler(input: {
  urlVersionDiffId: string;
  rationale: string;
}): Promise<string> {
  return JSON.stringify(await openDiffDebate(input.urlVersionDiffId, input.rationale));
}

export const respondInDiffDebateSchema = {
  sessionId: z.string().min(1).describe('The debate session id returned by open_diff_debate'),
  response: z
    .string()
    .min(1)
    .describe(
      'Your reply — either answering the assessor\'s objection, or supplying the specificity its ' +
        `substanceGaps asked for. ${RATIONALE_GUIDANCE}`,
    ),
};

export async function respondInDiffDebateHandler(input: {
  sessionId: string;
  response: string;
}): Promise<string> {
  return JSON.stringify(await respondInDiffDebate(input.sessionId, input.response));
}

export const promoteFromDiffDebateSchema = {
  sessionId: z.string().min(1).describe('The debate session id to promote from'),
};

export async function promoteFromDiffDebateHandler(input: { sessionId: string }): Promise<string> {
  return JSON.stringify(await promoteFromDiffDebate(input.sessionId));
}

export const getDiffDebateSchema = {
  sessionId: z.string().min(1).describe('The debate session id to read'),
};

export async function getDiffDebateHandler(input: { sessionId: string }): Promise<string> {
  return JSON.stringify(await getDiffDebate(input.sessionId));
}
