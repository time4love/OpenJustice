import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { WRITE_TRANSACTION } from '../../walk/pageLog';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// unpublish_thesis({ thesisId, reason })
// WRITE · not paid — docs/gf-thesis-flows.md T6 :903–:927, A4 :1516–:1518, §12 :1135; thesis step 23.
//
// "The pin to null · a Withdrawal." The refusal order is `test/thesis/contract.ts` TOOLS':
//
//   NO_RESEARCHER · NO_THESIS · NOT_AUTHOR · NOT_PUBLISHED · REASON_REQUIRED
//
// THE ONE NULLING ARM THE DESIGN ALLOWS (T6 :909, A4 :1517, §12 :1135) — declared by name: `publishedVersionId`,
// `publishedAt` and `publishedById` to null, together (the researcher's ruling 2026-09-14, Q8). Nothing else is nulled and
// nothing is deleted: every version, mention, argument, decision and attempt stays (T6 :911).
//
// ONE TRANSACTION: the compare-and-set on the pin as this call read it, then ONE Withdrawal naming that version. A
// compare-and-set that matches nothing means another withdrawal won — NOT_PUBLISHED, and it is THROWN inside the
// callback so the transaction writes nothing (unlike `publish_thesis`'s lost race, which records its attempt).
// ---------------------------------------------------------------------------

export const unpublishThesisSchema = {
  thesisId: z.string().describe('The published thesis to withdraw — yours'),
  reason: z.string().describe('Why it is withdrawn — kept on the record, never shown on the public notice'),
};

export interface UnpublishThesisInput {
  thesisId: string;
  reason: string;
}

interface Withdrawn {
  thesisId: string;
  withdrawnVersionId: string;
  withdrawnAt: Date;
}

/** The withdrawal another call won — thrown so the transaction rolls back, and caught at its one call site. */
class Lost extends Error {}

const notPublished = (thesisId: string): Refusal<'NOT_PUBLISHED'> =>
  refusal('NOT_PUBLISHED', `Thesis ${thesisId} has no published version, so there is nothing to withdraw. Nothing was written.`);

export async function unpublishThesisHandler(input: UnpublishThesisInput): Promise<string> {
  return answer(async (): Promise<Withdrawn | Refusal> => {
    const researcher = requireResearcher('Withdrawing a thesis');
    if ('error' in researcher) return researcher;

    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { id: true, createdById: true, publishedVersionId: true },
    });
    if (thesis === null) {
      return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names your theses.`);
    }
    if (thesis.createdById !== researcher.researcherId) {
      return refusal('NOT_AUTHOR', `Thesis ${thesis.id} is not yours. Withdrawing a thesis is its author's act.`);
    }
    const withdrawn = thesis.publishedVersionId;
    if (withdrawn === null) return notPublished(thesis.id);
    if (input.reason.trim() === '') {
      return refusal('REASON_REQUIRED', 'A withdrawal carries its reason — why, in your words. Nothing was written.');
    }

    // ONE INSTANT: the Withdrawal's `createdAt` and the answer's `withdrawnAt` are the same value by construction.
    const withdrawnAt = new Date();
    try {
      await prisma.$transaction(async (tx) => {
        const { count } = await tx.thesis.updateMany({
          where: { id: thesis.id, publishedVersionId: withdrawn },
          data: { publishedVersionId: null, publishedAt: null, publishedById: null },
        });
        if (count === 0) throw new Lost();
        await tx.withdrawal.create({
          data: {
            thesisId: thesis.id,
            versionId: withdrawn,
            reason: input.reason,
            researcherId: researcher.researcherId,
            createdAt: withdrawnAt,
          },
          select: { id: true },
        });
      }, WRITE_TRANSACTION);
    } catch (err) {
      if (!(err instanceof Lost)) throw err;
      return notPublished(thesis.id);
    }

    return { thesisId: thesis.id, withdrawnVersionId: withdrawn, withdrawnAt };
  });
}
