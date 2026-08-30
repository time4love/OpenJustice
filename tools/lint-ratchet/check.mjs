// A RATCHET, NOT A SWEEP. The lint debt is 381 problems across 23 rules and no
// check stops it growing. Cleaning it is several separate changes, most of them
// mechanical and two of them design; this is the thing worth having FIRST,
// because it costs a dozen lines and turns a trend into a ceiling.
//
// PER RULE, NOT A TOTAL. A total lets one rule's fix pay for another rule's
// regression and reports a flat number while the codebase gets worse. The unit
// that matters is the rule, which is also the unit the cleanup PRs will use.
//
// IT CAN PASS, WHICH IS THE POINT. `eslint src/` exits 1 today, so wiring that
// into CI directly would install a permanently red required check — the exact
// defect retired on 2026-08-30, when `integrity:check` turned out to compare a
// committed artifact against a rebuild that embeds its own commit and therefore
// had no passing state at all. This compares against a recorded baseline, so the
// steady state is green.
//
// A DECREASE ALSO FAILS, deliberately. A baseline that only moves up is not a
// ratchet, it is a permission slip. Fixing lint requires lowering the recorded
// number in the same change, which is one command and keeps the file honest
// about what the codebase actually contains.
//
// CI IS THE SOURCE OF TRUTH FOR THE BASELINE, and that is not a preference. The
// first CI run of this check disagreed with the laptop that recorded it by one
// `no-unnecessary-type-assertion` — a TYPE-AWARE rule, so it reads whatever types
// the installed dependencies produce. CI installs with `npm ci` from the
// lockfile; a laptop's node_modules drifts. Recording the baseline from the
// drifted side would make the check enforce a state no clean checkout has.
//
// NO ERROR IS RESOLVED BY AN eslint-disable OR BY RELAXING A RULE. That makes
// the number fall while the codebase stays the same, which is a test encoding a
// defect as a requirement — a shape this repository has paid for before.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASELINE = join(HERE, 'baseline.json');
const TARGET = { name: 'glass-fortress-backend', cwd: join(ROOT, 'apps', 'glass-fortress', 'backend'), globs: ['src/'] };

const update = process.argv.includes('--update');

/** eslint exits non-zero when it finds problems; that is data here, not failure. */
function lint() {
  try {
    return execFileSync('npx', ['eslint', ...TARGET.globs, '-f', 'json'], {
      cwd: TARGET.cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    if (typeof err.stdout === 'string' && err.stdout.trim().startsWith('[')) return err.stdout;
    throw err;
  }
}

const counts = {};
for (const file of JSON.parse(lint())) {
  for (const m of file.messages) {
    const rule = m.ruleId ?? '(parse-error)';
    counts[rule] = (counts[rule] ?? 0) + 1;
  }
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (update) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, `${JSON.stringify({ target: TARGET.name, total, rules: sorted }, null, 2)}\n`);
  console.log(`baseline updated: ${total} problems across ${Object.keys(counts).length} rules`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));

// AN EMPTY RUN IS NOT A PASS. If eslint reports nothing while the baseline
// expects hundreds, the lint invocation broke — and a broken instrument
// reporting success is how a check becomes decoration.
if (total === 0 && baseline.total > 0) {
  console.error(`eslint reported 0 problems against a baseline of ${baseline.total}. The lint run did not work; this is not an improvement.`);
  process.exit(2);
}

const worse = [];
const better = [];
for (const rule of new Set([...Object.keys(counts), ...Object.keys(baseline.rules)])) {
  const now = counts[rule] ?? 0;
  const was = baseline.rules[rule] ?? 0;
  if (now > was) worse.push(`  ${rule}: ${was} -> ${now}${was === 0 ? '  (NEW RULE)' : ''}`);
  if (now < was) better.push(`  ${rule}: ${was} -> ${now}`);
}

if (worse.length > 0) {
  console.error(`Lint debt grew. Fix these rather than recording them:\n${worse.join('\n')}`);
  console.error('\nNo problem is resolved by an eslint-disable or by relaxing a rule.');
  process.exit(1);
}

if (better.length > 0) {
  console.error(`Lint debt fell — record it in the same change:\n${better.join('\n')}`);
  console.error('\n  npm run lint:ratchet -- --update\n\nthen commit tools/lint-ratchet/baseline.json.');
  console.error(
    'If this appears LOCALLY but not in CI, the debt did not fall — your node_modules has drifted ' +
      'from the lockfile, and type-aware rules read different types as a result. CI installs with ' +
      '`npm ci` and is the source of truth. Run `npm ci` before updating the baseline.',
  );
  process.exit(1);
}

console.log(`Lint debt unchanged: ${total} problems across ${Object.keys(counts).length} rules.`);
