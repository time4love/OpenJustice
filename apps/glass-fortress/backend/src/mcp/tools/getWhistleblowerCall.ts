import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { decisionsAtPublication, gapList, theCall, theRequests } from '../../services/thesisPredicates';
import { answer } from './thesisRefusals';

// ---------------------------------------------------------------------------
// get_whistleblower_call({ thesisId })
// PUBLIC · no model · no identity · refuses nothing — docs/gf-thesis-flows.md T4 :654–:699, A3 :1404–:1406 as amended,
// A4 :1501–:1504.
//
// "THE_CALL(t) and THE_REQUESTS(t) — both appeals of the published version, with the intake instruction; { live: false }
// when nothing is published or nothing is CALLED or REQUESTED."
//
// REFUSES NOTHING (step 17's Q3b): an id naming no thesis answers `{ live: false }` exactly as a draft does, so no answer
// tells an anonymous caller which ids are drafts (evidence §5). It reads no caller: the same bytes for everyone.
//
// THE DECISIONS DECIDED AT OR BEFORE THE PUBLICATION (the researcher's ruling, 2026-09-14): `decisionsAtPublication`,
// CALLED — a gap called since the publication waits for a publication act. GAP_LIST is read with the PUBLISHED
// version's mention names (R48 §6-R29): the appeals are the published version's.
//
// No model writes the call at read time (T4 :690–:692): each item is the researcher's words, approved with its decision.
// ---------------------------------------------------------------------------

export const getWhistleblowerCallSchema = {
  thesisId: z.string().describe('A published thesis — its call to those who saw the documents, and its FOIA requests'),
};

export interface GetWhistleblowerCallInput {
  thesisId: string;
}

/**
 * The intake instruction — the researcher's ruling of 2026-09-14 (R48 §6-R21): T4 :678's instruction verbatim, and one
 * sentence that the channel for an answer opens with the document intake, naming no URL. Visible Hebrew on a PUBLIC read.
 */
const INTAKE =
  'שלחו את הבקשה בשמכם. ' +
  'ערוץ ההגשה של מסמכים ותשובות לפלטפורמה ייפתח עם קליטת המסמכים; עד אז הקריאה והבקשות פתוחות, ודרך ההגשה עדיין לא.';

type WhistleblowerCall =
  | { live: false }
  | { live: true; thesisId: string; publishedVersionId: string; call: unknown[]; requests: unknown[]; intake: string };

export async function getWhistleblowerCallHandler(input: GetWhistleblowerCallInput): Promise<string> {
  return answer(async (): Promise<WhistleblowerCall> => {
    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { id: true, publishedVersionId: true },
    });
    const publishedVersionId = thesis?.publishedVersionId ?? null;
    if (thesis === null || publishedVersionId === null) return { live: false };

    const versions = await prisma.thesisVersion.findMany({
      where: { thesisId: thesis.id },
      select: { id: true, parentVersionId: true },
    });
    const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId: thesis.id } });
    // THE PUBLISHED VERSION'S NAMES (R48 §6-R29). They can only turn a gap CITED → OPEN, which neither appeal reads — the
    // call is CALLED gaps, the requests REQUESTED ones — so this read is kept for `gapList`'s contract, not for the answer.
    const mentions = await prisma.thesisMention.findMany({ where: { versionId: publishedVersionId }, select: { name: true } });

    const list = gapList(
      decisionsAtPublication(decisions, versions, publishedVersionId),
      thesis.id,
      mentions.map((m) => m.name),
    );
    const call = theCall(true, list);
    const requests = theRequests(true, list);
    if (call.length === 0 && requests.length === 0) return { live: false };

    return { live: true, thesisId: thesis.id, publishedVersionId, call, requests, intake: INTAKE };
  });
}
