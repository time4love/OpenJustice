import { prisma } from '../../lib/prisma';
import { chosenContent } from '../../services/thesisPredicates';
import { answer } from './thesisRefusals';

// ---------------------------------------------------------------------------
// list_framings({})
// GATED read · not paid — built 2026-09-14 on the researcher's ruling, between thesis steps 20 and 22.
//
// THE GAP IT CLOSES: docs/gf-thesis-step-19-2026-09-12.md §3 F3 — "nothing lists a researcher's framings,
// theses or pages; state lived in the chat". `list_theses` closed the thesis half at step 20; step 20's own
// staging exercise then stopped on its first step because a session driven by the tools alone had no way to
// find the framing it was to turn into a thesis — an id from the chat is not a tool. Thesis A4 names no such
// read; the A4 amendment is owed beside the seven of step 20 (the docs PR).
//
// EVERY FRAMING, TO ANY RESEARCHER. Thesis §9 :1002–:1004: "Any researcher READS any thesis's working state …
// gated from the public, not from colleagues" — and a framing is working state that carries a model's
// opinions (T5), so it is GATED like `get_framing` (A4 :1458), in `mcpRoutes`' WRITE_TOOLS, while this handler
// asks no identity (interaction A5 :1071–:1072). It refuses nothing: an empty list is an answer.
//
// WHAT AN ENTRY CARRIES, AND WHY THE CLAIM IS ON IT. `create_thesis` restates the CHOSEN claim CHARACTER FOR
// CHARACTER (A4 :1463; R47 §6-R3), so the claim is returned here verbatim from the latest CHOSEN round —
// one read gives a session the bytes it must copy, and `get_framing` remains the read for the rounds and
// their verdicts. `author` is `Researcher.handle`, the one public identifier; a framing whose researcher row
// is missing is a broken foreign key and THROWS (the `list_theses` precedent, R47 §6-R8).
//
// ORDER: oldest first by `createdAt`, then id — rows written in one transaction share now() (interaction A3
// :927), so the tie is broken the same way every time and stored nowhere.
// ---------------------------------------------------------------------------

export const listFramingsSchema = {};

interface FramingEntry {
  framingId: string;
  question: string;
  provision: string | null;
  author: string;
  thesisId: string | null;
  openedAt: Date;
  rounds: number;
  /** The highest-sequence round, or null on a framing with no round yet. */
  latest: { sequence: number; type: string } | null;
  /** The latest CHOSEN round's claim, verbatim — what `create_thesis` must restate; null until a choice. */
  claim: string | null;
}

/** THE ONE FUNCTION behind the tool and `GET /api/research/framings` (UI-3). */
export async function framingsOf(): Promise<FramingEntry[]> {
  const framings = await prisma.framing.findMany({
    select: { id: true, question: true, provision: true, researcherId: true, thesisId: true, createdAt: true },
  });
  if (framings.length === 0) return [];

  const rounds = await prisma.framingRound.findMany({
    where: { framingId: { in: framings.map((f) => f.id) } },
    select: { framingId: true, sequence: true, type: true, content: true },
  });
  const handles = await handlesOf(framings.map((f) => f.researcherId));

  return [...framings]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((framing): FramingEntry => {
      const mine = rounds.filter((r) => r.framingId === framing.id).sort((a, b) => a.sequence - b.sequence);
      const latest = mine.at(-1);
      const chosen = [...mine].reverse().find((r) => r.type === 'CHOSEN');
      return {
        framingId: framing.id,
        question: framing.question,
        provision: framing.provision,
        author: handleOf(handles, framing.researcherId, framing.id),
        thesisId: framing.thesisId,
        openedAt: framing.createdAt,
        rounds: mine.length,
        latest: latest === undefined ? null : { sequence: latest.sequence, type: latest.type },
        claim: chosen === undefined ? null : (chosenContent(chosen.content)?.claim ?? null),
      };
    });
}

export async function listFramingsHandler(): Promise<string> {
  return answer(() => framingsOf());
}

/** The handles of these researchers, by id — one query. */
async function handlesOf(ids: readonly string[]): Promise<Map<string, string>> {
  const rows = await prisma.researcher.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, handle: true } });
  return new Map(rows.map((r) => [r.id, r.handle]));
}

/** A researcher's handle — a missing row is a broken foreign key, and says so. */
function handleOf(handles: ReadonlyMap<string, string>, researcherId: string, framingId: string): string {
  const handle = handles.get(researcherId);
  if (handle === undefined) {
    throw new Error(
      `list_framings: framing ${framingId} names researcher ${researcherId}, and no such researcher exists. ` +
        'A framing cannot outlive its author row; this is a broken foreign key, not an anonymous author.',
    );
  }
  return handle;
}
