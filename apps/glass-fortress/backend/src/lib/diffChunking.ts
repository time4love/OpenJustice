import type { Change } from 'diff';

// Pure text-processing helpers over a line-diff result. Deliberately dependency-free
// (no jsdom/readability/axios, unlike WaybackScraper.ts) so they — and the tests
// that exercise them against real snapshot fixtures — never need to mock the DOM
// or HTTP stack just to import a function.

// ---------------------------------------------------------------------------
// WHAT USED TO BE HERE, AND WHY IT IS GONE
//
//   const MIN_CHUNK_LENGTH = 40;     // chunks shorter than this were never sent
//   const MAX_CHUNKS_PER_SIDE = 8;   // only the 8 LONGEST chunks were kept
//
// Both were cost/noise controls. Neither carried a justification, and measured
// against the corpus they govern, both were wrong in the same direction.
//
// The cap was the severe one, because it applied to STORAGE, not just to what
// the model was shown. Recomputed from the stored snapshots (all 83 verified
// against their contentHash, which is itself anchored on-chain):
//
//     chunks that truly existed across 81 diffs   290
//     chunks stored                               131
//     discarded before ever being written         159   (55%)
//
// The cap bit on exactly six diffs, and those six are exactly the six the
// classifier judged significant — so every promoted evidence record in the
// vault was derived from a diff that kept under a third of what changed. Two of
// them had 34 changes per side and kept 8.
//
// The floor cost less (19 stored chunks were never sent to any model) but had
// the sharper edge: the deletion of the adverse-event reporting link,
// "לדיווח על תופעות לוואי >", is 24 characters. It was stored and never shown to
// a classifier, which is why one environment called that diff routine while
// another — reached through the reclassify path, which never applied the floor —
// called it materially significant. Same commit, same prompt, same page.
//
// BOTH SORTED AGAINST THE SAME CLASS OF CHANGE. Truncation took the shortest
// chunks because the list was sorted longest-first; the floor then refused the
// short ones that survived. A short structural deletion — a link, a caveat, a
// reporting channel, a contraindication — had to clear both, and mostly did not.
// For an archive whose subject is what a ministry quietly removed, that is the
// exact opposite of the bias you want.
//
// The sort is gone with the cap. Ordering longest-first existed only to decide
// what to keep; with nothing discarded it destroys document order, which is
// itself evidence — WHERE on the page a change happened is information a
// researcher reads.
// ---------------------------------------------------------------------------

/**
 * Provenance for the input rule, stored on every diff as `diffInputVersion`.
 *
 * Separate from CLASSIFIER_VERSION and SUMMARY_VERSION on purpose. The prompt did
 * not change when this rule did — classifierPromptHash is byte-identical across
 * the change — so the hash that exists to prove provenance is blind to it. Three
 * things move independently: what the model is asked, what it is fed, and how its
 * prose is written. One version string covering them would have to lie about two.
 *
 * v2-uncapped: every detected chunk is stored, in document order, and every stored
 * chunk is classified.
 *
 * v1 is unnamed and recorded as null, because it was never declared — rows written
 * under it kept at most 8 chunks per side, chose them longest-first, discarded the
 * rest BEFORE the write, and then classified only those ≥ 40 characters. Such rows
 * are understated at the storage layer and cannot be corrected by reclassification;
 * the diff has to be recomputed from its snapshots.
 */
export const DIFF_INPUT_VERSION = 'v2-uncapped';

/**
 * Group consecutive diff changes of the same type into single string chunks.
 *
 * Returns EVERY non-empty chunk, in document order. Nothing is dropped: a change
 * detected on the page is a change that gets persisted, because the record is
 * the product and losing part of it at write time is not recoverable from the
 * database afterwards — the evidence of the truncation is itself truncated.
 */
export function groupDiffChunks(raw: Change[], type: 'added' | 'removed'): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const part of raw) {
    const isMatch = type === 'added' ? part.added : part.removed;
    if (isMatch) {
      current += part.value;
    } else {
      const trimmed = current.trim();
      if (trimmed.length > 0) chunks.push(trimmed);
      current = '';
    }
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) chunks.push(trimmed);

  return chunks;
}

/**
 * The chunks a classification is performed over.
 *
 * THE POINT OF THIS FUNCTION IS THAT THERE IS EXACTLY ONE OF IT.
 *
 * Two code paths classify a diff — a scan (WaybackScraper) and a reclassification
 * (reclassifyDiffs) — and they are supposed to be able to reproduce each other.
 * They could not: the scan applied a 40-character floor and reclassification
 * applied nothing, because the floor lived in a module-private constant that the
 * second path could not see. A constant only one of two call sites can honour is
 * not a shared rule, it is a local convention, and the divergence it produced was
 * invisible in the data: both paths stamped the same classifierVersion.
 *
 * So selection is a named, exported step that both paths call, and
 * `mcpToolClassification`-style tests assert neither path reaches the agent
 * without it. If a future bound is ever justified, it goes HERE and applies to
 * both, or it does not exist.
 *
 * Today the rule is: everything that is not blank. Blank-only chunks are excluded
 * because they are an artifact of grouping, not a change to the page — there is
 * nothing for a classifier to say about them.
 */
export function classifierInputChunks(chunks: readonly string[]): string[] {
  return chunks.filter((c) => c.trim().length > 0);
}
