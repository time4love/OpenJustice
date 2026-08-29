import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// A DIFF IS COMPUTED IN ONE PLACE, AT ONE GRANULARITY.
//
// `diffLines` had FOUR call sites — two in rediffFromSnapshots, two in
// WaybackScraper — each pairing it with its own chunk grouping. One rule, four
// implementations, is this repository's dominant defect shape, and here it has a
// specific edge that makes a source scan the only guard that works:
//
//   a fifth call site added later would keep the OLD block granularity while
//   stamping the NEW DIFF_INPUT_VERSION.
//
// That is exactly the two-paths-one-version-string defect already on the record,
// where a scan applied a 40-character floor, reclassification applied none, and
// both stamped the same classifierVersion. The divergence was invisible in the
// data. A behaviour test covers the paths someone thought of; this fails the
// moment a new one appears.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/** The one module permitted to compute a diff. */
const DIFFER = 'lib/diffChunking.ts';

/** Type declarations describe the library; they do not call it. */
const TYPE_DECLARATIONS = 'types/diff.d.ts';

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Source with comment lines removed, so prose about a rule is not the rule. */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

function filesMatching(pattern: RegExp): string[] {
  return tsFiles(SRC)
    .filter((file) => pattern.test(codeOf(file)))
    .map((f) => f.slice(SRC.length + 1))
    .filter((f) => f !== TYPE_DECLARATIONS);
}

describe('one differ', () => {
  it('only diffChunking.ts calls diffLines', () => {
    expect(filesMatching(/\bdiffLines\s*\(/)).toEqual([DIFFER]);
  });

  it('only diffChunking.ts calls diffArrays', () => {
    // The sentence-alignment half of the same rule. Splitting it across modules
    // would let one path refine a region and another not.
    expect(filesMatching(/\bdiffArrays\s*\(/)).toEqual([DIFFER]);
  });

  it('nothing reaches for a different granularity of the same library', () => {
    // diffWords / diffSentences / diffChars would each be a second answer to
    // "how finely is a change claimed", stamped with the same version string.
    expect(filesMatching(/\b(diffWords|diffWordsWithSpace|diffSentences|diffChars|diffTrimmedLines)\s*\(/))
      .toEqual([]);
  });
});

describe('one definition of a sentence', () => {
  it('has a shared splitter, so the claim and the check cannot drift', () => {
    // VACUITY GUARD FIRST: if `sentencesOf` were renamed, every assertion below
    // would pass by describing an empty set.
    const importers = filesMatching(/\bsentencesOf\s*\(/);
    expect(importers.length).toBeGreaterThan(1);
    expect(importers).toContain('lib/textSegments.ts');
  });

  it('is used by BOTH the differ and the survival checker', () => {
    // The rider fix is exactly this coupling: the pipeline must CLAIM at the
    // granularity Level 5 TESTS at. Either side re-implementing the split
    // reopens the defect while every version string stays put.
    const importers = filesMatching(/\bsentencesOf\s*\(/);
    expect(importers).toContain(DIFFER);
    expect(importers).toContain('lib/diffSurvival.ts');
  });

  it('nobody re-implements the sentence split with a local regex', () => {
    // The literal that used to live in diffSurvival.ts. A copy of it anywhere
    // else is the drift this file exists to prevent.
    const localSplitters = tsFiles(SRC)
      .filter((file) => /\(\?<=\[\.!\?\]\)/.test(codeOf(file)))
      .map((f) => f.slice(SRC.length + 1));
    expect(localSplitters).toEqual(['lib/textSegments.ts']);
  });
});
