import { sentencesOf } from './textSegments';

/**
 * THE GUARD ON A CHUNK REWRITE — pure, so it can be tested exhaustively.
 *
 * Lives in `lib/` beside the other rules that decide what the corpus says
 * (`diffSurvival`, `textSegments`) rather than inside the service that applies
 * them. It is the single property whose failure is unrecoverable — applying a
 * re-diff rewrites `rawDeletedText` / `rawAddedText` in place, so text with no
 * counterpart is simply gone — and a rule that load-bearing should be reachable
 * without a database.
 */

/**
 * TEXT A REWRITE WOULD DESTROY — the guard, restated for a narrowing migration.
 *
 * The original rule was "every stored chunk must reappear verbatim", which was
 * exactly right for the truncation repair: that repair only ever GREW a record,
 * so any stored text missing from the recomputation meant the repair was also
 * losing something. Under `v3-sentence-claims` the premise no longer holds. A
 * stored block chunk is DELIBERATELY narrowed to the sentences that changed, so
 * verbatim reappearance is guaranteed to fail on precisely the rows the
 * migration exists to fix, and the guard would refuse all of them.
 *
 * Loosening it to "apply anyway" would be the dangerous move: this is the one
 * property whose failure is unrecoverable, because applying rewrites the chunk
 * payloads in place. So it is RESTATED rather than relaxed:
 *
 *   a sentence of a stored chunk may disappear ONLY IF it is present in BOTH
 *   captures — that is, only if it never changed.
 *
 * That permits exactly the rider (an unchanged sentence that rode along inside
 * an edited paragraph) and forbids everything else. A genuinely removed sentence
 * is absent from the after capture, so dropping it fails this check and the row
 * is refused.
 *
 * Compared on normalised text rather than identity: the stored chunk survived a
 * JSON round-trip, and a whitespace difference would report text as lost that is
 * merely re-wrapped.
 */
export interface LostText {
  side: 'deleted' | 'added';
  text: string;
}

export function textLostByRewrite(
  stored: readonly string[],
  recomputed: readonly string[],
  side: 'deleted' | 'added',
  beforeText: string,
  afterText: string,
): LostText[] {
  const carried = recomputed.map(normalise);
  const before = normalise(beforeText);
  const after = normalise(afterText);
  const lost: LostText[] = [];

  for (const chunk of stored) {
    for (const sentence of sentencesOf(chunk)) {
      const needle = normalise(sentence);
      if (needle.length === 0) continue;
      // Still claimed somewhere in the new payload.
      if (carried.some((c) => c.includes(needle))) continue;
      // Dropped. Legitimate ONLY if it never changed — present in both captures.
      if (before.includes(needle) && after.includes(needle)) continue;
      lost.push({ side, text: sentence });
    }
  }
  return lost;
}

/** Whitespace-insensitive comparison: a JSON round-trip must not read as loss. */
function normalise(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}
