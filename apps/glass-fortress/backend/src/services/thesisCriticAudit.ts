import { normaliseClaim } from '../lib/normalise';
import { gapId } from '../lib/thesisIdentity';
import { verdictInAny, type Verdict } from '../lib/verdict';
import type { CriticGap, CriticRecord, CriticTrajectory, ThesisCritique } from './thesisCritic';

// ---------------------------------------------------------------------------
// THE AUDIT OF THE CRITIQUE — docs/gf-thesis-flows.md T4 :595–:601, "AUDITS it, mechanically, before recording (T1's
// rule for every model actor)".
//
// PURE: values in, verdicts out — `lib/normalise`, `lib/verdict`, `lib/thesisIdentity`, and types. It runs on the
// zod-PARSED critique and its output is what `run_analysis` records (A7 `models-write-no-state`: "their output reaches
// a row only through the tool that called them, AFTER THE AUDIT").
//
// NOTHING IS DROPPED AND NOTHING GATES (T4 :614): a misquotation is recorded `quoteVerified: false`, an unfounded
// attribution ABSENT, an unreadable one UNCHECKED WITH ITS REASON. The shape is `services/framingAudit.ts`', rule for
// rule — the R48 sketch §d4 is the table each case holds.
// ---------------------------------------------------------------------------

export interface AuditedCounterArgument {
  quote: string;
  quoteVerified: boolean;
  challenge: string;
  grounding: 'RECORD' | 'ABSENCE';
  source: string;
  phrase: string;
  phraseVerified: Verdict;
  /** Why no verdict could be reached, where none was — never a bare UNCHECKED. Null is the absence, written down. */
  phraseVerifiedReason: string | null;
}

export interface AuditedSuggestedGap {
  description: string;
  document: string;
  holder: string;
  /** gapId(description) — null only for a blank description, which names no gap (R48 D11). */
  gapId: string | null;
  gapIdReason: string | null;
  /** What the gap reads as on the thesis's list already, or null when it is new — a re-raised DISMISSED gap is KEPT and marked. */
  onTheList: string | null;
}

export interface AuditedCritique {
  counterArguments: AuditedCounterArgument[];
  suggestedGaps: AuditedSuggestedGap[];
  alternativeReadings: string[];
  strength: { grade: 'STRONG' | 'MODERATE' | 'WEAK'; reasoning: string; by: 'the critic' };
}

export interface CritiqueAuditInput {
  text: string;
  records: readonly CriticRecord[];
  trajectories: readonly CriticTrajectory[];
  gaps: readonly CriticGap[];
  critique: ThesisCritique;
}

/**
 * A label's ORDINAL — `[2]` → `2`, `[T1·6a505dc8]` → `T1` — or null when it is neither. A trajectory is matched on its
 * ordinal and the `·hash` suffix ignored: the ordinal is what a model quotes (FINDING 78). EXPORTED as the ONE reader
 * of a label a model echoes back — the drafter's `restsOn` is resolved by it too.
 */
export function ordinalOf(label: string): string | null {
  const inner = normaliseClaim(label).replace(/^\[/, '').replace(/\]$/, '');
  return /^T\d+(?:·.*)?$/.exec(inner) !== null ? (inner.split('·').at(0) ?? null) : /^\d+$/.test(inner) ? inner : null;
}

/** The texts the ONE verdict rule searches for a source: a capture's text, a diff's CHUNKS each apart, a trajectory's claim. */
type Searchable = { texts: string[] } | { unresolved: string };

function searchableOf(record: CriticRecord): Searchable {
  return { texts: record.kind === 'CAPTURE' ? [record.text] : record.chunks.map((c) => c.text) };
}

/**
 * A TRAJECTORY's content, as the verdict rule reads it, is the CLAIM the detection pass searched for — its presence
 * history is handed to the critic as spans and is not a text (R48 §6-R28).
 */
function searchableOfTrajectory(trajectory: CriticTrajectory): Searchable {
  return trajectory.resolves
    ? { texts: [trajectory.claimText] }
    : { unresolved: `The critique names ${trajectory.label}, a trajectory no detection pass holds any longer; there is no claim to search.` };
}

/** Every assertion of the critique, with a verdict beside it. */
export function auditCritique(input: CritiqueAuditInput): AuditedCritique {
  const sources = new Map<string, Searchable>();
  for (const record of input.records) {
    const ordinal = ordinalOf(record.label);
    if (ordinal !== null) sources.set(ordinal, searchableOf(record));
  }
  for (const trajectory of input.trajectories) {
    const ordinal = ordinalOf(trajectory.label);
    if (ordinal !== null) sources.set(ordinal, searchableOfTrajectory(trajectory));
  }

  // R-Q: NORMALISE is CALLED, from `lib/normalise` — a second collapse here is a scan failure (A7 `one-symbol`).
  const text = normaliseClaim(input.text);

  const counterArguments = input.critique.counterArguments.map((c): AuditedCounterArgument => {
    // R-Q0 and R-P0: THE EMPTINESS GUARD, ON THE NORMALISED FORM — a whitespace-only string is as empty as '' (R44).
    const quote = normaliseClaim(c.quote);
    const phrase = normaliseClaim(c.phrase);
    const judged = (phraseVerified: Verdict, phraseVerifiedReason: string | null): AuditedCounterArgument => ({
      quote: c.quote,
      quoteVerified: quote !== '' && text.includes(quote),
      challenge: c.challenge,
      grounding: c.grounding,
      source: c.source,
      phrase: c.phrase,
      phraseVerified,
      phraseVerifiedReason,
    });

    if (phrase === '') {
      return judged(
        'UNCHECKED',
        'The critique attributes no phrase — the field is empty — so there is nothing to search for and no verdict was ' +
          'reached. An empty assertion is not a verified one.',
      );
    }
    if (normaliseClaim(c.source) === '') {
      return judged(
        'UNCHECKED',
        c.grounding === 'ABSENCE'
          ? 'An absence named in no record: there is no content to search, so the absence is stated and not checked.'
          : 'The critique grounds this in a record and names none, so there is no content to check the phrase against.',
      );
    }
    const ordinal = ordinalOf(c.source);
    const source = ordinal === null ? undefined : sources.get(ordinal);
    if (source === undefined) {
      return judged(
        'UNCHECKED',
        `The critique names ${c.source}, which is not one of the records or trajectories this call handed it, so there ` +
          'is no content to check the phrase against. The assertion stands unverified rather than unreported.',
      );
    }
    if ('unresolved' in source) return judged('UNCHECKED', source.unresolved);
    // An ABSENCE is checked by the SAME rule and recorded as it falls: a claimed absence that verdicts PRESENT is
    // shown contradicted, never corrected.
    return judged(verdictInAny(c.phrase, source.texts), null);
  });

  const onTheList = new Map(input.gaps.map((g) => [g.gapId, g.readsAs]));
  const suggestedGaps = input.critique.suggestedGaps.map((g): AuditedSuggestedGap => {
    if (normaliseClaim(g.description) === '') {
      return {
        ...g,
        gapId: null,
        gapIdReason: 'The suggestion has no description, and a gap is identified by its description — it names no gap.',
        onTheList: null,
      };
    }
    const id = gapId(g.description);
    return { ...g, gapId: id, gapIdReason: null, onTheList: onTheList.get(id) ?? null };
  });

  return {
    counterArguments,
    suggestedGaps,
    alternativeReadings: [...input.critique.alternativeReadings],
    strength: { ...input.critique.strength, by: 'the critic' },
  };
}
