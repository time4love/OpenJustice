/**
 * ONE DEFINITION OF "A SENTENCE", FOR THE DIFFER AND THE CHECKER ALIKE.
 *
 * WHY THIS FILE EXISTS, and it is the whole of Level 4's rider fix in one
 * sentence: **a change must be CLAIMED at the granularity it is CHECKED at.**
 *
 * The pipeline claimed at block granularity and Level 5 tested at sentence
 * granularity. `htmlToText` deliberately inserts newlines at block boundaries so
 * a "line" is a paragraph, so `diffLines` re-emits a whole paragraph when four
 * words inside it change — and every unchanged sentence in that paragraph rides
 * along inside a chunk stored as REMOVED. Level 5 then segments the chunk into
 * sentences, finds one of them in the after document, and reports a
 * contradiction.
 *
 * IT IS RIGHT TO. The stored artifact asserts to a researcher that a
 * 155-character paragraph was removed when four words were edited, and the
 * unchanged sentence inside it was not removed at all. That is real
 * over-reporting about the one page this investigation rests on, measured at 12
 * of 31 contradicted excerpts on staging and 10 of 14 on production.
 *
 * SO THE FIX IS TO MAKE THE CLAIM TRUE, NEVER TO COARSEN THE CHECK. Widening
 * Level 5 back to whole-chunk matching would drive the number to zero while the
 * record kept saying a paragraph was deleted. That is silencing the detector
 * rather than the defect, and it would look like progress.
 *
 * Both sides now import from here, so the two granularities cannot drift apart
 * again — which is the same one-rule-one-implementation discipline that holds
 * the diff writer and the on-chain verdict.
 */

/**
 * Split text into sentences.
 *
 * Newlines end a sentence as surely as a full stop: `htmlToText` puts block
 * boundaries there, and a heading with no terminal punctuation is a unit in its
 * own right rather than a prefix of the paragraph beneath it.
 *
 * The lookbehind keeps the terminator attached to the sentence it ends, so a
 * sentence extracted here is a substring of the source and can be searched for
 * verbatim in a document — which is exactly what Level 5 does with it.
 */
export function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
