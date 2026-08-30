#!/usr/bin/env node
/**
 * Generate the public integrity board from the plan and the ledger.
 *
 *   node tools/integrity-board/build.mjs            # write docs/integrity/index.html
 *   node tools/integrity-board/build.mjs --check    # fail if the committed board is stale
 *
 * NO DATABASE, NO CHAIN, NO NETWORK, NO MODEL, NO DEPENDENCIES. It reads three things:
 * the plan's own STATUS: lines, docs/integrity/ledger.json, and `git log`. That is what
 * makes it affordable on every PR.
 *
 * WHY IT DOES NOT RUN THE CHECKS. Every falsifier in the ledger is an operational script
 * guarded by RAILWAY_DEPLOYMENT_ID — it refuses to run outside a deployment and needs the
 * database and the chain. Computing proof at PR time is impossible by construction, not
 * merely expensive. So a run records itself in the ledger and this renders what is there.
 *
 * THE ONE THING COMPUTED HERE IS STALENESS, and it reuses the discipline the codebase
 * already trusts: a Level 5 verdict is stale when the inputs it judged have moved, and a
 * check's result is stale when the code it exercised has moved. `dependsOn` declares that
 * code; this diffs it against `lastRun.commit`.
 *
 * DELIBERATELY OUTSIDE apps/glass-fortress/backend/scripts. Everything there must route
 * through `runOperationalScript`, enforced by a source scan. This is not an operational
 * script — it must run locally, at PR time, with no environment at all.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAN = join(ROOT, 'docs', 'gf-factual-layer-rebuild-dev-plan.md');
const LEDGER = join(ROOT, 'docs', 'integrity', 'ledger.json');
const OUT = join(ROOT, 'docs', 'integrity', 'index.html');

/**
 * Run git, returning NULL on failure — never an empty string.
 *
 * The distinction is load-bearing and was got wrong first time. `git diff X..HEAD`
 * on an unresolvable commit fails; an empty-string fallback then reads as "no files
 * changed", which makes the check CURRENT and the level fully proved. A ledger entry
 * with a typo'd or rebased-away commit would have scored 100.
 *
 * Wrong in the reassuring direction is the only kind of wrong this board must not be.
 */
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// 1. The claim — read from the plan's own STATUS: lines and nothing else.
//
// Mechanical on purpose. The colour on this board must never be an opinion: if it
// disagrees with the plan, the plan is wrong or this is, and both are checkable.
// ---------------------------------------------------------------------------
function readLevels() {
  const lines = readFileSync(PLAN, 'utf8').split('\n');
  const levels = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^### Level (\d+) — (.+?)(?:\s+·.*)?$/.exec(lines[i]);
    if (!head) continue;
    let status = null;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const m = /^\*\*STATUS:\s*([^—.*]+)/.exec(lines[j]);
      if (m) {
        status = m[1].trim();
        break;
      }
    }
    levels.push({ n: Number(head[1]), name: head[2].trim(), status: status ?? 'UNSTATED' });
  }
  return levels.sort((a, b) => a.n - b.n);
}

/** Claim → the colour family. Derived from the plan's word, never from a judgement. */
function tone(status) {
  const s = status.toUpperCase();
  if (s.startsWith('DONE') || s.startsWith('CLOSED') || s.startsWith('ENFORCED')) return 'proven';
  if (s.startsWith('DEFERRED')) return 'dormant';
  if (s.startsWith('OPEN')) return 'open';
  return 'partial';
}

// ---------------------------------------------------------------------------
// 2. Staleness — the only thing this program computes.
// ---------------------------------------------------------------------------
function changedSince(commit) {
  if (!commit) return null; // unknown baseline: cannot compute, must not guess
  // Resolvable first, and separately. A failed diff and a diff with no results are
  // opposite answers, and only the second means "nothing moved".
  if (git('rev-parse', '--verify', '--quiet', `${commit}^{commit}`) === null) return null;
  const out = git('diff', '--name-only', `${commit}..HEAD`);
  if (out === null) return null;
  return out ? out.split('\n').filter(Boolean) : [];
}

function staleness(check, backendRoot) {
  const run = check.lastRun;
  if (!run) return { state: 'NEVER', movedPaths: [] };
  const changed = changedSince(run.commit);
  if (changed === null) return { state: 'BASELINE_UNKNOWN', movedPaths: [] };
  const deps = (check.dependsOn ?? []).map((d) => `${backendRoot}/${d}`.replace(/\/+/g, '/'));
  const moved = changed.filter((f) => deps.some((d) => f === d || f.startsWith(`${d}/`)));
  return { state: moved.length ? 'STALE' : 'CURRENT', movedPaths: moved };
}

/**
 * PROOF IS A FUNCTION, not an opinion.
 *
 * The single human input is `outcome`, declared once per check in the ledger, because an
 * exit code alone cannot say whether a non-zero exit is a failure — `audit-anchors` exits
 * 5 on a corpus whose legacy anchors are not yet superseded, and that is correct.
 */
function proofScore(check, stale) {
  if (!check.command) return 0; // no falsifier exists at all
  if (stale.state === 'NEVER') return 25;
  if (stale.state === 'STALE') return 50;
  if (stale.state === 'BASELINE_UNKNOWN') return 40;
  // VACUOUS IS NEVER PROOF, and it is listed first because it is the one outcome
  // that ARRIVES LOOKING LIKE A PASS. `confirm-anchors` over an empty selection
  // exited 0 and scored 100 here until 2026-08-30 — a green level backed by a run
  // that examined nothing. It scores below "never run": a check believed to have
  // passed is worse than one known not to have run.
  if (check.lastRun.outcome === 'VACUOUS') return 25;
  const ok = check.lastRun.outcome === 'CLEAN' || check.lastRun.outcome === 'PASS_WITH_KNOWN_LEGACY';
  return ok ? 100 : 75;
}

const PROOF_WORD = {
  0: 'no check exists',
  25: 'never run',
  40: 'run, baseline unrecorded',
  50: 'stale — its code moved since',
  75: 'run, current, reported a finding',
  100: 'run, current, held',
};

// ---------------------------------------------------------------------------
// 3. Render.
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function build() {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const levels = readLevels();
  const backendRoot = ledger.backendRoot;

  const byLevel = new Map();
  for (const c of ledger.checks) {
    if (!byLevel.has(c.level)) byLevel.set(c.level, []);
    const stale = staleness(c, backendRoot);
    byLevel.get(c.level).push({ ...c, stale, score: c.role === 'invariant' ? proofScore(c, stale) : null });
  }

  const rows = levels.map((lv) => {
    const checks = byLevel.get(lv.n) ?? [];
    const invariants = checks.filter((c) => c.role === 'invariant');
    // A level is proved as well as its WEAKEST invariant, never its best. One
    // unchecked clause is enough for the level's claim to outrun its evidence.
    const score = invariants.length ? Math.min(...invariants.map((c) => c.score)) : 0;
    return { ...lv, checks, invariants, score, tone: tone(lv.status) };
  });

  const head = git('rev-parse', '--short', 'HEAD') ?? 'unknown';
  const when = git('log', '-1', '--format=%cs') ?? '';
  const neverRun = rows.filter((r) => r.score <= 25).length;
  const stalest = ledger.checks
    .map((c) => ({ id: c.id, s: staleness(c, backendRoot) }))
    .filter((c) => c.s.state === 'STALE');

  const strata = [...rows]
    .reverse()
    .map(
      (r) => `      <div class="stratum t-${r.tone}">
        <span class="lv">${String(r.n).padStart(2, '0')}</span>
        <span class="nm">${esc(r.name)}<small>${esc(r.invariants.length ? r.invariants[0].claim : 'no invariant check')}</small></span>
        <div class="track"><div class="fill" style="width:${Math.max(r.score, 4)}%"></div><span class="cap">${esc(PROOF_WORD[r.score] ?? '')}</span></div>
        <span class="claim">${esc(r.status)}</span>
      </div>`,
    )
    .join('\n');

  const tableRows = ledger.checks
    .map((c) => {
      const stale = staleness(c, backendRoot);
      const run = c.lastRun;
      const cls =
        stale.state === 'NEVER' ? 'never' : stale.state === 'STALE' ? 'stale' : 'ran';
      const last = !c.command
        ? '<span class="never">no check exists</span>'
        : !run
          ? '<span class="never">never recorded</span>'
          : stale.state === 'STALE'
            ? `<span class="stale">stale</span> <span class="dim">— ${esc(stale.movedPaths.length)} dependency file(s) moved since <code>${esc(run.commit)}</code></span>`
            : `<span class="ran">${esc(run.at)}</span> <span class="dim">@ <code>${esc(run.commit ?? '—')}</code> · exit ${esc(run.exit)} · ${esc(run.outcome)}</span>${run.observed ? '' : ' <span class="pill" title="written by hand before runs recorded themselves">transcribed</span>'}`;
      return `          <tr class="${cls}">
            <td class="k">${esc(c.level)} · ${esc(c.id)}</td>
            <td>${c.role === 'instrument' ? '<span class="pill">instrument</span> ' : ''}${esc(c.claim)}</td>
            <td>${c.command ? `<code>${esc(c.command)}</code>` : '<span class="dim">—</span>'}</td>
            <td>${last}${run?.summary ? `<p class="sum">${esc(run.summary)}</p>` : ''}${c.note ? `<p class="sum">${esc(c.note)}</p>` : ''}</td>
          </tr>`;
    })
    .join('\n');

  return TEMPLATE.replace('{{HEAD}}', esc(head))
    .replace('{{WHEN}}', esc(when))
    .replace('{{NEVER}}', String(neverRun))
    .replace('{{TOTAL}}', String(rows.length))
    .replace('{{STALE}}', String(stalest.length))
    .replace('{{STRATA}}', strata)
    .replace('{{ROWS}}', tableRows);
}

const TEMPLATE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'template.html'), 'utf8');

const html = build();
if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== html) {
    console.error(
      'The committed integrity board is out of date.\n' +
        '  node tools/integrity-board/build.mjs\n' +
        'then commit docs/integrity/index.html.',
    );
    process.exit(1);
  }
  console.log('integrity board is current');
} else {
  writeFileSync(OUT, html);
  console.log(`wrote ${OUT}`);
}
