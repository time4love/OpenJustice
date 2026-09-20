import { z } from 'zod';
import { loadFraming, roundsOf } from '../../services/framingRounds';
import { prisma } from '../../lib/prisma';
import { getResearcherId } from '../../context/researcherContext';
import { handlesOf } from '../../services/publishedThesis';
import { framingTurns, orderTurns, voicesOf, type Researcher, type Turn } from '../../services/thesisTranscript';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// get_framing({ framingId }) — GATED read — docs/gf-thesis-flows.md A4 :1458–:1459.
//
// "Returns the framing and every round, verdicts included, and the thesis it
// attaches to."
//
// GATED, AND NOT BY AUTHORSHIP. Thesis §9: "Any researcher READS any thesis's
// working state … because working state is gated from the public, not from
// colleagues." What keeps it off a public page is that it holds a model's
// opinions, which T5 lists among what a published page never shows. A GATED
// read's HANDLER answers without an identity — the gate is the route's
// (`mcpRoutes`' WRITE_TOOLS), not the handler's — so an anonymous call reaches
// this code and gets NO_FRAMING for an id naming nothing, as flows A5
// :1037–:1038 has it.
//
// IT WRITES NOTHING AND SPENDS NOTHING: the verdicts it returns are the ones the
// audit already recorded, verbatim.
// ---------------------------------------------------------------------------

export const getFramingSchema = {
  framingId: z.string().describe('The framing to read'),
};

/**
 * A round as the read shows it — its content PARSED into the answer, never handed
 * back as a JSON string, and a stored content that is not an object reported AS
 * MALFORMED rather than as absent or empty.
 *
 * The distinction is the one `corpusReads.opinionOf` holds over another register
 * for the same reason: absent is a FACT, whole is a derivation with its
 * provenance, and between them is nothing the design names. A malformed round
 * reported as `{}` would read as an assessment that found nothing.
 */
/**
 * THE FRAMING THREAD, AS TURNS — A4 :1459, RULED 2026-09-20 (the researcher, R66).
 *
 * `rounds` and `researcherId` are RETIRED with the builder, exactly as `get_debate`'s `events` were
 * (evidence :1123): the sheet that renders a framing and the stream that renders the same acts inside
 * `get_thesis_context` now draw the SAME four turn kinds from the SAME function, so neither can describe a
 * round the other would describe differently. The malformed rule is unchanged and now lives in the builder —
 * a stored content that is not an object is `malformed: true` with a null body, never `{}`.
 */
interface GetFramingAnswer {
  framingId: string;
  question: string;
  provision: string | null;
  thesisId: string | null;
  /** The author, as a handle and a `mine` — never an id on the wire (A4 :1476). */
  by: Researcher;
  turns: Turn[];
}

/** THE ONE FUNCTION behind the tool and `GET /api/research/framings/:id` (UI-3). */
export async function framingOf(input: { framingId: string }): Promise<GetFramingAnswer | Refusal<'NO_FRAMING'>> {
  const framing = await loadFraming(input.framingId);
  if (framing === null) {
    return refusal('NO_FRAMING', `No framing ${input.framingId}.`);
  }
  const rounds = await roundsOf(input.framingId);
  // The versions of the thesis this framing attaches to, for a CHOSEN round's `restatedBy` — none when the
  // framing has produced no thesis yet (ui §29 :903, "a framing that produced none yet").
  const versions =
    framing.thesisId === null
      ? []
      : await prisma.thesisVersion.findMany({ where: { thesisId: framing.thesisId }, select: { id: true, claim: true } });
  const handles = await handlesOf([framing.researcherId, ...rounds.map((r) => r.researcherId)]);
  const voices = voicesOf(handles, getResearcherId(), framing.thesisId ?? framing.id);
  return {
    framingId: framing.id,
    question: framing.question,
    provision: framing.provision,
    thesisId: framing.thesisId,
    by: voices.researcher(framing.researcherId),
    turns: orderTurns(
      framingTurns(
        {
          id: framing.id,
          question: framing.question,
          provision: framing.provision,
          fromRunId: framing.fromRunId,
          researcherId: framing.researcherId,
          createdAt: framing.createdAt,
        },
        rounds,
        versions,
        voices,
      ),
    ),
  };
}

export async function getFramingHandler(input: { framingId: string }): Promise<string> {
  return answer(() => framingOf(input));
}
