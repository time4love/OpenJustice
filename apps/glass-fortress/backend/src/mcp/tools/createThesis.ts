import { z } from 'zod';
import { PROVISIONS } from '../../lib/provisions';
import { loadFraming, roundsOf } from '../../services/framingRounds';
import { chosenContent } from '../../services/thesisPredicates';
import { resolveCitations, writeThesisVersion, type VersionWritten } from '../../services/thesisVersionWrite';
import { knownProvision, requireResearcher } from './openFraming';
import { answer, refusal, type Refusal } from './thesisRefusals';

// ---------------------------------------------------------------------------
// create_thesis({ claim, provision?, text, framingId? })
// WRITE · not paid — docs/gf-thesis-flows.md T2, A4 :1461–:1466.
//
// "ONE transaction: the Thesis (provision, author) · the first version by the rules of add_thesis_version ·
// attaches the framing (its CHOSEN claim must equal claim)." The transaction is the version write's; the
// refusal order is `test/thesis/contract.ts` TOOLS' NARROWED set (R40 §6-13) — no NOT_AUTHOR and no
// STALE_HEAD, which a call that creates the thesis cannot reach, and no NO_THESIS, since it takes no id:
//
//   NO_RESEARCHER · NO_FRAMING · NO_PROVISION_SHAPE · EMPTY · NOT_A_RECORD · NOT_ACQUIRED ·
//   AWAITING_DERIVATION · UNKNOWN_TRAJECTORY_ID · CLAIM_MISMATCH · FRAMING_ATTACHED · STALE_PIN
//
// CLAIM_MISMATCH IS THE LITERAL (the researcher's ruling, R47 §6-R3): some CHOSEN round of the framing
// carries `claim` character for character — no trim, no collapse (A1 :1247–:1250 omits it from NORMALISE's
// callers); a framing with no CHOSEN round mismatches. A PROVISION that disagrees with the framing's
// choice refuses NOTHING here — a silence of A4's, declared and owed as an amendment; such a thesis fails
// CLAIM_FRAMED at the gate.
//
// MISSING framing elements do NOT become OPEN gaps here (R47 §6-R13): A4 writes no decision at creation.
// ---------------------------------------------------------------------------

export const createThesisSchema = {
  claim: z
    .string()
    .describe('The claim the thesis argues — VERBATIM as chosen in its framing, character for character'),
  provision: z
    .string()
    .optional()
    .describe('The provision the thesis asserts, e.g. PATIENT_RIGHTS_13 — one per thesis, never changed'),
  text: z
    .string()
    .describe(
      'The first version EXACTLY AS THE RESEARCHER APPROVED IT, Markdown, each citation an inline token: #ev_ and a ' +
        "record's name from list_findings, #tr_ and a trajectory id, or #doc_ and a document's commitment from list_documents",
    ),
  framingId: z.string().optional().describe('The framing whose CHOSEN claim this thesis argues — attached to it'),
};

export interface CreateThesisInput {
  claim: string;
  provision?: string;
  text: string;
  framingId?: string;
}

type CreateThesisAnswer = VersionWritten & { framingId: string | null };

export async function createThesisHandler(input: CreateThesisInput): Promise<string> {
  return answer(async (): Promise<CreateThesisAnswer | Refusal> => {
    const researcher = requireResearcher('Creating a thesis');
    if ('error' in researcher) return researcher;

    const framing = input.framingId === undefined ? null : await loadFraming(input.framingId);
    if (input.framingId !== undefined && framing === null) {
      return refusal('NO_FRAMING', `No framing ${input.framingId}.`);
    }

    if (input.provision !== undefined && !knownProvision(input.provision)) {
      return refusal(
        'NO_PROVISION_SHAPE',
        `${input.provision} is not a provision this platform knows. Known: ${Object.keys(PROVISIONS).join(', ')}. ` +
          'A thesis may also be created with no provision.',
      );
    }

    if (input.text.trim() === '' || input.claim.trim() === '') {
      return refusal(
        'EMPTY',
        input.text.trim() === ''
          ? "A thesis needs its first version's text — the passage the researcher approved, with its citations."
          : 'A thesis needs its claim — the sentence it argues, verbatim as chosen in framing.',
      );
    }

    const citations = await resolveCitations(input.text);
    if ('error' in citations) return citations;

    if (framing !== null) {
      const rounds = await roundsOf(framing.id);
      const chosen = rounds.some((r) => r.type === 'CHOSEN' && chosenContent(r.content)?.claim === input.claim);
      if (!chosen) {
        return refusal(
          'CLAIM_MISMATCH',
          `Framing ${framing.id} chose no claim equal to this one, character for character. A thesis argues the ` +
            'claim its framing CHOSE: restate it exactly (get_framing shows it), or choose this claim in the ' +
            'framing first with choose_framing.',
        );
      }
      if (framing.thesisId !== null) {
        return refusal(
          'FRAMING_ATTACHED',
          `Framing ${framing.id} is already attached to thesis ${framing.thesisId}. A framing belongs to one ` +
            'thesis; open a new framing for this one.',
        );
      }
    }

    const written = await writeThesisVersion({
      researcherId: researcher.researcherId,
      text: input.text,
      claim: input.claim,
      citations,
      target: { kind: 'NEW', provision: input.provision ?? null, framingId: framing?.id ?? null },
    });
    if ('error' in written) return written;
    return { ...written, framingId: framing?.id ?? null };
  });
}
