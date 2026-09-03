import { classifierInputChunks, diffChunkPair } from '../../src/lib/diffChunking';
import { gate5, type Classify } from '../../src/walk/gates';

// ---------------------------------------------------------------------------
// GATE 5 — THE CLASSIFIER CALLED THE DIFF NOT EDITORIAL. A4 of the flows
// appendix, as amended 2026-09-02:
//
//     GATE 5   classify(diff(text(p), text(c))).editorial = false
//              — evaluated LAST, only if 0–4 quiet, only on a NOVEL capture
//
// THE OTHER DIRECTION OF THE BLIND SPOT. New furniture the rules have never met
// enters `text`, so the capture is NOVEL and its diff against the predecessor
// is classified — the paid call this level counts, and it was going to be made
// on that diff anyway. A not-editorial verdict is that pollution's symptom, at
// no extra spend. The model calls a human; it never rules.
//
// RULED 2026-09-02, after this suite found the gap: the reused classifier
// answered significance and categories and NOT "is this editorial?". Its output
// gains `editorial: boolean`, asked in the same call, with CLASSIFIER_VERSION
// and the prompt hash moving. This file does not depend on how that answer is
// obtained: the gate takes the classifier as an INJECTED function returning
// `{ editorial, reason }`, and building it from `analyzeChange` is the walk's.
//
// THE DIFF IS INLINE, ALWAYS. A stop holds an unstored capture and the diff
// row is written at acquisition, so at a stop there is no id to carry.
//
// RED until step 4 builds `src/walk/gates`.
// ---------------------------------------------------------------------------

const BEFORE = 'headline\nfirst paragraph of the article\nsecond paragraph';
const AFTER = 'headline\nfirst paragraph of the article\nsecond paragraph\nread more: ten stories\nlike · share';

/** The chunks the reused chunking produces for the fixture pair. */
const expectedDiff = (() => {
  const chunks = diffChunkPair(BEFORE, AFTER);
  return { removed: classifierInputChunks(chunks.removed), added: classifierInputChunks(chunks.added) };
})();

const answering = (editorial: boolean, reason = 'fixture reason'): jest.MockedFunction<Classify> =>
  jest.fn(async () => ({ editorial, reason }));

describe('Gate 5 — the classifier judged the diff against the predecessor not editorial', () => {
  it('fires when the classifier says the change is not editorial, carrying the diff, the verdict and the reason', async () => {
    const classify = answering(false, 'a sharing widget entered the text');
    await expect(gate5(BEFORE, AFTER, classify)).resolves.toEqual({
      gate: 5,
      material: { diff: expectedDiff, editorial: false, reason: 'a sharing widget entered the text' },
    });
  });

  it('quiet when the classifier says the change is editorial', async () => {
    await expect(gate5(BEFORE, AFTER, answering(true))).resolves.toBeNull();
  });

  // THE REUSED CHUNKING, NOT A RAW LINE DIFF. `diffChunkPair` pairs the two
  // sides so an unchanged sentence does not ride along as a removal, and
  // `classifierInputChunks` is the selection both classifying paths call. The
  // gate must hand the model exactly what Level 5 hands it.
  it('hands the classifier classifierInputChunks over diffChunkPair(text(p), text(c))', async () => {
    const classify = answering(true);
    await gate5(BEFORE, AFTER, classify);
    expect(classify).toHaveBeenCalledWith(expectedDiff);
  });

  it('calls the classifier exactly once — the one paid call', async () => {
    const classify = answering(false);
    await gate5(BEFORE, AFTER, classify);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  // A SWALLOWED REJECTION IS A DEAD CONTROL. A classifier that fails must halt
  // the walk loudly; a gate that read a failure as "quiet" would acquire a
  // capture under a verdict nobody gave.
  it('propagates the classifier’s rejection — never quiet, never swallowed', async () => {
    const classify: Classify = jest.fn(async () => {
      throw new Error('model unavailable');
    });
    await expect(gate5(BEFORE, AFTER, classify)).rejects.toThrow('model unavailable');
  });

  it('the material is exactly A5’s: { diff, editorial, reason }', async () => {
    const fired = await gate5(BEFORE, AFTER, answering(false));
    expect(Object.keys(fired?.material ?? {}).sort()).toEqual(['diff', 'editorial', 'reason']);
  });
});
