import { diffChunkPair, classifierInputChunks, DIFF_INPUT_VERSION } from '../src/lib/diffChunking';

// ---------------------------------------------------------------------------
// The layer that decides WHAT PAGE CHANGES EXIST AT ALL.
//
// Everything above it — classification, evidence, trajectories, theses, on-chain
// anchoring — can only describe changes that survive this step. It previously
// discarded 159 of 290 detected changes (55%) before anything was written, and
// nothing failed, warned or counted.
//
// These tests exist to make that unrepeatable. See
// docs/gf-diff-truncation-dev-plan.md.
// ---------------------------------------------------------------------------

/**
 * A document whose every listed line is deleted, each separated by an unchanged
 * one so the deletions are distinct regions rather than a single run.
 *
 * REAL STRINGS, not hand-built `Change[]`. The old helper fabricated the
 * differ's output and handed it to the grouper, so it tested the grouping and
 * assumed the diffing. `diffChunkPair` owns both halves now — which is the point
 * of funnelling it — so the input has to be what the pipeline actually gets.
 */
function deletionOf(lines: string[]): { before: string; after: string } {
  const before = lines.flatMap((l) => [l, 'unchanged']).join('\n');
  const after = lines.map(() => 'unchanged').join('\n');
  return { before, after };
}

describe('diffChunkPair — nothing is discarded at write time', () => {
  it('returns every chunk when there are far more than the old cap of 8', () => {
    const lines = Array.from({ length: 34 }, (_, i) => `change number ${String(i)}`);

    const { before, after } = deletionOf(lines);
    const { removed } = diffChunkPair(before, after);

    // The real corpus had two diffs with exactly 34 changes per side that stored
    // 8. That is the case this asserts, at the size it actually happened.
    expect(removed).toHaveLength(34);
  });

  it('preserves DOCUMENT order, not longest-first', () => {
    const { before, after } = deletionOf([
      'short',
      'a considerably longer line of text here',
      'mid length line',
    ]);

    // Ordering by length existed only to choose what to keep. With nothing
    // discarded it would destroy where-on-the-page information, which a
    // researcher reads as evidence.
    expect(diffChunkPair(before, after).removed).toEqual([
      'short',
      'a considerably longer line of text here',
      'mid length line',
    ]);
  });

  it('keeps a short chunk that the old 40-character floor would have dropped', () => {
    // 24 characters. This exact deletion is why one environment called a diff
    // routine while another called it materially significant.
    const link = 'לדיווח על תופעות לוואי >';
    expect(link.length).toBeLessThan(40);

    const { before, after } = deletionOf([link]);
    expect(diffChunkPair(before, after).removed).toEqual([link]);
  });

  it('separates added from removed', () => {
    const { removed, added } = diffChunkPair('alpha\nbeta\n', 'alpha\ngamma\n');

    expect(removed).toEqual(['beta']);
    expect(added).toEqual(['gamma']);
  });

  it('drops nothing but genuinely empty chunks', () => {
    // A whitespace-only line carries no change to describe; a real one does.
    const { removed } = diffChunkPair('   \nkeep\nreal content\n', 'keep\n');

    expect(removed).toEqual(['real content']);
  });
});

describe('classifierInputChunks — one rule, shared', () => {
  it('passes every non-blank chunk through regardless of length', () => {
    const chunks = ['x', 'לדיווח על תופעות לוואי >', 'a'.repeat(500)];

    expect(classifierInputChunks(chunks)).toEqual(chunks);
  });

  it('excludes blank-only chunks, which are a grouping artifact', () => {
    expect(classifierInputChunks(['', '   ', '\n\t', 'real'])).toEqual(['real']);
  });

  it('is idempotent, so a path applying it twice cannot differ from one applying it once', () => {
    const once = classifierInputChunks(['a', ' ', 'b']);

    expect(classifierInputChunks(once)).toEqual(once);
  });

  it('does not reorder', () => {
    const chunks = ['zebra', 'a much longer chunk than the others by far', 'ant'];

    expect(classifierInputChunks(chunks)).toEqual(chunks);
  });
});

describe('DIFF_INPUT_VERSION', () => {
  it('is a non-empty string that names the current rule', () => {
    expect(DIFF_INPUT_VERSION).toBe('v3-sentence-claims');
  });

  it('is NOT the classifier version — three provenance axes move independently', () => {
    // Folding the input rule into classifierVersion would make that string mean
    // "the classifier, and sometimes also the input rule". classifierPromptHash
    // is byte-identical across an input-rule change and cannot see it.
    const { CLASSIFIER_VERSION, SUMMARY_VERSION } = jest.requireActual<{
      CLASSIFIER_VERSION: string;
      SUMMARY_VERSION: string;
    }>('../src/lib/classifierVersion');

    expect(DIFF_INPUT_VERSION).not.toBe(CLASSIFIER_VERSION);
    expect(DIFF_INPUT_VERSION).not.toBe(SUMMARY_VERSION);
  });
});

describe('model provenance', () => {
  const ORIGINAL = process.env['FORENSIC_PROVIDER'];
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env['FORENSIC_PROVIDER'];
    else process.env['FORENSIC_PROVIDER'] = ORIGINAL;
  });

  it('resolves a provider:model identity that differs per provider', () => {
    const { resolveModelId } = jest.requireActual<{ resolveModelId: (a: string) => string }>(
      '../src/factories/LLMFactory',
    );

    process.env['FORENSIC_PROVIDER'] = 'gemini';
    const gemini = resolveModelId('FORENSIC');
    process.env['FORENSIC_PROVIDER'] = 'anthropic';
    const anthropic = resolveModelId('FORENSIC');

    // The whole point: two runs of the SAME commit can produce different judges,
    // and nothing else in the provenance record can tell them apart.
    expect(gemini).not.toBe(anthropic);
    expect(gemini).toMatch(/^gemini:/u);
    expect(anthropic).toMatch(/^anthropic:/u);
  });

  it('defaults to gemini when the provider env var is unset', () => {
    const { resolveModelId } = jest.requireActual<{ resolveModelId: (a: string) => string }>(
      '../src/factories/LLMFactory',
    );
    delete process.env['FORENSIC_PROVIDER'];

    expect(resolveModelId('FORENSIC')).toMatch(/^gemini:/u);
  });
});
