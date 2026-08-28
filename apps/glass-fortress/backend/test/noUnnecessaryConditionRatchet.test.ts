import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACKEND_ROOT,
  measureNoUnnecessaryCondition,
} from './helpers/noUnnecessaryCondition';

// ---------------------------------------------------------------------------
// `no-unnecessary-condition` debt, per file, may not grow.
//
// WHY THIS EXISTS NOW. Making `UrlVersionDiff.beforeSnapshotId` / `afterSnapshotId`
// NOT NULL turned 18 guards across four diff-readers into dead branches, and the
// linter is right that they are dead — ONCE THE MIGRATION IS APPLIED.
//
// They were kept, deliberately: the type is enforced by a constraint that SHIPS
// WITH THIS CODE BUT IS NOT YET APPLIED, and `forensics:rediff` /
// `forensics:measure-divergence` run locally against real environments OUTSIDE
// the deploy ordering that guarantees migrations land first. Between merge and
// migration there is a real window in which the runtime produces what the type
// calls impossible — which is exactly the `extractHrefs` near-miss, where
// deleting a guard the linter called redundant would have made single-quoted
// href='…' extract as the empty string.
//
// THE PROBLEM THAT MADE THIS TEST NECESSARY. `npm run lint` is `eslint src/` with
// no `--max-warnings` and no baseline, so the count 363 -> 381 was tracked by
// nothing but a session summary. The next reader sees 381, cannot distinguish 18
// deliberate guards from 18 accidents, and the honest reading of a raw count is
// that the debt grew.
//
// So the intention becomes a condition. The baseline records what each file
// carries and why; this test fails if any file grows. When the migration is
// applied in EVERY environment, dropping a file's entry to 0 makes the ratchet
// DEMAND the removal rather than hoping a later step remembers.
// ---------------------------------------------------------------------------

const BASELINE_PATH = join(BACKEND_ROOT, 'noUnnecessaryCondition.baseline.json');

const BASELINE_COMMENT =
  'RATCHET BASELINE. Regenerate with: UPDATE_BASELINE=1 npx jest ' +
  'test/noUnnecessaryConditionRatchet.test.ts — never edit by hand to make a failure go away.';

interface Baseline {
  total: number;
  files: Record<string, number>;
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;

describe('no-unnecessary-condition debt ratchet', () => {
  // eslint over src/ measured at ~5.3s; the default 5s timeout leaves no headroom.
  jest.setTimeout(180_000);

  it('never grows, and any improvement is locked into the baseline', () => {
    const actual = measureNoUnnecessaryCondition();

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

    // A WHOLESALE COLLAPSE IS A BROKEN MEASUREMENT, NOT A TRIUMPH.
    //
    // Found by mutation: renaming the rule constant made every file report zero,
    // which the improvement arm below then reported as progress — and its remedy,
    // "regenerate the baseline", would have baked in zeros and silently disabled
    // this check for good. The suggested fix has to be safe when the diagnosis is
    // wrong, so the collapse case throws instead of offering it.
    const baselineTotal = Object.values(baseline.files).reduce((a, b) => a + b, 0);
    const actualTotal = Object.values(actual).reduce((a, b) => a + b, 0);
    if (baselineTotal > 0 && actualTotal === 0) {
      throw new Error(
        `no-unnecessary-condition: measured 0 across the whole project against a baseline of ` +
          `${String(baselineTotal)}. That is far more likely a broken measurement — a renamed ` +
          `rule, a changed report format — than ${String(baselineTotal)} simultaneous fixes. ` +
          `Do NOT regenerate the baseline; fix the measurer.`,
      );
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
        'REGRESSION — a new condition the types say can never be false.\n' +
          'Either the condition is genuinely dead (remove it) or the type is lying\n' +
          '(fix the type). Do NOT raise the baseline to make this pass.\n' +
          regressions.join('\n'),
      );
    }
    if (improvements.length > 0) {
      problems.push(
        'IMPROVEMENT NOT LOCKED IN — the debt fell below the baseline.\n' +
          'Run:  UPDATE_BASELINE=1 npx jest test/noUnnecessaryConditionRatchet.test.ts\n' +
          'then commit the baseline. Slack left in a ratchet is spent by the next regression.\n' +
          improvements.join('\n'),
      );
    }

    expect(problems.join('\n\n')).toBe('');
  });
});
