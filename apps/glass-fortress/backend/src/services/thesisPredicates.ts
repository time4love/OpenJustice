import type { Framing, FramingRound } from '@prisma/client';

// ---------------------------------------------------------------------------
// THE THESIS LAYER'S DERIVATIONS — docs/gf-thesis-flows.md A3.
//
// ONE IMPORTABLE SYMBOL EACH, and the gate calls them rather than re-deriving
// them (A7 `one-symbol`, :1644–:1647). Thesis step 19 declares the first,
// CLAIM_FRAMED; UNARGUED, HISTORY and the gap list arrive at step 20,
// FINGERPRINT and the gap predicates at 22, TRAJECTORY_CURRENT and
// PUBLISHABLE(v) at 23, REVIEWS at 24 — `test/thesis/contract.ts` MODULES owes
// each to its step by name.
//
// EVERY PREDICATE IS COMPUTED ON READ AND NONE IS STORED (A3 :1404). This one is
// also PURE: it is handed the framings and their rounds as values, so nothing
// here holds a database client and the caller decides what to load.
// ---------------------------------------------------------------------------

/** The rows CLAIM_FRAMED reads, as A2 shapes them. */
export interface ClaimFramedInput {
  version: { thesisId: string; claim: string };
  thesis: { id: string; provision: string | null };
  framings: readonly Pick<Framing, 'id' | 'thesisId'>[];
  rounds: readonly Pick<FramingRound, 'framingId' | 'sequence' | 'type' | 'content'>[];
}

/** What a CHOSEN round's `content` Json carries (A2 :1309). */
interface ChosenContent {
  claim: string;
  provision: string | null;
}

/**
 * CLAIM_FRAMED(v) — thesis A3 `:1364–:1366`:
 *
 *   ∃ Framing f with f.thesisId = v.thesisId and a CHOSEN round r with
 *   r.claim = v.claim and r.provision = thesis.provision, and a round of
 *   type ASSESSED in f with sequence < r.sequence
 *
 * THE CLAIM IS COMPARED VERBATIM, AND NORMALISE IS NOT CALLED HERE. T2
 * `:451–:453`: the claim is "restated verbatim in each version's `claim` SO THAT
 * CLAIM_FRAMED CAN COMPARE", and A1 `:1247–:1250` lists NORMALISE's callers
 * exhaustively — the substring checks of T1 and T4, the gap id, the trajectory
 * probe — with this predicate absent from that list. So a claim differing by one
 * space is a claim that has not been framed, which is T1 `:332` read strictly:
 * "a claim reworded after its framing is a claim that has not been framed, and
 * the predicate says so by construction".
 *
 * BY SEQUENCE, NEVER `createdAt`. A3 says `sequence <`, and rows written in one
 * transaction share `now()` (interaction A3 :927), so time cannot order them.
 *
 * AN EXISTENTIAL OVER FRAMINGS, never "the latest framing": re-framing is a NEW
 * framing on the same thesis with the old one kept (T1 :318–:324), so a thesis
 * whose first framing chose another claim is still framed by its second.
 */
export function claimFramed(input: ClaimFramedInput): boolean {
  const attached = input.framings.filter((f) => f.thesisId === input.version.thesisId);

  return attached.some((framing) => {
    const mine = input.rounds.filter((r) => r.framingId === framing.id);
    const assessed = mine.filter((r) => r.type === 'ASSESSED');

    return mine.some((round) => {
      if (round.type !== 'CHOSEN') return false;
      const chosen = chosenContent(round.content);
      if (chosen === null) return false;
      if (chosen.claim !== input.version.claim) return false;
      if (chosen.provision !== input.thesis.provision) return false;
      // "preceded IN f by at least one FRAMING_ASSESSED" — an assessed round
      // whose sequence FOLLOWS the choice did not precede it.
      return assessed.some((a) => a.sequence < round.sequence);
    });
  });
}

/**
 * A CHOSEN round's content, or null when the stored Json is not the shape A2
 * gives it.
 *
 * A malformed round is NOT a framed claim and NOT a throw: this predicate is one
 * conjunct of the publication gate (A6 row 2), and a gate that throws on a
 * malformed row refuses to answer about every other conjunct too. `get_framing`
 * is where a malformed round is REPORTED as malformed (thesis step 19's
 * `test/thesisProvenance.test.ts`), which is the read whose job that is.
 *
 * `provision` is read as `null` when absent, so a framing chosen without one
 * matches a thesis without one — T1 and A2 both make the provision optional.
 */
function chosenContent(content: unknown): ChosenContent | null {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) return null;
  const { claim, provision } = content as Record<string, unknown>;
  if (typeof claim !== 'string') return null;
  if (provision !== undefined && provision !== null && typeof provision !== 'string') return null;
  return { claim, provision: typeof provision === 'string' ? provision : null };
}
