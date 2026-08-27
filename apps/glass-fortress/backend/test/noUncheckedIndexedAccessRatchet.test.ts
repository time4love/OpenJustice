import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACKEND_ROOT,
  measureNoUncheckedIndexedAccess,
} from './helpers/noUncheckedIndexedAccess';

// ---------------------------------------------------------------------------
// `noUncheckedIndexedAccess` is OFF, and the debt may not grow.
//
// With the flag off, TypeScript types every regex capture group and array index
// as non-`undefined` while they are `undefined` at runtime. So the LINTER ARGUES
// FOR DELETING THE GUARDS THAT MAKE THE CODE CORRECT, and it has done twice:
//
//   extractHrefs            `m[2] ?? m[3] ?? m[4]` — the linter called the
//                           fallbacks redundant. Deleting them would have made
//                           single-quoted href='…' extract as the empty string.
//   documentHashSingleRule  depends on `match?.[1] !== undefined` and on
//                           iterating rather than indexing.
//
// Measured 2026-08-27: 133 errors across 17 files. Too large to fold into an
// unrelated change, too small to stay indefinite — so the standing risk is the
// BLEED, not the backlog. Every correctly guarded new file is one a future lint
// cleanup could break, with the linter arguing for the break.
//
// This stops the bleed today. The backlog rides on the levels that touch it:
// WaybackScraper.ts with Level 2 Phase A (which must open that file anyway for
// computeNextFromDate), claimTrajectory.ts with Level 6, thesisAssertions.ts and
// getThesisContext.ts with Level 9.
//
// PER FILE, NOT JUST THE TOTAL. A total-only ratchet is satisfied by fixing five
// errors in one file and adding five in another — net zero, undetected, and the
// new five are in a file nobody has looked at.
//
// IMPROVEMENTS FAIL TOO, DELIBERATELY. A ratchet that tolerates being under its
// baseline stops ratcheting: the slack is invisible and the next regression
// spends it silently. Fixing something must lock the gain in, and the failure
// message says exactly how.
// ---------------------------------------------------------------------------

const BASELINE_PATH = join(BACKEND_ROOT, 'noUncheckedIndexedAccess.baseline.json');

const BASELINE_COMMENT =
  'RATCHET BASELINE. Regenerate with: UPDATE_BASELINE=1 npx jest ' +
  'test/noUncheckedIndexedAccessRatchet.test.ts — never edit by hand to make a failure go away.';

interface Baseline {
  total: number;
  files: Record<string, number>;
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;

describe('noUncheckedIndexedAccess debt ratchet', () => {
  // tsc over the whole project — measured at ~2.3s, but Jest's default 5s
  // timeout leaves no headroom on a cold or loaded machine.
  jest.setTimeout(120_000);

  it('never grows, and any improvement is locked into the baseline', () => {
    const actual = measureNoUncheckedIndexedAccess();

    if (process.env['UPDATE_BASELINE']) {
      const files = Object.fromEntries(
        Object.entries(actual).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      );
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(
          {
            _comment: BASELINE_COMMENT,
            total: Object.values(files).reduce((a, b) => a + b, 0),
            files,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const regressions: string[] = [];
    const improvements: string[] = [];

    for (const [file, count] of Object.entries(actual)) {
      const allowed = baseline.files[file] ?? 0;
      if (count > allowed) {
        regressions.push(
          `  ${file}: ${String(allowed)} -> ${String(count)}` +
            (allowed === 0 ? '   (NEW FILE — it must start at zero)' : ''),
        );
      }
    }
    for (const [file, allowed] of Object.entries(baseline.files)) {
      const count = actual[file] ?? 0;
      if (count < allowed) improvements.push(`  ${file}: ${String(allowed)} -> ${String(count)}`);
    }

    const problems: string[] = [];
    if (regressions.length > 0) {
      problems.push(
        'REGRESSION — new unguarded indexed access.\n' +
          'Guard the access (`?.[i]`, a length check, or iterate instead of index).\n' +
          'Do NOT raise the baseline to make this pass.\n' +
          regressions.join('\n'),
      );
    }
    if (improvements.length > 0) {
      problems.push(
        'IMPROVEMENT NOT LOCKED IN — the debt fell below the baseline.\n' +
          'Run:  UPDATE_BASELINE=1 npx jest test/noUncheckedIndexedAccessRatchet.test.ts\n' +
          'then commit the baseline. Slack left in a ratchet is spent by the next regression.\n' +
          improvements.join('\n'),
      );
    }

    expect(problems.join('\n\n')).toBe('');
  });
});
