// ---------------------------------------------------------------------------
// THE RECORD'S OWN TYPES — docs/gf-ui-flows.md §26 clause (1) (2026-09-19): the thesis pane and the corpus
// sheet render ONE domain object, the record's BYTES, inside two different context objects.
//
// WHY THIS MODULE EXISTS AT ALL, rather than the union being spelled where it is used. It was spelled in
// THREE places by the end of this chunk's first draft — `types/corpus.ts`, `types/thesis.ts` and the
// component — which is this repository's dominant defect shape ("one rule, many implementations"): the
// spelling that drifts is the one nothing reads. `types/corpus.ts` :101 had it right and `types/thesis.ts`
// had `string`, and the disagreement between those two IS the defect this chunk repairs.
//
// IT IS PURE AND STAYS PURE (the researcher, 2026-09-11): types only, no import, no runtime value — so the
// component may import it and it can never import the component.
// ---------------------------------------------------------------------------

/**
 * The two sides the walk writes, and the ONE spelling of them.
 *
 * THE VALUES ARE THE BACKEND'S, NOT A DISPLAY CHOICE: `recordDiff.ts`' `ContentChunk` declares
 * `side: 'REMOVED' | 'ADDED'` and its two constructors emit exactly those. A reader is shown „לפני" /
 * „אחרי", and that mapping belongs to `components/record/RecordContent.tsx` and to nothing else.
 */
export type ChunkSide = 'REMOVED' | 'ADDED';

/** One chunk of a diff's content, as every surface holds it. */
export interface RecordChunk {
  side: ChunkSide;
  text: string;
}

/**
 * A record's content AS A VALUE (§26 clause (1)) — never a promise, a fetch, or a flag a component reads.
 * Each surface decides which of the four it holds; `RecordContent` only draws them.
 *
 * LOADING IS A SKELETON AND CARRIES NO TEXT — A2 :1144, "skeleton in the page's own order". A sentence
 * there would be copy, and copy lands approved or not at all.
 *
 * AWAITING CARRIES ITS STATEMENT FROM THE SURFACE, deliberately: the approved sentence already exists as
 * `corpus.awaitingDerivation` („ההפרש טרם חושב"), and minting a second key would put ONE approved sentence
 * behind TWO keys — the orphaned-copy defect, waiting to drift apart.
 */
export type RecordContentValue =
  | { kind: 'CAPTURE'; text: string }
  | { kind: 'DIFF'; chunks: readonly RecordChunk[] }
  | { kind: 'LOADING' }
  | { kind: 'AWAITING'; statement: string };
