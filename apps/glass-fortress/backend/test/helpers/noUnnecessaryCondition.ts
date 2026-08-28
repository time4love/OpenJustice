import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * How many `no-unnecessary-condition` errors each file currently has.
 *
 * ONE PARSER, used by both the ratchet assertion and the baseline it is compared
 * against — regenerated through the same function via `UPDATE_BASELINE=1`. A
 * baseline measured differently from its check drifts in whichever direction
 * makes it pass, which is the defect shape this repository keeps finding.
 */
export const BACKEND_ROOT = join(__dirname, '..', '..');

const RULE = '@typescript-eslint/no-unnecessary-condition';

interface EslintMessage {
  ruleId: string | null;
}
interface EslintFile {
  filePath: string;
  messages: EslintMessage[];
}

export function measureNoUnnecessaryCondition(): Record<string, number> {
  let raw: string;
  try {
    raw = execFileSync('npx', ['eslint', 'src/', '-f', 'json'], {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // eslint exits non-zero whenever it reports an error, which is the expected
    // path while any debt remains. The JSON report is still on stdout.
    const e = err as { stdout?: string };
    raw = e.stdout ?? '';
  }

  // A report that will not parse is a broken invocation, not a clean codebase.
  // Returning {} there would silently relax the ratchet to "anything goes" — the
  // vacuous pass this codebase has been bitten by repeatedly.
  let report: EslintFile[];
  try {
    report = JSON.parse(raw) as EslintFile[];
  } catch {
    throw new Error(
      `no-unnecessary-condition: eslint produced no parseable JSON report. ` +
        `First 300 chars:\n${raw.slice(0, 300)}`,
    );
  }
  if (!Array.isArray(report) || report.length === 0) {
    throw new Error('no-unnecessary-condition: eslint reported on zero files.');
  }

  const counts: Record<string, number> = {};
  for (const file of report) {
    const n = file.messages.filter((m) => m.ruleId === RULE).length;
    if (n > 0) counts[file.filePath.split(`${BACKEND_ROOT}/`)[1] ?? file.filePath] = n;
  }
  return counts;
}
