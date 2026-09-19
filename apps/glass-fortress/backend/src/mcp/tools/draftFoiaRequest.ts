import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { foiaAddressesOf } from '../../lib/foiaContacts';
import { draftMaterial, headFingerprint } from '../../services/criticMaterial';
import { draftRequest } from '../../services/foiaDrafter';
import { ordinalOf } from '../../services/thesisCriticAudit';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// draft_foia_request({ thesisId, gapId })
// GATED · PAID, ONCE · WRITES NOTHING — docs/gf-thesis-flows.md T4 :654–:683, A4 :1496–:1499.
//
// "→ the drafter, with the gap, the claim and the records it rests on; writes nothing." The refusal order is
// `test/thesis/contract.ts` TOOLS':
//
//   NO_RESEARCHER · NO_THESIS · NOT_AUTHOR · NO_HEAD · NO_SUCH_GAP · AWAITING_DERIVATION
//
// NO_HEAD is the flow's (T4 :665). AWAITING_DERIVATION is the researcher's (R48 chunk 4 Q4; A4 :1499 amended): the
// drafter is never handed content that does not exist, as the critic is not — decided through the ONE loader of HEAD,
// `headFingerprint`, before anything is drafted. Any gap on the list may be drafted for, whatever it reads as (R48 D8).
//
// A REQUEST IS NOT STATE (T4 :656–:661, ruled 2026-09-03): the draft is returned and nothing is recorded — not the
// draft, not the draw. The researcher amends and approves it, and `decide_gap REQUESTED` records what they approved.
//
// THE ADDRESSES ARE THE PLATFORM'S (R48 §6-R20): filled from `lib/foiaContacts` by the authority the drafter named; an
// authority the table does not know gets none, and the answer says so. `restsOn` is the drafter's LABELS resolved to
// record names; a label the call did not hand is returned in `unresolvedLabels` beside A4's five keys — nothing the model
// asserted disappears silently (REVIEW, §6-R25; the twelfth A4 amendment owed).
// ---------------------------------------------------------------------------

export const draftFoiaRequestSchema = {
  thesisId: z.string().describe('The thesis whose gap the request would close — yours'),
  gapId: z.string().describe('The gap, by the id the gap list gives it'),
};

export interface DraftFoiaRequestInput {
  thesisId: string;
  gapId: string;
}

interface DraftFoiaRequestAnswer {
  text: string;
  authority: string;
  legalBasis: string;
  addresses: string[];
  restsOn: string[];
  unresolvedLabels: string[];
}

export async function draftFoiaRequestHandler(input: DraftFoiaRequestInput): Promise<string> {
  return answer(async (): Promise<DraftFoiaRequestAnswer | Refusal> => {
    const researcher = requireResearcher('Drafting a FOIA request');
    if ('error' in researcher) return researcher;

    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { id: true, createdById: true, headVersionId: true, provision: true },
    });
    if (thesis === null) {
      return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names your theses.`);
    }
    if (thesis.createdById !== researcher.researcherId) {
      return refusal('NOT_AUTHOR', `Thesis ${thesis.id} is not yours. A thesis's requests are drafted by its author.`);
    }
    if (thesis.headVersionId === null) {
      return refusal('NO_HEAD', `Thesis ${thesis.id} has no version yet, so no gap and no record a request could rest on.`);
    }

    const headed = await headFingerprint(thesis.id, thesis.headVersionId);
    const gap = headed.head.list.find((entry) => entry.gapId === input.gapId);
    if (gap === undefined) {
      return refusal('NO_SUCH_GAP', `No gap ${input.gapId} is on this thesis's list. get_thesis_context shows the list.`);
    }
    if (!headed.defined) {
      return refusal(
        'AWAITING_DERIVATION',
        `The head cites ${headed.named}, which has no current content version: its endpoints' text has moved and the ` +
          'walk owes a re-derivation. The drafter is never handed content that does not exist — run scan_captures on ' +
          'that page, then draft again. Nothing was spent.',
      );
    }

    const material = await draftMaterial(headed.head, thesis.provision, {
      gapId: gap.gapId,
      description: gap.inForce.description,
      readsAs: gap.readsAs,
    });

    // THE PAID DRAW — once; nothing below it writes.
    const draft = await draftRequest(material);

    const byOrdinal = new Map(material.records.map((r) => [ordinalOf(r.label), r.name]));
    const restsOn: string[] = [];
    const unresolvedLabels: string[] = [];
    for (const label of draft.restsOn) {
      const name = byOrdinal.get(ordinalOf(label));
      if (name === undefined) unresolvedLabels.push(label);
      else restsOn.push(name);
    }

    return {
      text: draft.text,
      authority: draft.authority,
      legalBasis: draft.legalBasis,
      addresses: [...foiaAddressesOf(draft.authority)],
      restsOn,
      unresolvedLabels,
    };
  });
}
