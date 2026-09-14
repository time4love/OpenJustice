import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { loadFraming } from '../../services/framingRounds';
import { requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// add_note({ thesisId | framingId, text })
// WRITE · not paid — docs/gf-thesis-flows.md §9 :986–:997, A4 :1520–:1521.
//
// "Appends ONE Note: the target · text · researcherId · at." A note is attributed and never public. It is
// not a decision and no flow reads it as state: a note that says a gap is resolved resolves nothing.
//
// THE ORDER (`test/thesis/contract.ts` TOOLS): NO_RESEARCHER · NEITHER · NO_THESIS · NO_FRAMING ·
// NOT_AUTHOR · EMPTY. NEITHER is decided from the INPUT — "exactly one set", the `Note_one_target` CHECK
// (A2 :1343) — before any row is looked up, since it decides which row to look up. NO_THESIS and NO_FRAMING
// are step 17's rulings (Q2, Q3a). NOT_AUTHOR on a framing is its `researcherId`'s: add_note's own word.
//
// THE TEXT IS STORED VERBATIM — blank is EMPTY, and nothing else is trimmed.
// ---------------------------------------------------------------------------

export const addNoteSchema = {
  thesisId: z.string().optional().describe('The thesis the note is about — give this OR framingId, never both'),
  framingId: z.string().optional().describe('The framing the note is about — give this OR thesisId, never both'),
  text: z
    .string()
    .describe("The note EXACTLY AS THE RESEARCHER WROTE IT — an observation, a dead end, a thing to come back to"),
};

export interface AddNoteInput {
  thesisId?: string;
  framingId?: string;
  text: string;
}

interface NoteAdded {
  noteId: string;
  thesisId: string | null;
  framingId: string | null;
  text: string;
  researcherId: string;
}

export async function addNoteHandler(input: AddNoteInput): Promise<string> {
  return answer(async (): Promise<NoteAdded | Refusal> => {
    const researcher = requireResearcher('Adding a note');
    if ('error' in researcher) return researcher;

    if ((input.thesisId === undefined) === (input.framingId === undefined)) {
      return refusal(
        'NEITHER',
        'A note names exactly one target: a thesis (thesisId) or a framing (framingId) — ' +
          (input.thesisId === undefined ? 'this names neither.' : 'this names both.'),
      );
    }

    if (input.thesisId !== undefined) {
      const thesis = await prisma.thesis.findUnique({ where: { id: input.thesisId }, select: { createdById: true } });
      if (thesis === null) return refusal('NO_THESIS', `No thesis ${input.thesisId}.`);
      if (thesis.createdById !== researcher.researcherId) {
        return refusal('NOT_AUTHOR', `Thesis ${input.thesisId} is not yours. A note on a thesis is its author's.`);
      }
    } else if (input.framingId !== undefined) {
      const framing = await loadFraming(input.framingId);
      if (framing === null) return refusal('NO_FRAMING', `No framing ${input.framingId}.`);
      if (framing.researcherId !== researcher.researcherId) {
        return refusal('NOT_AUTHOR', `Framing ${input.framingId} is not yours. A note on a framing is its researcher's.`);
      }
    }

    if (input.text.trim() === '') return refusal('EMPTY', 'A note needs its text.');

    const note = await prisma.note.create({
      data: {
        thesisId: input.thesisId ?? null,
        framingId: input.framingId ?? null,
        text: input.text,
        researcherId: researcher.researcherId,
      },
      select: { id: true },
    });
    return {
      noteId: note.id,
      thesisId: input.thesisId ?? null,
      framingId: input.framingId ?? null,
      text: input.text,
      researcherId: researcher.researcherId,
    };
  });
}
