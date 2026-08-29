import { textLostByRewrite } from '../src/lib/chunkRewriteLoss';

// ---------------------------------------------------------------------------
// THE GUARD ON A CHUNK REWRITE — the one property whose failure is
// unrecoverable.
//
// Applying a re-diff rewrites rawDeletedText/rawAddedText in place, so stored
// text with no counterpart is gone. The rule permits exactly one kind of
// disappearance and forbids every other:
//
//   a sentence of a stored chunk may disappear ONLY IF it is present in BOTH
//   captures — that is, only if it never changed.
//
// THESE TESTS EXIST BECAUSE A MUTATION SURVIVED. Changing the rule's `&&` to
// `||` — permitting a drop when the sentence is in EITHER capture — passed the
// whole integration suite. That mutation licenses discarding a genuinely
// removed sentence, which is the precise failure the guard was written for, and
// no fixture reaching the guard through `planRediff` could distinguish it:
// under v3 a real removal is always carried into the recomputation, so the
// dangerous branch is unreachable from the corpus and only reachable here.
// ---------------------------------------------------------------------------

const LONG_UNCHANGED = 'The common ones are local pain, fever, headache and chills.';
const LONG_REMOVED = 'Israeli citizens aged six months and over may be vaccinated.';

describe('what a rewrite may drop', () => {
  it('permits dropping a sentence present in BOTH captures — the rider', () => {
    // It never changed, so claiming it was removed was the defect. Narrowing the
    // claim to exclude it is the whole point of v3-sentence-claims.
    const lost = textLostByRewrite(
      [`Something changed. ${LONG_UNCHANGED}`],
      ['Something changed.'],
      'deleted',
      `Something changed. ${LONG_UNCHANGED}`,
      `Something else now. ${LONG_UNCHANGED}`,
    );

    expect(lost).toEqual([]);
  });

  it('REFUSES dropping a sentence present only in the BEFORE capture', () => {
    // A genuine removal. Narrowing it away would delete the finding — and this
    // is the exact case the surviving `&&` -> `||` mutation licensed.
    const lost = textLostByRewrite(
      [`Something changed. ${LONG_REMOVED}`],
      ['Something changed.'],
      'deleted',
      `Something changed. ${LONG_REMOVED}`,
      'Something else now.',
    );

    expect(lost).toHaveLength(1);
    expect(lost[0]).toEqual({ side: 'deleted', text: LONG_REMOVED });
  });

  it('REFUSES dropping a sentence present only in the AFTER capture', () => {
    // The mirror case, on the added side. Asserted separately because a rule
    // written with one side in mind is a rule that is right half the time.
    const lost = textLostByRewrite(
      [`Something changed. ${LONG_REMOVED}`],
      ['Something changed.'],
      'added',
      'Something else now.',
      `Something changed. ${LONG_REMOVED}`,
    );

    expect(lost).toHaveLength(1);
    expect(lost[0].side).toBe('added');
  });

  it('REFUSES dropping a sentence present in NEITHER capture', () => {
    // Stored text that reproduces from nothing is a worse problem than a lost
    // claim, and it must not be silently discarded on the way past.
    const lost = textLostByRewrite(
      [LONG_REMOVED],
      [],
      'deleted',
      'Nothing like it here.',
      'Nor here.',
    );

    expect(lost).toHaveLength(1);
  });
});

describe('what counts as carried', () => {
  it('a sentence still claimed by any recomputed chunk is not lost', () => {
    const lost = textLostByRewrite([LONG_REMOVED], [LONG_REMOVED], 'deleted', '', '');

    expect(lost).toEqual([]);
  });

  it('a sentence carried INSIDE a larger recomputed chunk is not lost', () => {
    // The recomputation may widen as well as narrow — a region whose neighbours
    // also changed merges. Substring containment, not equality, is what makes
    // that a non-event rather than a refusal.
    const lost = textLostByRewrite(
      [LONG_REMOVED],
      [`Preamble. ${LONG_REMOVED} Epilogue.`],
      'deleted',
      '',
      '',
    );

    expect(lost).toEqual([]);
  });

  it('re-wrapping is not loss', () => {
    // The stored chunk survived a JSON round-trip. A whitespace difference must
    // not report text as destroyed that is merely laid out differently.
    const lost = textLostByRewrite(
      ['The  common ones\nare local pain, fever, headache and chills.'],
      ['The common ones are local pain, fever, headache and chills.'],
      'deleted',
      '',
      '',
    );

    expect(lost).toEqual([]);
  });

  it('an empty stored record loses nothing', () => {
    expect(textLostByRewrite([], [], 'deleted', 'a', 'b')).toEqual([]);
  });
});
