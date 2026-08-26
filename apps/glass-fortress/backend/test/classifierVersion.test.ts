import { readFileSync } from 'fs';
import { join } from 'path';
import { CLASSIFIER_VERSION, SUMMARY_VERSION, classifierPromptHash } from '../src/lib/classifierVersion';
import { DIFF_INPUT_VERSION } from '../src/lib/diffChunking';

// ---------------------------------------------------------------------------
// The provenance axes, and the one thing each is for.
//
// A stored LLM-derived column means different things on different rows the moment
// anything about its production changes. Five things can change independently:
//
//   the prompt TEXT        -> classifierPromptHash   (checkable proof)
//   the input rule         -> diffInputVersion       (what was fed in)
//   the model             -> classifierModel        (chosen by env AT RUNTIME)
//   draws taken           -> classifierDraws        (process; not derivable)
//   the procedure          -> CLASSIFIER_VERSION     (code constants; needs a commit)
//
// The failure this guards is a version that does not move when behaviour does. It
// already happened: an explicit output budget and best-of-N draws changed coverage
// on one diff from 63% to 99% with CLASSIFIER_VERSION unchanged, so the targeting
// filter selected nothing and re-running the corpus required --force.
// ---------------------------------------------------------------------------

describe('provenance axes are distinct', () => {
  it('classifier, summary and input rule carry three different values', () => {
    // One string covering several axes would have to lie about all but one of
    // them — the argument SUMMARY_VERSION's own comment makes.
    const axes = [CLASSIFIER_VERSION, SUMMARY_VERSION, DIFF_INPUT_VERSION];
    expect(new Set(axes).size).toBe(axes.length);
  });

  it('CLASSIFIER_VERSION names the current procedure', () => {
    expect(CLASSIFIER_VERSION).toBe('v4-budgeted-best-of-n');
  });

  it('does not encode a tunable value in the version name', () => {
    // A number in the name becomes false the moment someone tunes the constant
    // without renaming. The bump rule already covers tuning.
    expect(CLASSIFIER_VERSION).not.toMatch(/\d{3,}/u);
  });
});

describe('classifierPromptHash', () => {
  it('is a sha256 of the composed prompt and is stable across calls', () => {
    const a = classifierPromptHash();
    const b = classifierPromptHash();

    expect(a).toMatch(/^[0-9a-f]{64}$/u);
    expect(a).toBe(b);
  });

  it('is blind to the procedure — which is why CLASSIFIER_VERSION exists', () => {
    // The v3 -> v4 change altered the output budget and the number of draws, and
    // moved this hash not at all. Asserting the relationship rather than a literal
    // digest, so editing the prompt does not fail this test for the wrong reason.
    const source = readFileSync(
      join(__dirname, '..', 'src/lib/classifierVersion.ts'),
      'utf8',
    );
    expect(source).toContain('FORENSIC_DIFF_CLASSIFICATION_PROMPT');
    expect(source).not.toMatch(/update\((?!FORENSIC_DIFF_CLASSIFICATION_PROMPT)/u);
  });
});

describe('a version bump actually targets rows', () => {
  it('reclassification selects on CLASSIFIER_VERSION', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src/services/reclassifyDiffs.ts'),
      'utf8',
    );

    // Without this the bump is decorative: rows below the current version would
    // never be selected, and bringing a corpus forward would need --force, which
    // is exactly what happened when the budget change shipped without a bump.
    expect(source).toMatch(/NOT:\s*\{\s*classifierVersion:\s*CLASSIFIER_VERSION\s*\}/u);
    expect(source).toMatch(/classifierVersion:\s*null/u);
  });
});
