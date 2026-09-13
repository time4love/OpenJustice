import { z } from 'zod';
import { loadFraming, roundsOf, type Round } from '../../services/framingRounds';
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
interface ProjectedRound {
  sequence: number;
  type: string;
  content: unknown;
  malformed: boolean;
  researcherId: string;
  createdAt: Date;
}

interface GetFramingAnswer {
  framingId: string;
  question: string;
  provision: string | null;
  thesisId: string | null;
  researcherId: string;
  rounds: ProjectedRound[];
}

function project(round: Round): ProjectedRound {
  const whole = typeof round.content === 'object' && round.content !== null && !Array.isArray(round.content);
  return {
    sequence: round.sequence,
    type: round.type,
    content: whole ? round.content : null,
    malformed: !whole,
    researcherId: round.researcherId,
    createdAt: round.createdAt,
  };
}

export async function getFramingHandler(input: { framingId: string }): Promise<string> {
  return answer(async (): Promise<GetFramingAnswer | Refusal> => {
    const framing = await loadFraming(input.framingId);
    if (framing === null) {
      return refusal('NO_FRAMING', `No framing ${input.framingId}.`);
    }
    const rounds = await roundsOf(input.framingId);
    return {
      framingId: framing.id,
      question: framing.question,
      provision: framing.provision,
      thesisId: framing.thesisId,
      researcherId: framing.researcherId,
      rounds: rounds.map(project),
    };
  });
}
