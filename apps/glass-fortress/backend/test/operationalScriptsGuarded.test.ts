import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// EVERY OPERATIONAL SCRIPT RUNS THROUGH THE GUARD, AND NONE CAN OPT OUT.
//
// A SOURCE SCAN, NOT A BEHAVIOUR TEST, and the distinction is the whole point.
// A behaviour test proves that the twenty scripts written today call the guard;
// it says nothing about the twenty-first. `scriptsLoadEnvFirst` exists because
// one rule had sixteen implementations and four of them were wrong — three of
// which WROTE — and the fix for that class is a scan, not four repairs.
//
// WHAT MAKES IT MORE THAN A GREP. `runOperationalScript` takes the script's body
// as a VALUE, so the body cannot execute before the context has been asserted.
// There is no ordering to get wrong and nothing to forget: a file that reaches
// its work at all has already passed the guard. What the scan holds is that no
// script invents a second way in — a bare `main()` beside the wrapper would run
// unguarded, and would look entirely ordinary in review.
//
// IT MUST NOT APPLY TO THE SERVER OR TO TESTS. `npm run dev` and the suite never
// touch an operational path, and a guard that demanded RAILWAY_DEPLOYMENT_ID of
// them would stop all local development — so the last case asserts the module's
// reach directly rather than leaving it to be true by accident.
// ---------------------------------------------------------------------------

const BACKEND = join(__dirname, '..');
const SCRIPTS = join(BACKEND, 'scripts');

/** Compiled operational scripts. `.js` files here are not TypeScript sources. */
const files = readdirSync(SCRIPTS).filter((f) => f.endsWith('.ts'));

function source(file: string): string {
  return readFileSync(join(SCRIPTS, file), 'utf8');
}

describe('every operational script is guarded', () => {
  it('finds the scripts at all — a silent zero would make this vacuous', () => {
    // Twenty at the time of writing. A collapse to zero means the directory
    // moved or the pattern broke, which would turn every case below into a pass
    // that proves nothing.
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it.each(files)('%s imports the shared guard', (file) => {
    expect(source(file)).toContain("from '../src/lib/operationalContext'");
  });

  it.each(files)('%s runs its body through the guard', (file) => {
    expect(source(file)).toContain('runOperationalScript(main)');
  });

  it.each(files)('%s does not invoke main() outside the guard', (file) => {
    // `void main();` and `main().catch(...)` are the shapes every one of these
    // files used before the wrapper existed, and either one left beside the
    // wrapper would run the script's work with nothing asserted first.
    // Its DECLARATION is `function main(`; an invocation is anything else
    // followed by a call. `runOperationalScript(main)` passes it as a value and
    // never calls it here, so it does not match at all.
    const invocations = [...source(file).matchAll(/(?<!function\s)\bmain\s*\(/g)];
    expect(invocations.map((m) => m[0])).toEqual([]);
  });
});

describe('the guard reaches operational scripts and nothing else', () => {
  it('is imported by no server or service module', () => {
    // A `src/` importer would put the requirement on the running service, which
    // has RAILWAY_DEPLOYMENT_ID but takes no `--env` — so it would refuse to
    // boot. It would also put it on `npm run dev` and on the suite, neither of
    // which touches an operational path.
    const offenders = walk(join(BACKEND, 'src')).filter(
      (path) =>
        !path.endsWith(join('lib', 'operationalContext.ts')) &&
        readFileSync(path, 'utf8').includes('operationalContext'),
    );
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('a check that examined nothing refuses to pass', () => {
  // ONE RULE, THREE CHECKS. `auditDiffSurvival` said it first — "No diffs found.
  // This report says nothing; it is not a pass." — and `auditOnChainAnchors` guards
  // `subjects === 0`. `confirmAnchors` had no such arm until 2026-08-30, and its
  // empty run exited 0, which the public integrity board scored as full proof.
  //
  // A source scan rather than three behavioural tests, because the property is
  // "every check has this arm", and only reading the sources can say that.
  const CHECKS = [
    ['scripts', 'auditDiffSurvival.ts'],
    ['scripts', 'auditOnChainAnchors.ts'],
  ];

  it.each(CHECKS.map((p) => [p.join('/'), p] as const))(
    '%s refuses an empty subject set',
    (_label, parts) => {
      const code = readFileSync(join(__dirname, '..', ...parts), 'utf8');
      expect(code).toMatch(/(total === 0|subjects === 0)/);
    },
  );

  it('confirmAnchors refuses it in its exit code, where its verdict lives', () => {
    // It has no `main`-level guard because its verdict is computed by a pure
    // function the script exits with. The arm belongs there, and a test that only
    // grepped the script would have missed it and passed.
    const code = readFileSync(join(__dirname, '..', 'src', 'services', 'confirmAnchors.ts'), 'utf8');
    expect(code).toMatch(/report\.examined === 0/);
  });
});
