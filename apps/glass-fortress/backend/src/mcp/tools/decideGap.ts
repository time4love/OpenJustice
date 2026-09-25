import type { ThesisGapDecision } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asJsonColumn } from '../../lib/jsonColumn';
import { gapId as gapIdOf } from '../../lib/thesisIdentity';
import { isUniqueViolation } from '../../lib/uniqueViolation';
import { gapInForce } from '../../services/thesisPredicates';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// decide_gap({ thesisId, gapId | description, decision, citedName?, request?, callItem?, reason?, expectedSequence })
// WRITE · not paid — docs/gf-thesis-flows.md T4 :618–:646, A2 :1320–:1330, A4 :1488–:1494.
//
// "Appends a ThesisGapDecision; a description with no known gapId enters the list." The refusal order is
// `test/thesis/contract.ts` TOOLS':
//
//   NO_RESEARCHER · NO_THESIS · NOT_AUTHOR · NO_HEAD · NO_SUCH_GAP · NOT_CITED · REASON_REQUIRED · REQUEST_REQUIRED ·
//   CALL_ITEM_REQUIRED · STALE_SEQUENCE
//
// NO NAMES_PERSON (the researcher's ruling, 2026-09-14): a person named in a call item is checked at PUBLICATION, by
// check 16 NAMES_NO_PERSON over the appeals that publish with the version — never refused here, so this tool spends nothing.
//
// NO_HEAD is the flow's (T4 :626). NO_SUCH_GAP is the researcher's (2026-09-14): a gapId the log does not hold with no
// description, a gapId and a description that disagree, and a call naming neither (REVIEW, R48 §6-R25).
//
// THE COMPARE-AND-SET IS THE CONSTRAINT'S. `expectedSequence` is checked against the log this call read — the cheap
// refusal — and the ONE create meets `@@unique([thesisId, gapId, sequence])`: the loser of a race refuses
// STALE_SEQUENCE, identified by `meta.target`, never by the code alone. A pre-read alone would pass a race it cannot see.
//
// EACH DECISION WRITES ITS OWN FIELD AND NO OTHER'S (R48 D6): CITED its record's name and NO pin — the pin is the
// mention's (T4 :632–:634) — REQUESTED its request, CALLED its call item, CONCEDED and DISMISSED their reason, OPEN
// nothing. The decision records the HEAD it was decided on (T4 :628). One row; no transaction.
// ---------------------------------------------------------------------------

const DECISIONS = ['OPEN', 'CITED', 'REQUESTED', 'CALLED', 'CONCEDED', 'DISMISSED'] as const;

export const decideGapSchema = {
  thesisId: z.string().describe('The thesis whose gap list this decides — yours'),
  gapId: z.string().optional().describe('The gap, by the id get_thesis_context or run_analysis gave it'),
  description: z
    .string()
    .optional()
    .describe('The gap in one sentence — enters the list when no gap has it (its id is computed from these words)'),
  decision: z.enum(DECISIONS).describe('OPEN · CITED · REQUESTED · CALLED · CONCEDED · DISMISSED'),
  citedName: z.string().optional().describe('CITED: the name of a record the HEAD version cites — never a pin'),
  request: z
    .object({
      text: z.string(),
      authority: z.string(),
      legalBasis: z.string(),
      addresses: z.array(z.string()),
      restsOn: z.array(z.string()),
    })
    .optional()
    .describe('REQUESTED: the FOIA request the researcher approved, as draft_foia_request returned it and they amended it'),
  callItem: z
    .object({ whatIsNeeded: z.string(), whoWouldHaveSeenIt: z.string(), unit: z.string(), window: z.string() })
    .optional()
    .describe('CALLED: the call item in the researcher\'s words — units and roles, never a person'),
  reason: z.string().optional().describe('CONCEDED or DISMISSED: why'),
  expectedSequence: z.number().int().min(0).describe('The sequence of the decision in force you read — 0 for a gap entering'),
};

export interface DecideGapInput {
  thesisId: string;
  gapId?: string;
  description?: string;
  decision: (typeof DECISIONS)[number];
  citedName?: string;
  request?: { text: string; authority: string; legalBasis: string; addresses: string[]; restsOn: string[] };
  callItem?: { whatIsNeeded: string; whoWouldHaveSeenIt: string; unit: string; window: string };
  reason?: string;
  expectedSequence: number;
}

interface DecideGapAnswer {
  gapId: string;
  decision: string;
  sequence: number;
}

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === '';

/** A decision written against a log that moved — thrown nowhere; the create's collision is caught at its one site. */
const staleSequence = (gapId: string, expected: number, actual: number | null): Refusal<'STALE_SEQUENCE'> =>
  refusal(
    'STALE_SEQUENCE',
    (actual === null
      ? `The decision log of gap ${gapId} moved between this call's read and its write — another decision was recorded ` +
        'first, and where it stands now is not known until you read again. '
      : `The decision log of gap ${gapId} is at sequence ${String(actual)} and this call expected ${String(expected)}. `) +
      'Read get_thesis_context again and decide against the decision in force it shows. Nothing was written.',
  );

export async function decideGapHandler(input: DecideGapInput): Promise<string> {
  return answer(async (): Promise<DecideGapAnswer | Refusal> => {
    const researcher = requireResearcher('Deciding a gap');
    if ('error' in researcher) return researcher;

    const thesis = await prisma.thesis.findUnique({
      where: { id: input.thesisId },
      select: { id: true, createdById: true, headVersionId: true },
    });
    if (thesis === null) {
      return refusal('NO_THESIS', `No thesis ${input.thesisId}. list_theses names your theses.`);
    }
    if (thesis.createdById !== researcher.researcherId) {
      return refusal('NOT_AUTHOR', `Thesis ${thesis.id} is not yours. A thesis's gaps are decided by its author.`);
    }
    if (thesis.headVersionId === null) {
      return refusal('NO_HEAD', `Thesis ${thesis.id} has no version yet, so there is nothing a gap could be a gap in.`);
    }

    const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId: thesis.id } });
    const resolved = resolveGap(input, decisions);
    if ('error' in resolved) return resolved;
    const { id, description } = resolved;

    if (input.decision === 'CITED') {
      const mentions = await prisma.thesisMention.findMany({ where: { versionId: thesis.headVersionId }, select: { name: true } });
      if (input.citedName === undefined || !mentions.some((m) => m.name === input.citedName)) {
        return refusal(
          'NOT_CITED',
          `${input.citedName === undefined || input.citedName === '' ? 'CITED names no record' : `The head version does not cite ${input.citedName}`}. ` +
            'A gap is CITED when the corpus answers it in the text: cite the record in a version first (#ev_ and its ' +
            'name, or #doc_ and a document\'s commitment), then decide the gap CITED naming it — the pin is the ' +
            'citation\'s, never the decision\'s.',
        );
      }
    }
    if ((input.decision === 'CONCEDED' || input.decision === 'DISMISSED') && blank(input.reason)) {
      return refusal('REASON_REQUIRED', `A gap ${input.decision} carries its reason — why, in the researcher's words.`);
    }
    if (
      input.decision === 'REQUESTED' &&
      (input.request === undefined || blank(input.request.text) || blank(input.request.authority) || blank(input.request.legalBasis))
    ) {
      return refusal(
        'REQUEST_REQUIRED',
        'A gap REQUESTED carries the request the public will send: its text, the authority addressed and the legal basis ' +
          '— draft_foia_request drafts one to amend and approve.',
      );
    }
    if (
      input.decision === 'CALLED' &&
      (input.callItem === undefined ||
        blank(input.callItem.whatIsNeeded) ||
        blank(input.callItem.whoWouldHaveSeenIt) ||
        blank(input.callItem.unit) ||
        blank(input.callItem.window))
    ) {
      return refusal(
        'CALL_ITEM_REQUIRED',
        'A gap CALLED carries its call item: what is needed, who would have seen it, in which unit, in which window — ' +
          'units and roles, never a person.',
      );
    }

    const inForce = gapInForce(decisions, thesis.id, id)?.sequence ?? 0;
    if (input.expectedSequence !== inForce) return staleSequence(id, input.expectedSequence, inForce);

    const sequence = input.expectedSequence + 1;
    try {
      await prisma.thesisGapDecision.create({
        data: {
          thesisId: thesis.id,
          versionId: thesis.headVersionId,
          gapId: id,
          description,
          sequence,
          decision: input.decision,
          researcherId: researcher.researcherId,
          ...(input.decision === 'CITED' ? { citedName: input.citedName } : {}),
          ...(input.decision === 'REQUESTED' && input.request !== undefined ? { request: asJsonColumn(input.request) } : {}),
          ...(input.decision === 'CALLED' && input.callItem !== undefined ? { callItem: asJsonColumn(input.callItem) } : {}),
          ...(input.decision === 'CONCEDED' || input.decision === 'DISMISSED' ? { reason: input.reason } : {}),
        },
        select: { id: true },
      });
    } catch (err) {
      if (!isUniqueViolation(err, ['thesisId', 'gapId', 'sequence'])) throw err;
      return staleSequence(id, input.expectedSequence, null);
    }

    return { gapId: id, decision: input.decision, sequence };
  });
}

/**
 * Which gap the call decides — and the description the row carries: the input's VERBATIM when given, else the words
 * the gap ENTERED with, its lowest sequence's (R48 D7) — never re-typed.
 */
function resolveGap(
  input: DecideGapInput,
  decisions: readonly ThesisGapDecision[],
): { id: string; description: string } | Refusal<'NO_SUCH_GAP'> {
  if (input.gapId === undefined) {
    // NEITHER, or a blank description: a gap is identified by its description, so the call names no gap.
    const description = input.description ?? '';
    if (description.trim() === '') {
      return refusal('NO_SUCH_GAP', 'The call names no gap: give its gapId, or a description to enter a new one.');
    }
    return { id: gapIdOf(description), description };
  }
  if (input.description !== undefined && gapIdOf(input.description) !== input.gapId) {
    return refusal(
      'NO_SUCH_GAP',
      `The description given is gap ${gapIdOf(input.description)}, not ${input.gapId}: a re-worded description is a new ` +
        'gap. Give the gapId alone to decide that gap, or the description alone to enter this one.',
    );
  }
  const entered = decisions.filter((d) => d.gapId === input.gapId).sort((a, b) => a.sequence - b.sequence).at(0);
  if (entered !== undefined) return { id: input.gapId, description: input.description ?? entered.description };
  // A gapId WITH an agreeing description ENTERS the list: the description names the gap and the id is consistent with
  // it (REVIEW, R48 chunk 4 M1). An id alone names nothing the log holds.
  if (input.description !== undefined) return { id: input.gapId, description: input.description };
  return refusal(
    'NO_SUCH_GAP',
    `No gap ${input.gapId} is on this thesis's list — give its description to enter it. get_thesis_context shows the list.`,
  );
}
