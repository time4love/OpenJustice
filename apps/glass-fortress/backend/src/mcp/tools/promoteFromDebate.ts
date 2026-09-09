import { z } from 'zod';
import { promote, promotionBlockers, type Promoted } from '../../services/promoteFromDebate';
import { loadDebate } from '../../services/debateState';
import { answer, refusal, type EvidenceWriteCode, type Refusal } from './evidenceRefusals';
import { requireAuthor, requireResearcher } from './openDebate';

// ---------------------------------------------------------------------------
// promote_from_debate({ sessionId }) — WRITE — evidence A4, §4; thesis T3.
//
// "REFUSES unless: the session is OPEN · the latest argument cleared SUBSTANCE ·
// a DISPUTES verdict has been answered at least once … and every refusal of
// open_debate re-checked at this moment — the record may have moved since."
//
// NOTHING HERE REFUSES ON THE MERITS. A sustained objection is a blocker only
// until it is answered once; after that the researcher may promote over it and
// `promotedOverObjection` carries the assessor's dissent beside the evidence for
// as long as the row exists. §4: "nothing here can refuse on the merits —
// promotedOverObjection is recorded instead."
//
// NO CHAIN WRITE, and no confirmation act: "the record's standing is derived"
// (§5). This module imports neither `Web3Service` nor the anchoring module.
// ---------------------------------------------------------------------------

export const promoteFromDebateSchema = {
  sessionId: z.string().describe('The debate whose cleared argument promotes the record'),
};

export async function promoteFromDebateHandler(input: { sessionId: string }): Promise<string> {
  return answer(async (): Promise<Promoted | Refusal<EvidenceWriteCode>> => {
    // THE IDENTITY FIRST, BEFORE ANY QUERY: an anonymous call reads nothing, and
    // cannot learn which session ids exist from the difference between two
    // refusals.
    const researcher = requireResearcher('Promoting a record');
    if ('error' in researcher) return researcher;

    const debate = await loadDebate(input.sessionId);
    if (debate === null) {
      return refusal('SESSION_NOT_FOUND', `No debate ${input.sessionId}.`);
    }
    const author = await requireAuthor(debate.thesisId);
    if ('error' in author) return author;

    if (debate.status !== 'OPEN') {
      return refusal(
        'SESSION_CLOSED',
        debate.status === 'PROMOTED'
          ? `This debate already promoted ${debate.recordFileHash}; a record is promoted once per thesis.`
          : `This debate is ${debate.status} and cannot promote.`,
      );
    }

    const { blockedBy, checked, recordRefusal } = await promotionBlockers(debate);

    // THE RECORD'S OWN REFUSAL KEEPS ITS OWN CODE — A4 asks for "every refusal of
    // open_debate re-checked at this moment", so a diff that became CONTRADICTED
    // since the argument answers CONTRADICTED, carrying the chunks, rather than a
    // generic NOT_READY the researcher would have to interpret.
    if (recordRefusal !== null) return recordRefusal;

    if (blockedBy.includes('STALE_PIN')) {
      return refusal(
        'STALE_PIN',
        "The head version's citation pins a content version that is not the record's CURRENT: the " +
          'argument was made against content the citation no longer names. Write a new version — it ' +
          're-pins — and argue the citation again.',
      );
    }
    if (blockedBy.length > 0 || checked === null) {
      return refusal(
        'NOT_READY',
        `This argument cannot promote yet: ${blockedBy.join(', ')}. ` +
          (blockedBy.includes('NO_SUBSTANCE')
            ? "The assessor could not check the argument; its substanceGaps say what is missing. "
            : '') +
          (blockedBy.includes('OBJECTION_UNANSWERED')
            ? 'The assessor disputes it and the objection has not been answered once; respond_in_debate ' +
              'answers it, and you may then promote over the objection.'
            : ''),
      );
    }

    return promote(debate, checked, author.researcherId);
  });
}
