import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { appendRound, loadFraming, roundsOf } from '../../services/framingRounds';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// choose_framing({ framingId, claim, provision?, elements })
// WRITE · not paid — docs/gf-thesis-flows.md T1, A4 :1452–:1456.
//
// "Records FRAMING_CHOSEN, attributed — the researcher's words, whether their own,
// the assessor's, or a third; the provision; the element map, MISSING included."
//
// THE CLAIM IS STORED EXACTLY AS GIVEN — no trim, no whitespace collapse. T2
// :451–:453: the claim is "restated verbatim in each version's `claim` SO THAT
// CLAIM_FRAMED CAN COMPARE", and A1 :1247–:1250 lists NORMALISE's callers
// exhaustively with CLAIM_FRAMED absent. A tool that tidied the string here would
// make a faithful version's claim fail the gate's row 2.
//
// IT DOES NOT VALIDATE THE PROVISION AGAINST THE TABLE. A4 gives this tool a
// closed set with no NO_PROVISION_SHAPE, and what it does refuse is a provision
// that disagrees with the ATTACHED THESIS — "a different provision is a different
// thesis". With no thesis attached there is nothing to disagree with.
// ---------------------------------------------------------------------------

export const chooseFramingSchema = {
  framingId: z.string().describe('The framing being decided'),
  claim: z.string().describe('The sentence the thesis will argue — YOUR words, stored verbatim'),
  provision: z.string().optional().describe('The provision the thesis asserts'),
  elements: z
    .array(z.object({ element: z.string(), records: z.array(z.string()) }))
    .describe('The element map you are choosing, MISSING elements included — a missing element is an honest output'),
};

export interface ChooseFramingInput {
  framingId: string;
  claim: string;
  provision?: string;
  elements: { element: string; records: string[] }[];
}

interface ChooseFramingAnswer {
  framingId: string;
  provision: string | null;
  claim: string;
  elements: { element: string; records: string[] }[];
}

export async function chooseFramingHandler(input: ChooseFramingInput): Promise<string> {
  return answer(async (): Promise<ChooseFramingAnswer | Refusal> => {
    const researcher = requireResearcher('Choosing a framing');
    if ('error' in researcher) return researcher;

    const framing = await loadFraming(input.framingId);
    if (framing === null) {
      return refusal('NO_FRAMING', `No framing ${input.framingId}.`);
    }
    if (framing.researcherId !== researcher.researcherId) {
      return refusal(
        'NOT_YOURS',
        `Framing ${input.framingId} is not yours. The choice is the researcher's who framed it.`,
      );
    }

    // NOT_ASSESSED — "no ASSESSED round in this framing" (A4 :1454). A framing with
    // a proposal and no assessment is a discussion that has not been answered yet,
    // and A3's CLAIM_FRAMED requires an ASSESSED round preceding the CHOSEN one,
    // so a choice made here could never frame a claim.
    const rounds = await roundsOf(input.framingId);
    if (!rounds.some((r) => r.type === 'ASSESSED')) {
      return refusal(
        'NOT_ASSESSED',
        `Framing ${input.framingId} has no assessed round. Propose the framing to the assessor first ` +
          'with assess_framing — a claim chosen before anything read the corpus is not a framed claim.',
      );
    }

    const provision = input.provision ?? null;
    if (framing.thesisId !== null) {
      const thesis = await prisma.thesis.findUnique({
        where: { id: framing.thesisId },
        select: { provision: true },
      });
      if (thesis !== null && thesis.provision !== provision) {
        return refusal(
          'PROVISION_MISMATCH',
          `This framing is attached to a thesis under ${thesis.provision ?? 'no provision'}, and you ` +
            `chose ${provision ?? 'no provision'}. A different provision is a different thesis: open a ` +
            'new one rather than re-pointing this.',
        );
      }
    }

    await appendRound({
      framingId: input.framingId,
      type: 'CHOSEN',
      // The claim VERBATIM — the string as given, which is what CLAIM_FRAMED compares.
      content: { claim: input.claim, provision, elements: input.elements },
      researcherId: researcher.researcherId,
    });

    return { framingId: input.framingId, provision, claim: input.claim, elements: input.elements };
  });
}
