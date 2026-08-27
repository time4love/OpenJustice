import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * How many `noUncheckedIndexedAccess` errors each file currently has.
 *
 * ONE PARSER, used by both the ratchet assertion and the baseline it is
 * compared against — regenerated through the same function via
 * `UPDATE_BASELINE=1`. Two implementations of "what counts as an error" is the
 * defect shape this repository keeps finding (one rule, four documentHash
 * writers; one rule, sixteen scripts), and a ratchet whose baseline is measured
 * differently from its check would drift silently in the direction that makes it
 * pass.
 */
export const BACKEND_ROOT = join(__dirname, '..', '..');

export function measureNoUncheckedIndexedAccess(): Record<string, number> {
  let output: string;
  try {
    execFileSync(
      'npx',
      ['tsc', '--noEmit', '--noUncheckedIndexedAccess', '-p', 'tsconfig.json'],
      { cwd: BACKEND_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    // Exit 0 means zero errors — the debt is fully paid off.
    return {};
  } catch (err) {
    // tsc exits non-zero when it reports errors, which is the expected path
    // while any debt remains. The diagnostics are on stdout.
    const e = err as { stdout?: string; stderr?: string };
    output = (e.stdout ?? '') + (e.stderr ?? '');
  }

  const counts: Record<string, number> = {};
  let matched = 0;
  for (const line of output.split('\n')) {
    const m = /^(\S+?\.ts)\((\d+),(\d+)\): error TS\d+:/.exec(line);
    if (!m?.[1]) continue;
    matched++;
    counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  }

  // A parse that matches nothing while tsc reported failure means the output
  // format moved, not that the debt vanished. Returning {} there would silently
  // relax the ratchet to "anything goes" — the vacuous-pass failure this
  // codebase has now been bitten by often enough to check for by default.
  if (matched === 0) {
    throw new Error(
      'noUncheckedIndexedAccess: tsc reported failure but no diagnostics parsed. ' +
        `The output format likely changed. First 500 chars:\n${output.slice(0, 500)}`,
    );
  }
  return counts;
}
