import { diffChunkPair, DIFF_INPUT_VERSION } from '../src/lib/diffChunking';
import { checkDiffSurvival } from '../src/lib/diffSurvival';
import { sentencesOf } from '../src/lib/textSegments';

// ---------------------------------------------------------------------------
// SENTENCE-GRANULAR CLAIMS — the rider fix.
//
// `htmlToText` puts newlines at block boundaries, so a "line" is a paragraph.
// A four-word edit therefore re-emitted its whole paragraph as REMOVED, and
// every unchanged sentence inside it was stored inside a removal claim. On the
// real corpus that produced 12 of 31 contradicted excerpts on staging and 10 of
// 14 on production.
//
// The fix makes the CLAIM true. It must never be mistaken for a change to what
// Level 5 checks — see the last block.
// ---------------------------------------------------------------------------

/** The exact defect, reduced: one paragraph, one sentence edited. */
const BEFORE_PARA =
  'Side effects usually appear a day or two after the vaccine. ' +
  'The common ones are local pain, fever, headache and chills.';
const AFTER_PARA =
  'Side effects usually appear a day or two after the corona vaccine. ' +
  'The common ones are local pain, fever, headache and chills.';

describe('an edited paragraph claims only the sentence that changed', () => {
  it('does not carry the unchanged sentence inside the removal', () => {
    const { removed, added } = diffChunkPair(BEFORE_PARA, AFTER_PARA);

    const unchanged = 'The common ones are local pain, fever, headache and chills.';
    expect(removed.some((c) => c.includes(unchanged))).toBe(false);
    expect(added.some((c) => c.includes(unchanged))).toBe(false);
  });

  it('still reports the sentence that DID change, on both sides', () => {
    // VACUITY GUARD. Emitting nothing would satisfy the assertion above while
    // losing the edit entirely — the failure mode that matters most here.
    const { removed, added } = diffChunkPair(BEFORE_PARA, AFTER_PARA);

    expect(removed).toEqual(['Side effects usually appear a day or two after the vaccine.']);
    expect(added).toEqual(['Side effects usually appear a day or two after the corona vaccine.']);
  });

  it('turns the contradiction it caused into a pass', () => {
    // The end-to-end property, stated as the corpus states it.
    const { removed, added } = diffChunkPair(BEFORE_PARA, AFTER_PARA);
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify(removed),
      rawAddedText: JSON.stringify(added),
      beforeText: BEFORE_PARA,
      afterText: AFTER_PARA,
      beforeVersion: 'v',
      afterVersion: 'v',
    });

    expect(result.verdict).toBe('SURVIVES');
    expect(result.contradicted).toEqual([]);
  });

  it('the OLD block-granular claim would have been contradicted', () => {
    // Pins the defect this change removes. Without this the test above proves
    // only that the new pipeline passes, not that the old one failed — and a
    // fix whose "before" is untested can be a fix for nothing.
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([BEFORE_PARA]),
      rawAddedText: JSON.stringify([AFTER_PARA]),
      beforeText: BEFORE_PARA,
      afterText: AFTER_PARA,
      beforeVersion: 'v',
      afterVersion: 'v',
    });

    expect(result.verdict).toBe('CONTRADICTED');
  });
});

describe('a one-sided region is left whole', () => {
  const before = 'Kept paragraph.\nDeleted paragraph. With two sentences.\nAlso kept.';
  const after = 'Kept paragraph.\nAlso kept.';

  it('a pure deletion is reported as the paragraph, not as its sentences', () => {
    // There is no counterpart for anything to ride along in, so refining would
    // fragment a genuinely deleted paragraph for no gain. Scoping the change to
    // the pattern that was measured is what keeps it safe if the diagnosis is
    // wrong.
    const { removed, added } = diffChunkPair(before, after);

    expect(removed).toEqual(['Deleted paragraph. With two sentences.']);
    expect(added).toEqual([]);
  });

  it('a pure insertion likewise', () => {
    const { removed, added } = diffChunkPair(after, before);

    expect(added).toEqual(['Deleted paragraph. With two sentences.']);
    expect(removed).toEqual([]);
  });
});

describe('nothing is dropped', () => {
  it('every changed sentence appears in the output', () => {
    // The no-cap-no-unexamined-tail rule, which the 8-chunk truncation
    // established and which this function is now the place to violate.
    const before = 'A one.\nB two.\nC three.\nD four.';
    const after = 'A one changed.\nB two.\nC three changed.\nD four changed.';
    const { removed, added } = diffChunkPair(before, after);

    expect(removed).toContain('A one.');
    expect(removed).toContain('C three.');
    expect(removed).toContain('D four.');
    expect(added).toContain('A one changed.');
    expect(added).toContain('C three changed.');
    expect(added).toContain('D four changed.');
    // B was not touched and is claimed on neither side.
    expect([...removed, ...added].some((c) => c === 'B two.')).toBe(false);
  });

  it('an unchanged document produces no claim at all', () => {
    expect(diffChunkPair(BEFORE_PARA, BEFORE_PARA)).toEqual({ removed: [], added: [] });
  });

  it('every emitted chunk is a substring of the side it came from', () => {
    // A chunk that is not verbatim page text cannot be searched for in a
    // document, which is what Level 5 does with it and what a researcher does
    // by hand. Refinement must slice, never rewrite.
    const { removed, added } = diffChunkPair(BEFORE_PARA, AFTER_PARA);

    for (const chunk of removed) expect(BEFORE_PARA).toContain(chunk);
    for (const chunk of added) expect(AFTER_PARA).toContain(chunk);
  });
});

describe('the claim granularity and the check granularity are the same rule', () => {
  it('the differ splits sentences with the function the checker tests with', () => {
    // Stated as an equality rather than trusted to the import: if either side
    // ever re-implemented the split, the rider defect returns while every
    // version string stays exactly where it is.
    const paragraph = 'One. Two!\nThree? Four.';
    expect(sentencesOf(paragraph)).toEqual(['One.', 'Two!', 'Three?', 'Four.']);

    const { removed } = diffChunkPair(paragraph, 'One. Two!\nThree? Four changed.');
    expect(removed).toEqual(['Four.']);
  });

  it('DIFF_INPUT_VERSION names the rule that produced these chunks', () => {
    // The cascade key. A chunk set computed under one rule and stamped with
    // another is the two-paths-one-version-string defect, and it is what made a
    // 40-character floor invisible across two classification paths.
    expect(DIFF_INPUT_VERSION).toBe('v3-sentence-claims');
  });
});
