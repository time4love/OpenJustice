import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { assessedContent, recordChecks } from '../../services/openDebate';
import { assessAndRecord, recordResponse } from '../../services/respondInDebate';
import { passagesCiting } from '../../services/debatePassage';
import { loadDebate, priorTurns, type DebateState } from '../../services/debateState';
import { answer, refusal, type EvidenceWriteCode, type Refusal } from './evidenceRefusals';
import { requireAuthor, requireResearcher, state } from './openDebate';

// ---------------------------------------------------------------------------
// respond_in_debate({ sessionId, response }) — WRITE · PAID — evidence A4.
//
// "The researcher answers an objection, or supplies what the gaps asked for — or
// not … as many times as it takes." A sustained objection is answered at least
// once or carried on the record forever; nothing here forces agreement, and the
// assessor may keep disputing while `promote_from_debate` still allows the
// promotion over its objection.
//
// A CLOSED DEBATE TAKES NO MORE TURNS. Once PROMOTED the argument is on the
// record and the evidence row exists; a further response would be a turn in a
// conversation that ended.
// ---------------------------------------------------------------------------

export const respondInDebateSchema = {
  sessionId: z.string().describe('The debate — from open_debate or get_debate'),
  response: z
    .string()
    .describe("Your answer to the assessor's objection, or what its substance gaps asked for"),
};

export async function respondInDebateHandler(input: {
  sessionId: string;
  response: string;
}): Promise<string> {
  return answer(async (): Promise<DebateState | Refusal<EvidenceWriteCode>> => {
    // THE IDENTITY FIRST, BEFORE ANY QUERY: an anonymous call reads nothing, and
    // cannot learn which session ids exist from the difference between two
    // refusals.
    const researcher = requireResearcher('Answering in a debate');
    if ('error' in researcher) return researcher;

    const debate = await loadDebate(input.sessionId);
    if (debate === null) {
      return refusal('SESSION_NOT_FOUND', `No debate ${input.sessionId}.`);
    }
    const author = await requireAuthor(debate.thesisId);
    if ('error' in author) return author;

    if (input.response.trim().length === 0) {
      return refusal('REASON_REQUIRED', 'A response is required; a blank one answers nothing.');
    }
    if (debate.status !== 'OPEN') {
      return refusal(
        'SESSION_CLOSED',
        `This debate is ${debate.status}: its argument is on the record and it takes no more turns.`,
      );
    }
    if (debate.record === null) {
      throw new Error(
        `respond_in_debate: session ${input.sessionId} names neither a capture nor a pair the corpus ` +
          'holds. A debate is opened on a record; this is a malformed row.',
      );
    }

    // THE RECORD IS RE-CHECKED, because the corpus can move under an argument:
    // a re-walk supersedes a text version and the diff's CURRENT goes with it.
    // The same seven checks `open_debate` ran, from the same function.
    const checked = await recordChecks({
      record: debate.record,
      thesisId: debate.thesisId,
      headVersionId: debate.thesis.headVersionId,
    });
    if ('error' in checked) return checked;

    await recordResponse(input.sessionId, input.response);

    const version = await prisma.thesisVersion.findUnique({
      where: { id: checked.mention.versionId },
      select: { id: true, text: true },
    });
    if (version === null) {
      throw new Error(
        `respond_in_debate: the head version ${checked.mention.versionId} carries the citation and ` +
          'could not be loaded. A mention cannot outlive its version.',
      );
    }

    await assessAndRecord(input.sessionId, {
      url: checked.page.url,
      content: await assessedContent(checked),
      passages: passagesCiting(version, checked.fileHash),
      rationale: input.response,
      // EVERY EARLIER TURN — the assessor judges the ACCUMULATED argument, not
      // this response alone. Without the priors "a researcher defending an
      // inference loses credit for the specific claims they already made".
      priorTurns: priorTurns(debate),
    });

    return state(input.sessionId);
  });
}
