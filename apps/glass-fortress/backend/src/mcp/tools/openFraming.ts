import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { PROVISIONS } from '../../lib/provisions';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// open_framing({ question, provision?, thesisId?, fromRunId?, clusterIndex? })
// WRITE · not paid — docs/gf-thesis-flows.md T1, A4 :1434–:1440.
//
// "Creates the FRAMING record — no status, no lock, nothing to close (§9);
// thesisId null until T2 attaches one." A framing needs no thesis: a thesis may
// exist before its evidence, and framing is what exists for that (T1 :318–:322).
//
// THE ORDER IS PART OF THE CONTRACT: identity before any query, then the thesis,
// then its author, then the arguments. A researcher is never told about a
// provision when the real answer is that the thesis is not theirs.
// ---------------------------------------------------------------------------

export const openFramingSchema = {
  question: z.string().describe('What you want to establish — the question, in your words'),
  provision: z
    .string()
    .optional()
    .describe('The legal provision this thesis would assert, e.g. NUREMBERG_1. Optional; a different provision is a different thesis'),
  thesisId: z.string().optional().describe('An existing UNPUBLISHED thesis of yours to attach this framing to'),
  fromRunId: z.string().optional().describe('A ProsecutionRun to pre-fill the elements from (not yet built)'),
  clusterIndex: z.number().int().optional().describe("Which cluster of that run"),
};

export interface OpenFramingInput {
  question: string;
  provision?: string;
  thesisId?: string;
  fromRunId?: string;
  clusterIndex?: number;
}

interface OpenFramingAnswer {
  framingId: string;
  question: string;
  provision: string | null;
  elements: { element: string; records: string[] }[];
}

/**
 * THE IDENTITY, BEFORE ANY QUERY — A4's convention, and the reason it is first:
 * an anonymous caller must not cost a round trip and must not learn which ids
 * exist from the difference between two refusals. `getResearcherId` reads an
 * AsyncLocalStorage; nothing is loaded to answer it.
 */
export function requireResearcher(act: string): Refusal | { researcherId: string } {
  const researcherId = getResearcherId();
  if (researcherId === null) {
    return refusal('NO_RESEARCHER', `${act} is attributed to a researcher. No researcher in context.`);
  }
  return { researcherId };
}

/** The provision's element shapes, from A1's ONE importable table — never a second list. */
export function elementShapesOf(provision: string | null): readonly string[] {
  if (provision === null) return [];
  const shapes: Readonly<Record<string, readonly string[]>> = PROVISIONS;
  return shapes[provision] ?? [];
}

export function knownProvision(provision: string): boolean {
  return Object.keys(PROVISIONS).includes(provision);
}

export async function openFramingHandler(input: OpenFramingInput): Promise<string> {
  return answer(async (): Promise<OpenFramingAnswer | Refusal> => {
    const researcher = requireResearcher('Opening a framing');
    if ('error' in researcher) return researcher;

    if (input.thesisId !== undefined) {
      const thesis = await prisma.thesis.findUnique({
        where: { id: input.thesisId },
        select: { createdById: true, headVersionId: true, publishedVersionId: true },
      });
      if (thesis === null) {
        return refusal('NO_THESIS', `No thesis ${input.thesisId}. A framing attaches to a thesis you authored.`);
      }
      if (thesis.createdById !== researcher.researcherId) {
        return refusal(
          'NOT_AUTHOR',
          `Thesis ${input.thesisId} is not yours to frame. A thesis has one author and every write on ` +
            'it is theirs; any researcher may READ its working state.',
        );
      }
      // "The thesis's head IS its published version — frame the next version, not
      // this" (A4 :1438–:1439). A thesis with a later head is unpublished work and
      // is framed freely.
      if (thesis.publishedVersionId !== null && thesis.publishedVersionId === thesis.headVersionId) {
        return refusal(
          'PUBLISHED',
          `Thesis ${input.thesisId} has its published version as its head. Frame the NEXT version: ` +
            'write it first, then open a framing on the thesis.',
        );
      }
    }

    if (input.provision !== undefined && !knownProvision(input.provision)) {
      return refusal(
        'NO_PROVISION_SHAPE',
        `${input.provision} is not a provision this platform knows. The table names each provision and ` +
          `the record shapes it requires; extending it is a change to lib/provisions.ts, in a PR. ` +
          `Known: ${Object.keys(PROVISIONS).join(', ')}.`,
      );
    }

    // NO ProsecutionRun EXISTS (A2 :1345, "later (§10)"), so any run id names none.
    // Refused rather than ignored: a framing recorded as derived from a cluster
    // that does not exist would be a false provenance on its first day.
    if (input.fromRunId !== undefined) {
      return refusal(
        'NO_SUCH_RUN',
        `No prosecution run ${input.fromRunId}. The Prosecutor is designed and not built, so no run ` +
          'exists to pre-fill a framing from; open the framing on your own question instead.',
      );
    }

    const provision = input.provision ?? null;
    const created = await prisma.framing.create({
      data: {
        question: input.question,
        provision,
        researcherId: researcher.researcherId,
        thesisId: input.thesisId ?? null,
        fromRunId: null,
        clusterIndex: null,
      },
      select: { id: true },
    });

    return {
      framingId: created.id,
      question: input.question,
      provision,
      // EACH UNFILLED (A4 :1437; T1 :239–:240). With no provision there are no
      // required shapes, so the list is empty rather than absent.
      elements: elementShapesOf(provision).map((element) => ({ element, records: [] })),
    };
  });
}
