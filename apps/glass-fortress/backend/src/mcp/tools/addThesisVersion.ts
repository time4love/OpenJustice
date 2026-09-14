import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { resolveCitations, writeThesisVersion, type VersionWritten } from '../../services/thesisVersionWrite';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// add_thesis_version({ thesisId, text, claim, expectedHeadVersionId })
// WRITE · not paid — docs/gf-thesis-flows.md T2 :398–:436, A4 :1468–:1474.
//
// "T2's transaction: parse tokens · compute each pin · carry arguments · write the version, its mentions,
// the head pointer." The transaction is `services/thesisVersionWrite`'s; this tool decides, in the order
// `test/thesis/contract.ts` TOOLS transcribes, what can be decided before it opens:
//
//   NO_RESEARCHER · NO_THESIS · NOT_AUTHOR · STALE_HEAD · NOT_A_RECORD · NOT_ACQUIRED ·
//   AWAITING_DERIVATION · UNKNOWN_TRAJECTORY_ID · EMPTY · STALE_PIN (inside the transaction, last)
//
// WHAT IT DOES NOT REFUSE (T2 :438–:441): a head that IS the published version — it is written past and
// the published pin stays; a citation of a WITHDRAWN record; an unargued citation, which is reported in
// `unargued` as T3's work-list. "The head is always a draft."
//
// NO KEY OF THE SCHEMA CAN CARRY A PIN (T2 :429; target §10.5): the pin is the write's to compute.
// ---------------------------------------------------------------------------

export const addThesisVersionSchema = {
  thesisId: z.string().describe('The thesis to write the next version of — yours'),
  text: z
    .string()
    .describe(
      'The version text EXACTLY AS THE RESEARCHER APPROVED IT, Markdown, each citation an inline token: #ev_ and a ' +
        "record's name from list_findings, or #tr_ and a trajectory id. Stored verbatim and hashed as given",
    ),
  claim: z
    .string()
    .describe("The claim the thesis argues, VERBATIM as chosen in framing — character for character, or it is not framed"),
  expectedHeadVersionId: z
    .string()
    .describe("The head this version was written against, from get_thesis_context — if another write landed first, this refuses STALE_HEAD"),
};

export interface AddThesisVersionInput {
  thesisId: string;
  text: string;
  claim: string;
  expectedHeadVersionId: string;
}

export async function addThesisVersionHandler(input: AddThesisVersionInput): Promise<string> {
  return answer(async (): Promise<VersionWritten | Refusal> => {
    const researcher = requireResearcher('Writing a thesis version');
    if ('error' in researcher) return researcher;

    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { createdById: true, headVersionId: true },
    });
    if (thesis === null) {
      return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names your theses.`);
    }
    if (thesis.createdById !== researcher.researcherId) {
      return refusal(
        'NOT_AUTHOR',
        `Thesis ${input.thesisId} is not yours to write. A thesis has one author and every write on it is ` +
          "theirs; any researcher may READ its working state with get_thesis_context.",
      );
    }
    if (thesis.headVersionId !== input.expectedHeadVersionId) {
      return refusal(
        'STALE_HEAD',
        `Thesis ${input.thesisId}'s head is ${thesis.headVersionId ?? 'none'}, not ${input.expectedHeadVersionId}: ` +
          'the version you wrote against is no longer the head. Read it with get_thesis_context and write again.',
      );
    }

    const citations = await resolveCitations(input.text);
    if ('error' in citations) return citations;

    if (input.text.trim() === '' || input.claim.trim() === '') {
      return refusal(
        'EMPTY',
        input.text.trim() === ''
          ? 'A version needs its text — the passage the researcher approved, with its citations.'
          : 'A version needs its claim — the sentence the thesis argues, verbatim as chosen in framing.',
      );
    }

    return writeThesisVersion({
      researcherId: researcher.researcherId,
      text: input.text,
      claim: input.claim,
      citations,
      target: { kind: 'EXISTING', thesisId: input.thesisId, expectedHeadVersionId: input.expectedHeadVersionId },
    });
  });
}
