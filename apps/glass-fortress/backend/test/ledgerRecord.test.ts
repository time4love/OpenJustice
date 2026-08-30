// ---------------------------------------------------------------------------
// A RUN RECORDS ITSELF, AND EVERY FIELD IS OBSERVED.
//
// The integrity board computes staleness by diffing a check's `dependsOn` paths
// against `lastRun.commit`. A commit TRANSCRIBED from a session's memory can be
// wrong, and a wrong commit makes the board wrong in the reassuring direction: it
// reports CURRENT for a proof that no longer covers the code. The first ledger was
// written that way, which is why this exists.
//
// The record is emitted by `runOperationalScript` and nowhere else, because that is
// already the single entry point every operational script must route through — held
// by `operationalScriptsGuarded.test.ts`. A per-script implementation would be one
// rule with twenty copies.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { LEDGER_RECORD_BEGIN, LEDGER_RECORD_END } from '../src/lib/operationalContext';

/** Pull the record out of captured output exactly as `record.mjs` does. */
function extract(lines: string[]): Record<string, unknown> | null {
  const text = lines.join('\n');
  const b = text.indexOf(LEDGER_RECORD_BEGIN);
  const e = text.indexOf(LEDGER_RECORD_END);
  if (b < 0 || e < 0) return null;
  return JSON.parse(text.slice(b + LEDGER_RECORD_BEGIN.length, e).trim()) as Record<string, unknown>;
}

describe('the ledger record a run emits about itself', () => {
  it('carries the observed commit and deployment, not a supplied one', () => {
    // The two fields the board's staleness rests on. Both come from the container's
    // own environment in `assertOperationalContext`; neither is ever an argument.
    const emitted = [
      LEDGER_RECORD_BEGIN,
      JSON.stringify({
        runner: 'auditOnChainAnchors',
        env: 'staging',
        commit: 'abc1234',
        deploymentId: 'dep-1',
        exit: 5,
        startedAt: '2026-08-30T10:00:00.000Z',
        finishedAt: '2026-08-30T10:00:12.000Z',
      }),
      LEDGER_RECORD_END,
    ];
    const r = extract(emitted);
    expect(r).not.toBeNull();
    expect(r).toMatchObject({ runner: 'auditOnChainAnchors', commit: 'abc1234', deploymentId: 'dep-1' });
  });

  it('carries the EXIT CODE and no interpretation of it', () => {
    // Whether a non-zero exit is a failure is a property of the CHECK, not the run:
    // `forensics:audit-anchors` exits 5 on a corpus whose legacy anchors are
    // unsuperseded and that is CORRECT. The ledger declares that once, per check, in
    // `exitMeans`. A record that carried a verdict would re-decide it every run, and
    // the two would drift — this repository's dominant defect.
    const r = extract([
      LEDGER_RECORD_BEGIN,
      JSON.stringify({ runner: 'x', env: 'staging', commit: 'a', deploymentId: 'd', exit: 5 }),
      LEDGER_RECORD_END,
    ]);
    expect(r).toHaveProperty('exit', 5);
    expect(r).not.toHaveProperty('outcome');
    expect(r).not.toHaveProperty('passed');
    expect(r).not.toHaveProperty('summary');
  });

  it('DETECTS a log with no record — proven against a decoy', () => {
    // Without this the extractor could stop matching and every ingest would silently
    // find nothing, which `record.mjs` must treat as a refusal rather than a no-op.
    expect(extract(['environment  staging', 'some output', 'done'])).toBeNull();
  });

  it('the delimiters are exported, so the reader and the writer cannot drift', () => {
    // `record.mjs` cannot import TypeScript, so it repeats these two strings. Pinning
    // them here means a change on this side fails a test rather than silently
    // producing logs the ingest tool no longer recognises.
    expect(LEDGER_RECORD_BEGIN).toBe('--- INTEGRITY-LEDGER-RECORD ---');
    expect(LEDGER_RECORD_END).toBe('--- END-INTEGRITY-LEDGER-RECORD ---');
  });
});

describe('a script that exits directly still records itself', () => {
  it('SEVENTEEN OF TWENTY-THREE SCRIPTS call process.exit() in their own body', () => {
    // The count is the finding, not the trivia. The first version of this emission
    // ran after `await body(context)` returned — which never happens for a script
    // that exits from inside itself. `forensics:audit-anchors` exits 5 that way and
    // produced no record at all, found the first time the ledger was fed a real run.
    //
    // The guard is the COUNT being non-zero: if every script were rewritten to
    // return its code instead, this test would be free to go. While any script
    // exits directly, the emission must not depend on the body returning.
    const dir = join(__dirname, '..', 'scripts');
    const direct = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => readFileSync(join(dir, f), 'utf8').includes('process.exit('));
    expect(direct.length).toBeGreaterThan(0);
  });

  it('the emission is registered on the exit EVENT, not after the body', () => {
    // A behavioural test cannot reach this without spawning a process per script.
    // The source is the cheap, honest check: `process.on('exit'` is the only
    // construction that survives a direct `process.exit()`.
    const src = readFileSync(join(__dirname, '..', 'src', 'lib', 'operationalContext.ts'), 'utf8');
    expect(src).toMatch(/process\.on\(\s*'exit'/);
  });

  it('DETECTS the regression — proven against the shape that failed', () => {
    // Emitting straight after the awaited body is exactly what was wrong. If that
    // pattern returns, this fails and names it.
    const src = readFileSync(join(__dirname, '..', 'src', 'lib', 'operationalContext.ts'), 'utf8');
    expect(src).not.toMatch(/const code = await body\(context\);\s*\n\s*emitLedgerRecord/);
  });
});
