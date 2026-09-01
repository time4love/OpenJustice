// ---------------------------------------------------------------------------
// TIMELINE-STRATIFIED SAMPLING — the decided half of the next-capture policy.
//
// `docs/gf-factual-layer-rebuild-dev-plan.md`, Level 4:
//
//   "The sample must be TIMELINE-STRATIFIED, not the first N captures. The first
//    captures are consecutive and from the page's earliest era — possibly a
//    template that no longer exists, possibly predating the site's advertising
//    entirely. Spreading the sample across the whole history costs the same
//    number of pages to look at, and surfaces the redesigns, which is itself
//    something to know before scanning."
//
// THE ADAPTIVE HALF IS OPEN AND IS NOT BUILT HERE. The plan wants the selector
// to reach for captures likely to DISAGREE — other eras, other layouts, step
// changes in derived-text length — and names that as the same mechanism as the
// stopping indicator. It is listed as an open question, so this module does the
// part that is decided and nothing more. `RulesetObservation.derivedTextLength`
// exists to feed the rest when it is designed.
//
// STRATIFIED IS NOT RANDOM. Deliberately: a random sample cannot be reproduced,
// and a marking session that cannot be reproduced cannot be reviewed. Even
// spacing over the ordered history is deterministic — the same corpus always
// yields the same sample — which is the property every other instrument in this
// repository is held to.
// ---------------------------------------------------------------------------

/**
 * `count` items spread evenly across an ordered list, endpoints included.
 *
 * The input must already be in timeline order; this module deliberately does not
 * sort, because what "in order" means is the caller's — `capturedAt` is the one
 * key that works across provenances, and a sort hidden in here would silently
 * pick a different one.
 *
 * Returns everything, in order, when `count` meets or exceeds the population:
 * asking for more of the history than exists is not an error, it is a short
 * history.
 */
/**
 * How many captures a run puts in front of a researcher.
 *
 * DEFINED BESIDE THE SAMPLER, because two callers now need it: the browser's
 * capture list and the adaptive policy that picks the next one. A second
 * declaration would let the page and the tool disagree about what "the sample"
 * is, and the policy's whole job is to choose within it.
 */
export const CAPTURE_SAMPLE = 12;

export function stratifiedSample<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (count >= items.length) return [...items];

  // WHICH POSITIONS, then a filter — no indexed reads and no assertions.
  //
  // An earlier version read `items[i] as T`, which is the two-ratchets conflict:
  // `noUncheckedIndexedAccess` types the read `T | undefined`, and
  // `no-unnecessary-type-assertion` then calls the cast that repairs it
  // pointless. Choosing positions first sidesteps both — `filter` yields `T[]`
  // by construction — and the Set absorbs the rounding collisions that made a
  // de-duplication step necessary before.
  const wanted = new Set<number>();
  if (count === 1) {
    // The MIDDLE, not the first. The first capture is the earliest era, which is
    // exactly the bias this module exists to remove.
    wanted.add(Math.floor((items.length - 1) / 2));
  } else {
    for (let i = 0; i < count; i += 1) {
      // Endpoints included: the oldest and newest captures are where a redesign
      // shows up, and a sample that never looks at either can report "no
      // corrections" having tested nothing that could disagree.
      wanted.add(Math.round((i * (items.length - 1)) / (count - 1)));
    }
  }
  return items.filter((_, index) => wanted.has(index));
}
