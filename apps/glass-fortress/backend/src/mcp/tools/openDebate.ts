import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { assessedContent, openOrRevise, recordChecks, type NamedRecord } from '../../services/openDebate';
import { assessAndRecord } from '../../services/respondInDebate';
import { passagesCiting } from '../../services/debatePassage';
import { loadDebate, priorTurns, projectDebate, type DebateState } from '../../services/debateState';
import { promotionBlockers } from '../../services/promoteFromDebate';
import { answer, refusal, type EvidenceWriteCode, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// open_debate({ thesisId, record, rationale }) — WRITE · PAID — evidence A4, T3.
//
// "A thesis version cites a corpus record by its name … The debate opens on that
// citation and the assessor reads the argument against the citing passage. A
// record is PROMOTED when the argument clears; there is no promotion of a record
// no text cites."
//
// THE RECORD IS NAMED AS A1 NAMES IT — a page and one or two 14-digit
// timestamps, never a row id — and the two shapes are a UNION OF STRICT OBJECTS,
// so an input carrying both `capture` and `before` fails both arms rather than
// being resolved by precedence. That is the LOW recorded against
// `check_on_chain_status` answered in the tool being written now.
//
// THE ORDER OF THE REFUSALS IS PART OF THE CONTRACT: cheapest and most local
// first, so a researcher is never told about the corpus when the real answer is
// that they are not the thesis's author.
// ---------------------------------------------------------------------------

const captureRecord = z.strictObject({
  url: z.url().describe('The page — exact URL, as it was surveyed'),
  capture: z.string().describe('One capture, by its 14-digit wayback timestamp'),
});

const pairRecord = z.strictObject({
  url: z.url().describe('The page — exact URL, as it was surveyed'),
  before: z.string().describe('The EARLIER capture of the pair, 14 digits'),
  after: z.string().describe('The LATER capture of the pair, 14 digits'),
});

export const openDebateSchema = {
  thesisId: z.string().describe('The thesis this record is argued FOR — promotion always names one'),
  record: z
    .union([captureRecord, pairRecord])
    .describe('The corpus record: { url, capture } or { url, before, after }. Never a row id'),
  rationale: z
    .string()
    .describe('Why this record carries what the citing passage says — the argument, in your words'),
};

export interface DebateInput {
  thesisId: string;
  record: NamedRecord;
  rationale: string;
}

/**
 * THE IDENTITY, BEFORE ANY QUERY — the first thing all three writes ask.
 *
 * A4's convention is "every write REFUSES without a researcher in context", and
 * the order is the sketch's own rule read strictly: an ANONYMOUS caller must not
 * cost a round trip and must not be able to learn which session ids exist from
 * the difference between two refusals. `getResearcherId` reads an
 * AsyncLocalStorage; nothing is loaded to answer it.
 */
export function requireResearcher(act: string): Refusal<EvidenceWriteCode> | { researcherId: string } {
  const researcherId = getResearcherId();
  if (researcherId === null) {
    return refusal('NO_RESEARCHER', `${act} is attributed to a researcher. No researcher in context.`);
  }
  return { researcherId };
}

/** Every refusal these three writes share, worded once (A4's conventions). */
export async function requireAuthor(
  thesisId: string,
): Promise<Refusal<EvidenceWriteCode> | { researcherId: string; headVersionId: string | null }> {
  const researcher = requireResearcher('Arguing for a record');
  if ('error' in researcher) return researcher;
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { createdById: true, headVersionId: true },
  });
  if (thesis === null) {
    return refusal('NO_THESIS', `No thesis ${thesisId}. Promotion names the thesis it is made for, always.`);
  }
  // NOT_AUTHOR — thesis §9: "A thesis has one author, and every write on it
  // refuses NOT_AUTHOR … versions, arguments, decisions, framings, notes,
  // publication and withdrawal are theirs." The author is REQUIRED (thesis A2
  // :1263), so every thesis has one to compare.
  if (thesis.createdById !== researcher.researcherId) {
    return refusal(
      'NOT_AUTHOR',
      `Thesis ${thesisId} is not yours to argue for. A thesis has one author and every write on it ` +
        'is theirs; any researcher may READ its working state.',
    );
  }
  return { researcherId: researcher.researcherId, headVersionId: thesis.headVersionId };
}

export async function openDebateHandler(input: DebateInput): Promise<string> {
  return answer(async (): Promise<DebateState | Refusal<EvidenceWriteCode>> => {
    const author = await requireAuthor(input.thesisId);
    if ('error' in author) return author;

    if (input.rationale.trim().length === 0) {
      return refusal('REASON_REQUIRED', 'An argument is required; a blank rationale is no argument.');
    }

    const checked = await recordChecks({
      record: input.record,
      thesisId: input.thesisId,
      headVersionId: author.headVersionId,
    });
    if ('error' in checked) return checked;

    const { sessionId } = await openOrRevise({
      thesisId: input.thesisId,
      checked,
      rationale: input.rationale,
      researcherId: author.researcherId,
    });

    // THE PAID DRAW, outside the write above and before the state is read back.
    const opened = await loadDebate(sessionId);
    if (opened === null) {
      throw new Error(`open_debate: session ${sessionId} was written and could not be read back.`);
    }
    const version = await prisma.thesisVersion.findUnique({
      where: { id: checked.mention.versionId },
      select: { id: true, text: true },
    });
    if (version === null) {
      throw new Error(
        `open_debate: the head version ${checked.mention.versionId} carries the citation and could ` +
          'not be loaded. A mention cannot outlive its version.',
      );
    }

    await assessAndRecord(sessionId, {
      url: checked.page.url,
      content: await assessedContent(checked),
      passages: passagesCiting(version, checked.fileHash),
      rationale: input.rationale,
      // The turns BEFORE this round — the rationale just written is passed as the
      // argument, not as a prior, so the assessor is never handed it twice.
      priorTurns: priorTurns(opened).slice(0, -1),
    });

    return state(sessionId);
  });
}

/** The debate as all four tools return it, with the blockers one function found. */
export async function state(sessionId: string): Promise<DebateState> {
  const debate = await loadDebate(sessionId);
  if (debate === null) {
    throw new Error(`debate ${sessionId} could not be read back after a write to it.`);
  }
  const { blockedBy } = await promotionBlockers(debate);
  return projectDebate(debate, blockedBy);
}
