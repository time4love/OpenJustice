#!/usr/bin/env node
/**
 * Ingest an operational run's own record into the integrity ledger.
 *
 *   railway ssh … "npm run forensics:audit-anchors -- --env staging" | tee run.log
 *   node tools/integrity-board/record.mjs run.log
 *   node tools/integrity-board/record.mjs --summary "VERIFIED 7 · …" run.log
 *
 * THE POINT IS THAT NOTHING HERE IS TYPED FROM MEMORY. `runOperationalScript` emits a
 * delimited JSON block containing what the CONTAINER observed about itself — the
 * environment it agreed on, `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_DEPLOYMENT_ID`, and the
 * exit code. This reads that block and writes it down.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. The board computes staleness by diffing a check's
 * `dependsOn` paths against `lastRun.commit`. A commit transcribed from a session's
 * memory can be wrong, and a wrong commit makes the board wrong IN THE REASSURING
 * DIRECTION — it reports CURRENT for a proof that no longer covers the code. The first
 * ledger was written that way. This exists so the second is not.
 *
 * WHAT THIS REFUSES TO DECIDE: whether the run passed. That is a property of the CHECK,
 * declared once in the ledger as `exitMeans`, because an exit code cannot say it —
 * `forensics:audit-anchors` exits 5 on a corpus whose legacy anchors are unsuperseded
 * and that is correct. A run reports its exit; the ledger says what that exit means.
 *
 * `--summary` is the one free-text field, and it is optional. It is prose for a reader,
 * never an input to the score.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const LEDGER = join(ROOT, 'docs', 'integrity', 'ledger.json');

const BEGIN = '--- INTEGRITY-LEDGER-RECORD ---';
const END = '--- END-INTEGRITY-LEDGER-RECORD ---';

const argv = process.argv.slice(2);
const summaryAt = argv.indexOf('--summary');
const summary = summaryAt >= 0 ? argv[summaryAt + 1] : undefined;
const file = argv.filter((a, i) => a !== '--summary' && i !== summaryAt + 1).at(-1);

if (!file) {
  console.error('usage: record.mjs [--summary "…"] <run.log>');
  process.exit(1);
}

const log = readFileSync(file, 'utf8');

/** Every record in the log — a single run may be one, a batched session several. */
function extractRecords(text) {
  const out = [];
  let from = 0;
  for (;;) {
    const b = text.indexOf(BEGIN, from);
    if (b < 0) break;
    const e = text.indexOf(END, b);
    if (e < 0) break;
    const body = text.slice(b + BEGIN.length, e).trim();
    try {
      out.push(JSON.parse(body));
    } catch {
      console.error(`skipping an unparseable record at offset ${b}`);
    }
    from = e + END.length;
  }
  return out;
}

const records = extractRecords(log);
if (records.length === 0) {
  console.error(
    'No INTEGRITY-LEDGER-RECORD block in that log.\n' +
      'Operational scripts emit one on completion; a log without it either predates\n' +
      'that, was truncated, or the script never reached the end. Do not hand-write the\n' +
      'entry — re-run and capture the whole output.',
  );
  process.exit(1);
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
let updated = 0;

for (const r of records) {
  const check = ledger.checks.find((c) => c.runner === r.runner);
  if (!check) {
    console.error(`no ledger check declares runner "${r.runner}" — skipped`);
    continue;
  }
  if (!r.commit) {
    // A run whose container did not report a commit cannot anchor staleness. Recording
    // it would give the board a baseline it cannot diff against, which reads as
    // "current" rather than "unknown".
    console.error(`"${r.runner}" reported no commit — refusing to record a run that cannot be staleness-checked`);
    continue;
  }
  const meaning = check.exitMeans?.[String(r.exit)];
  check.lastRun = {
    commit: r.commit,
    at: r.finishedAt.slice(0, 10),
    environment: r.env,
    exit: r.exit,
    outcome: meaning ?? 'UNDECLARED',
    deploymentId: r.deploymentId,
    ...(summary ? { summary } : {}),
    observed: true,
  };
  if (!meaning) {
    console.error(
      `"${check.id}" exited ${r.exit}, which its exitMeans does not declare.\n` +
        '  Recorded as UNDECLARED. Decide what that exit MEANS for this check and add it —\n' +
        '  once, in the ledger, not per run.',
    );
  }
  updated++;
  console.log(`recorded ${check.id}: exit ${r.exit} (${meaning ?? 'UNDECLARED'}) @ ${r.commit.slice(0, 7)} · ${r.env}`);
}

if (updated === 0) process.exit(1);

writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
execFileSync('node', [join(HERE, 'build.mjs')], { cwd: ROOT, stdio: 'inherit' });
