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
    // Sixteen at evidence step 11a, twenty-five before it. NINE OPERATIONAL
    // SCRIPTS WERE RETIRED IN ONE COMMIT — reclassify, resummarize,
    // rehash-evidence, rediff, measure-divergence, audit-survival,
    // backfill-survival, confirm-anchors and measure-gate5 — each of which read
    // the legacy columns evidence A2 removes, or read receipts where §8 reads
    // chain state. The floor moves WITH the tree and never below it: its job is
    // to catch a broken glob, not to assert a count, and a floor left at twenty
    // would have been the assertion weakened to pass.
    // Fifteen in the document third of the legacy switch; sixteen after the
    // evidence third, twenty-five before it. `entities:canonicalise` went with
    // `lib/targetEntity.ts`, whose subject — the canonical entity an evidence row
    // names — is a column evidence A2 removes. The floor moves WITH the tree and
    // never below it: its job is to catch a broken glob, not to assert a count.
    expect(files.length).toBeGreaterThanOrEqual(15);
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
  // ONE RULE, ONE CHECK LEFT — and the shrinking is the record, not an erosion.
  // `auditDiffSurvival` said it first ("No diffs found. This report says nothing;
  // it is not a pass.") and `confirmAnchors` had no such arm until 2026-08-30,
  // when its empty run exited 0 and the public integrity board scored that as
  // full proof. Both instruments were retired at evidence step 11a — the first
  // reads the legacy survival columns evidence A2 removes, the second reads
  // receipts where §8 reads chain state — so `auditOnChainAnchors` is the one
  // subject this rule still has.
  //
  // IT IS RESTATED, NOT WEAKENED. `forensics:audit-evidence` and every later
  // instrument lands under this rule at 11b (evidence A7), and the list is where
  // it is added. A source scan rather than a behavioural test, because the
  // property is "every check has this arm", and only reading the sources can say
  // that.
  const CHECKS = [['scripts', 'auditOnChainAnchors.ts']];

  it('finds the checks at all — a silent zero would make this vacuous', () => {
    expect(CHECKS.length).toBeGreaterThan(0);
  });

  it.each(CHECKS.map((p) => [p.join('/'), p] as const))(
    '%s refuses an empty subject set',
    (_label, parts) => {
      const code = readFileSync(join(__dirname, '..', ...parts), 'utf8');
      expect(code).toMatch(/(total === 0|subjects === 0)/);
    },
  );
});
