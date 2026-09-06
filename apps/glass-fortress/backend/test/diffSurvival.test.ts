import {
  checkDiffSurvival,
  survivalSourceStateHash,
  PRESENCE_FLOOR_CHARS,
} from '../src/lib/diffSurvival';

// The checker, and only the checker. Its one write-time caller — the diff
// writer of docs/gf-evidence-flows.md A2, which judges every chunk of a content
// version through it — is asserted in test/recordDiff.test.ts; the groups that
// asserted the retired writer's survival COLUMNS on the pair went with those
// columns' writer at refactor step 5 (plan §4, rule 1).

const V2 = 'v2-inflate-decode-htmltotext-normalised';

/** Long enough to clear the presence floor, so a match is a finding not a coincidence. */
const SENTENCE =
  'The Ministry stated that side effects are mild and temporary in all reported cases.';

// ---------------------------------------------------------------------------
// THE INVARIANT ITSELF
// ---------------------------------------------------------------------------
describe('a reported change must survive the documents', () => {
  it('SURVIVES when a removed chunk is genuinely absent from the after document', () => {
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
      beforeText: `intro\n${SENTENCE}\noutro`,
      afterText: 'intro\noutro',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('SURVIVES');
    expect(result.chunksChecked).toBe(1);
  });

  it('CONTRADICTED when a chunk said to be REMOVED is still in the after document', () => {
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
      beforeText: `intro\n${SENTENCE}`,
      afterText: `intro\n${SENTENCE}`,
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('CONTRADICTED');
    expect(result.contradicted[0]?.side).toBe('REMOVED');
  });

  it('CONTRADICTED when a chunk said to be ADDED was already in the before document', () => {
    const result = checkDiffSurvival({
      rawDeletedText: '[]',
      rawAddedText: JSON.stringify([SENTENCE]),
      beforeText: `intro\n${SENTENCE}`,
      afterText: `intro\n${SENTENCE}`,
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('CONTRADICTED');
    expect(result.contradicted[0]?.side).toBe('ADDED');
  });

  it('checks at SENTENCE granularity, not only whole chunks', () => {
    // GRANULARITY IS NOT A DETAIL: whole-chunk matching found 2 contradictions of
    // 81 and missed the case this work exists for; sentence granularity found 7.
    // Here the chunk as a whole is absent from the after document, but one
    // sentence inside it survives — which whole-chunk matching would call SURVIVES.
    const chunk = `${SENTENCE} A second sentence that really was removed entirely.`;
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([chunk]),
      rawAddedText: '[]',
      beforeText: chunk,
      afterText: `intro\n${SENTENCE}`,
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('CONTRADICTED');
  });

  it('ignores fragments below the presence floor, which match by accident', () => {
    const short = 'yes';
    expect(short.length).toBeLessThan(PRESENCE_FLOOR_CHARS); // vacuity guard
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([short]),
      rawAddedText: '[]',
      beforeText: short,
      afterText: 'yes it is still here somewhere',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('SURVIVES');
  });
});

// ---------------------------------------------------------------------------
// UNCHECKABLE IS A VERDICT ABOUT THE CHECK
// ---------------------------------------------------------------------------
describe('mixed extraction versions are UNCHECKABLE, not passed or failed', () => {
  it('refuses to compare text produced by different rules', () => {
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
      beforeText: SENTENCE,
      afterText: SENTENCE,
      beforeVersion: 'v1-htmltotext-normalised',
      afterVersion: V2,
    });
    // Under a single version this would be CONTRADICTED. It is not reported as
    // one, because the two sides were never comparable — and it is not reported
    // as SURVIVES either, which is the failure §3 exists to prevent.
    expect(result.verdict).toBe('UNCHECKABLE');
    expect(result.reason).toContain('different rules');
    expect(result.contradicted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE COMMITMENT'S FRAMING
// ---------------------------------------------------------------------------
describe('survivalSourceStateHash', () => {
  it('cannot be spoofed by moving content across the separator', () => {
    // Every component is hashed to fixed-length hex before being joined, so no
    // payload can contain the delimiter and shift the framing — two different
    // input sets cannot collide by rearranging where one value ends.
    const a = survivalSourceStateHash({
      beforeTextHash: 'aa',
      afterTextHash: 'bb',
      rawDeletedText: 'x|y',
      rawAddedText: 'z',
    });
    const b = survivalSourceStateHash({
      beforeTextHash: 'aa',
      afterTextHash: 'bb',
      rawDeletedText: 'x',
      rawAddedText: 'y|z',
    });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// A CHECK THAT INSPECTED NOTHING DID NOT PASS
//
// Found by a real scan, not by a mutation: 20 of 22 rtmag diffs reported zero
// chunks and every one of them read SURVIVES, so the audit claimed 20
// verifications that never happened.
// ---------------------------------------------------------------------------
describe('zero chunks checked is UNCHECKABLE, never SURVIVES', () => {
  it('refuses to call an empty diff a pass', () => {
    const result = checkDiffSurvival({
      rawDeletedText: '[]',
      rawAddedText: '[]',
      beforeText: 'a page that did not change',
      afterText: 'a page that did not change',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('UNCHECKABLE');
    expect(result.chunksChecked).toBe(0);
    expect(result.reason).toContain('nothing to check');
  });

  it('says WHY, and not the mixed-versions reason', () => {
    // Two causes reach UNCHECKABLE and they are not interchangeable. Asserting
    // the wrong one would tell a legitimate no-change diff it was extracted
    // under incomparable rules.
    const result = checkDiffSurvival({
      rawDeletedText: '[]',
      rawAddedText: '[]',
      beforeText: 'x',
      afterText: 'x',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.reason).not.toContain('different rules');
  });

  it('still reaches SURVIVES when something WAS examined', () => {
    // Vacuity guard: if everything were UNCHECKABLE the tests above would pass
    // while proving nothing about the count.
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
      beforeText: `intro\n${SENTENCE}`,
      afterText: 'intro',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('SURVIVES');
    expect(result.chunksChecked).toBe(1);
  });

  it('malformed chunk JSON is UNCHECKABLE too, not a pass', () => {
    // parseChunks returns [] for unparseable input, which used to mean a row
    // with a corrupt payload reported SURVIVES.
    const result = checkDiffSurvival({
      rawDeletedText: 'not json at all',
      rawAddedText: '[]',
      beforeText: 'x',
      afterText: 'y',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('UNCHECKABLE');
  });
});
