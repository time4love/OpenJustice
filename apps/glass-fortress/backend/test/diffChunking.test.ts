import type { Change } from 'diff';
import { diffLines } from 'diff';
import {
  groupDiffChunks,
  classifierInputChunks,
  DIFF_INPUT_VERSION,
} from '../src/lib/diffChunking';

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

function removed(lines: string[]): Change[] {
  return lines.flatMap((l) => [
    { value: `${l}\n`, removed: true, added: false, count: 1 },
    { value: 'unchanged\n', removed: false, added: false, count: 1 },
  ]);
}

describe('groupDiffChunks — nothing is discarded at write time', () => {
  it('returns every chunk when there are far more than the old cap of 8', () => {
    const lines = Array.from({ length: 34 }, (_, i) => `change number ${String(i)}`);

    const chunks = groupDiffChunks(removed(lines), 'removed');

    // The real corpus had two diffs with exactly 34 changes per side that stored
    // 8. That is the case this asserts, at the size it actually happened.
    expect(chunks).toHaveLength(34);
  });

  it('preserves DOCUMENT order, not longest-first', () => {
    const chunks = groupDiffChunks(
      removed(['short', 'a considerably longer line of text here', 'mid length line']),
      'removed',
    );

    // Ordering by length existed only to choose what to keep. With nothing
    // discarded it would destroy where-on-the-page information, which a
    // researcher reads as evidence.
    expect(chunks).toEqual([
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

    expect(groupDiffChunks(removed([link]), 'removed')).toEqual([link]);
  });

  it('separates added from removed', () => {
    const raw = diffLines('alpha\nbeta\n', 'alpha\ngamma\n', { ignoreWhitespace: true });

    expect(groupDiffChunks(raw, 'removed')).toEqual(['beta']);
    expect(groupDiffChunks(raw, 'added')).toEqual(['gamma']);
  });

  it('drops nothing but genuinely empty chunks', () => {
    const raw: Change[] = [
      { value: '   \n', removed: true, added: false, count: 1 },
      { value: 'keep\n', removed: false, added: false, count: 1 },
      { value: 'real content\n', removed: true, added: false, count: 1 },
    ];

    expect(groupDiffChunks(raw, 'removed')).toEqual(['real content']);
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
    expect(DIFF_INPUT_VERSION).toBe('v2-uncapped');
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
