import { diffArrays, diffLines, type Change } from 'diff';
import { sentencesOf } from './textSegments';

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
export const DIFF_INPUT_VERSION = 'v3-sentence-claims';

/**
 * v3-sentence-claims: a changed region whose two sides are BOTH non-empty is
 * refined to sentence granularity, so a chunk stored as REMOVED contains only
 * text that was actually removed.
 *
 * WHY, MEASURED. `htmlToText` inserts newlines at block boundaries so that a
 * "line" is a paragraph — a deliberate design, and the reason the chunks a
 * researcher reads are legible units rather than fragments. The cost was that a
 * four-word edit re-emitted its whole paragraph as removed, carrying every
 * unchanged sentence in it along inside the claim. On staging that produced 12
 * of 31 contradicted excerpts; on production 10 of 14.
 *
 * WORD GRANULARITY WAS REJECTED. The chunk is not an internal intermediate: it
 * is what the classifier reads and what the forensic timeline displays. Diffing
 * words would fix the rider and leave unreadable fragments in the evidentiary
 * record, which trades a false claim for an illegible one. The sentence is the
 * smallest unit that is both a true claim and a legible one — and it is the
 * unit Level 5 already tests at, which is the whole point.
 *
 * A REGION WITH ONLY ONE SIDE IS LEFT ALONE. A pure insertion or deletion has no
 * counterpart for anything to ride along in, so refining it would fragment a
 * genuinely-deleted paragraph into sentences for no gain. Scoping the change to
 * exactly the pattern that was measured is what keeps it safe if the diagnosis
 * is wrong.
 */

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

/**
 * THE ONE PLACE A DIFF IS COMPUTED.
 *
 * `diffLines` had THREE call sites — two in `rediffFromSnapshots`, one in
 * `WaybackScraper` — each pairing it with its own `groupDiffChunks` calls. One
 * rule, three implementations, is this repository's dominant defect shape, and
 * here it has a specific edge: a fourth call site added later would keep the OLD
 * granularity while stamping the NEW `DIFF_INPUT_VERSION`, which is precisely
 * the two-paths-one-version-string defect already on the record.
 *
 * Enforced by a source scan rather than by this comment: `diffLines` may be
 * imported in this file and nowhere else. See test/diffSingleDiffer.test.ts.
 */
export interface DiffChunks {
  removed: string[];
  added: string[];
}

/**
 * A maximal run of non-common parts, with its two sides paired.
 *
 * PAIRING IS THE POINT. `groupDiffChunks` walks each side independently, so it
 * can say "these lines were removed" and "these were added" but never "these two
 * are the same edit". Refinement needs the pair: the unchanged sentence rides
 * along inside a region, and only the region's own counterpart can show that it
 * survived.
 */
interface ChangedRegion {
  removed: string;
  added: string;
}

function changedRegions(raw: readonly Change[]): ChangedRegion[] {
  const regions: ChangedRegion[] = [];
  let removed = '';
  let added = '';

  // ITERATED, NOT INDEXED. The first draft walked `raw[index]` with a nested
  // while loop and the noUncheckedIndexedAccess ratchet refused it — correctly:
  // without that flag the element type lies about being defined, so every such
  // access is an unchecked assumption the compiler cannot see. Accumulating
  // across a for..of and flushing on the first common part expresses the same
  // grouping with no index to get wrong.
  const flush = (): void => {
    const r = removed.trim();
    const a = added.trim();
    if (r.length > 0 || a.length > 0) regions.push({ removed: r, added: a });
    removed = '';
    added = '';
  };

  for (const part of raw) {
    if (part.added) added += part.value;
    else if (part.removed) removed += part.value;
    else flush();
  }
  flush();

  return regions;
}

/**
 * Compute a diff and return its chunks, claimed at sentence granularity.
 *
 * NOTHING IS DROPPED. Every changed region contributes; refinement only decides
 * how finely a region is described, never whether it is described. The
 * no-cap-no-unexamined-tail rule the 8-chunk truncation established still holds,
 * and this function is where it would be violated if anyone tried again.
 */
export function diffChunkPair(before: string, after: string): DiffChunks {
  const removed: string[] = [];
  const added: string[] = [];

  for (const region of changedRegions(diffLines(before, after, { ignoreWhitespace: true }))) {
    // One-sided region: a genuine insertion or deletion. Kept whole, because
    // there is no counterpart for an unchanged sentence to have ridden in on,
    // and a deleted paragraph reads better than its sentences listed apart.
    if (region.removed.length === 0 || region.added.length === 0) {
      if (region.removed.length > 0) removed.push(region.removed);
      if (region.added.length > 0) added.push(region.added);
      continue;
    }

    // Two-sided region: an EDIT. Describe only the sentences that differ.
    //
    // diffArrays over sentence lists rather than a second character diff: it
    // aligns whole sentences, so an unchanged one is common on both sides and
    // is emitted on neither. That is the rider, removed at its source.
    const parts = diffArrays(sentencesOf(region.removed), sentencesOf(region.added));
    for (const part of parts) {
      if (part.removed) removed.push(...part.value);
      else if (part.added) added.push(...part.value);
    }
  }

  return { removed, added };
}
