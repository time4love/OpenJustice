import { type DiffItem } from '../services/ForensicAgent';

// ---------------------------------------------------------------------------
// How much of its input did a classification actually describe?
//
// MEASURED BY TEXT CONTAINMENT, NEVER BY COUNTS.
//
// An earlier attempt at this compared the number of items to the number of raw
// chunks and reported "33% undescribed" on a corpus that was 91% described. The
// classifier MERGES: it groups consecutive chunks into coherent passages, so item
// quotes run 244-1301 characters against chunks averaging ~120, and one item can
// legitimately cover ten chunks. Counting is not an approximation of coverage —
// it measures a different thing and gets the answer wrong in the direction that
// manufactures alarming findings.
//
// The question is only ever: does some item's exactQuote contain this chunk's
// text, or vice versa?
//
// WHY THIS IS DERIVED AND NOT STORED
//
// Coverage is a pure function of rawDeletedText/rawAddedText and
// deletedText/addedText, all four already persisted. Deriving it makes every
// historical row answerable immediately — including the ones classified long
// before this existed — where a stored column would need backfilling and would,
// until backfilled, assert full coverage for rows nobody had ever checked.
//
// Measured on staging: 244 of 290 chunks covered (84%), 91% of characters, with
// the shortfall concentrated in a single diff at 63%.
// ---------------------------------------------------------------------------

export interface UncoveredChunk {
  side: 'deleted' | 'added';
  text: string;
}

export interface DiffCoverage {
  chunkCount: number;
  coveredChunks: number;
  /** Chunks no item refers to — changes detected on the page and described nowhere. */
  uncoveredChunks: UncoveredChunk[];
  charCount: number;
  coveredChars: number;
  /** 0-1. 1 means every chunk is accounted for. */
  chunkRatio: number;
  charRatio: number;
  complete: boolean;
}

/** Whitespace-insensitive: a quote is copied, and copies pick up re-wrapping. */
function normalise(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * Whether `quote` accounts for `chunk`.
 *
 * Containment in BOTH directions, deliberately: an item quoting part of a long
 * chunk still describes it, and a merged item quoting several chunks contains
 * each of them. Requiring equality would flag the classifier's normal and correct
 * behaviour as a failure.
 */
function accountsFor(chunk: string, quote: string): boolean {
  const c = normalise(chunk);
  const q = normalise(quote);
  if (c.length === 0 || q.length === 0) return false;
  return c === q || q.includes(c) || c.includes(q);
}

export function computeDiffCoverage(input: {
  rawDeletedChunks: readonly string[];
  rawAddedChunks: readonly string[];
  deletedItems: readonly DiffItem[];
  addedItems: readonly DiffItem[];
}): DiffCoverage {
  const uncoveredChunks: UncoveredChunk[] = [];
  let chunkCount = 0;
  let coveredChunks = 0;
  let charCount = 0;
  let coveredChars = 0;

  // Sides are kept separate: a deletion described only by an addition item is not
  // covered. The two mean opposite things, and letting one satisfy the other
  // would hide exactly the case where a removal was recast as an edit.
  const check = (
    chunks: readonly string[],
    items: readonly DiffItem[],
    side: 'deleted' | 'added',
  ): void => {
    for (const chunk of chunks) {
      const n = normalise(chunk);
      if (n.length === 0) continue;
      chunkCount++;
      charCount += n.length;
      if (items.some((item) => accountsFor(chunk, item.exactQuote))) {
        coveredChunks++;
        coveredChars += n.length;
      } else {
        uncoveredChunks.push({ side, text: chunk });
      }
    }
  };

  check(input.rawDeletedChunks, input.deletedItems, 'deleted');
  check(input.rawAddedChunks, input.addedItems, 'added');

  return {
    chunkCount,
    coveredChunks,
    uncoveredChunks,
    charCount,
    coveredChars,
    chunkRatio: chunkCount === 0 ? 1 : coveredChunks / chunkCount,
    charRatio: charCount === 0 ? 1 : coveredChars / charCount,
    complete: uncoveredChunks.length === 0,
  };
}
