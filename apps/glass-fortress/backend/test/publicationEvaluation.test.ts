jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { join } from 'node:path';
import * as evidenceChecks from '../src/services/evidenceChecks';
import type { EvidenceCheck } from '../src/services/evidenceChecks';
import * as evidencePredicates from '../src/services/evidencePredicates';
import { publishabilityOf, evaluatePublication } from '../src/services/publicationEvaluation';
import * as thesisPredicates from '../src/services/thesisPredicates';
import { thesisChecks } from '../src/services/thesisGate';
import { resetDouble, store } from './helpers/evidenceDouble';
import { CHECKS } from './thesis/contract';
import { THESIS, VERSION, WITHDRAWAL } from './thesis/fixtures';
import { CURRENCIES, DECIDED, PASSING, evidencePasses, gap, seedPublishable, trajectoriesAre } from './thesis/gateWorld';
import { resetTools, tripped } from './thesis/tools';
import { SRC, codeOf, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// THE ONE EVALUATION OF PUBLISHABLE(v) — thesis step 23, the R49 sketch §e1, §e2 and §6 R9, R12, R13, R16.
// docs/gf-thesis-flows.md A3 :1390–:1396, A6 :1584–:1612.
//
// IN THE UNIT PROJECT, which gates. Each case holds what `test/thesis/gate.test.ts` is satisfiable without:
//
//   rows 5–10 are `checksOf`'s     the acceptance case compares VALUES, which a re-spelled fold would equal too
//   the evidence half asked ONCE   the acceptance worlds cannot count the calls behind one answer
//   17 binds nothing in the fold   the acceptance case holds the gate's rows and the predicate apart
//   a CITED gap whose citation     every acceptance gap is OPEN or DISMISSED
//     left reads OPEN at 14
//   a WITHDRAWN head fails 1       no acceptance world holds a withdrawal on the head (R16)
//   ONE declaration of the fold    a second `publishabilityOf` would agree with the first on every fixture
//   the call-time cycle            `thesisPredicates → publicationEvaluation → criticMaterial → thesisPredicates`
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The gate's world as `gate.test.ts` builds it: the evidence half stubbed passing, the newest pass agreeing. */
async function world(over: Parameters<typeof seedPublishable>[0] = {}): Promise<void> {
  await seedPublishable(over);
  jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(VERSION));
  trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
}

const rowOf = <R extends { id: string }>(rows: readonly R[], id: string): R => {
  const row = rows.find((r) => r.id === id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row;
};

describe('the one evaluation — the gate maps it and the predicate folds it', () => {
  it("rows 5–10 ARE `checksOf`'s answer — a stub at that one symbol reaches the gate unchanged (never a re-spelled fold)", async () => {
    await world();
    const sentinel: EvidenceCheck[] = CHECKS.slice(4, 10).map((c) => ({
      id: c.name as EvidenceCheck['id'],
      kind: 'hard',
      verdict: 'PASS',
      examined: [{ mentionId: 'SENTINEL-FROM-checksOf', fileHash: 'SENTINEL', contentVersionHash: null }],
      failures: [],
    }));
    const mapped = jest.spyOn(evidenceChecks, 'checksOf').mockReturnValue(sentinel);
    const rows = await thesisChecks(VERSION.id, PASSING);
    expect(rows.slice(4, 10)).toEqual(sentinel);
    expect(mapped).toHaveBeenCalledTimes(1);
  });

  it('the evidence half is asked ONCE per `thesisChecks`, for THIS version', async () => {
    await world();
    const half = jest.mocked(evidencePredicates.publishableEvidence);
    await thesisChecks(VERSION.id, PASSING);
    expect(half.mock.calls).toEqual([[VERSION.id]]);
    expect(tripped).toEqual([]);
  });

  it('the fold binds on HARD failures only — check 17 failing leaves the version publishable and `failed` empty', async () => {
    await world();
    const evaluation = await evaluatePublication(VERSION.id, { ...PASSING, allegationsFramed: false });
    expect(publishabilityOf(evaluation)).toEqual({ publishable: true, failed: [] });
  });

  it('a gap in force CITED whose citation left the version READS OPEN at 14 — GAP_LIST called, never `inForce.decision`', async () => {
    const citedAway = gap(2, 'CITED', { citedName: `0x${'ee'.repeat(32)}` });
    await world({ gaps: [DECIDED, citedAway] });
    const rows = await thesisChecks(VERSION.id, PASSING);
    expect(rowOf(rows, 'GAPS_DECIDED')).toMatchObject({ verdict: 'FAIL', failures: [{ gapId: citedAway.gapId, readsAs: 'OPEN' }] });
  });

  // H1 (REVIEW, chunk 2): row 14's verdict is `gapsDecided`'s, never a filter of its own. Each case stubs the predicate to
  // DISAGREE with the list it read; a row that re-derived the verdict from the list would answer FAIL or PASS silently, and
  // the loud guard must throw instead. The negative control stubs it AGREEING and sees the ordinary FAIL.
  it('H1 — check 14 consults `gapsDecided`: decided over an entry reading OPEN is a disagreement, and THROWS', async () => {
    await world({ gaps: [gap(1, 'OPEN')] });
    jest.spyOn(thesisPredicates, 'gapsDecided').mockReturnValue({ decided: true, examined: 1 });
    await expect(thesisChecks(VERSION.id, PASSING)).rejects.toThrow('GAPS_DECIDED answers decided=true while 1 gap(s)');
  });

  it('H1 — undecided over a list with NO entry reading OPEN is the other disagreement, and THROWS', async () => {
    await world({ gaps: [DECIDED] });
    jest.spyOn(thesisPredicates, 'gapsDecided').mockReturnValue({ decided: false, examined: 1 });
    await expect(thesisChecks(VERSION.id, PASSING)).rejects.toThrow('GAPS_DECIDED answers decided=false while 0 gap(s)');
  });

  it('H1 — the NEGATIVE CONTROL: the predicate agreeing (undecided, an entry OPEN) FAILS 14 naming the gap, and is asked', async () => {
    await world({ gaps: [gap(1, 'OPEN')] });
    const asked = jest.spyOn(thesisPredicates, 'gapsDecided');
    const rows = await thesisChecks(VERSION.id, PASSING);
    expect(rowOf(rows, 'GAPS_DECIDED')).toMatchObject({ verdict: 'FAIL', failures: [{ readsAs: 'OPEN' }] });
    expect(asked).toHaveBeenCalled();
  });

  it("R16 — a head named by a Withdrawal FAILS 1 HEAD_VERSION, subject the version, 'withdrawn — write a new version'", async () => {
    await world();
    store.withdrawals = [{ ...WITHDRAWAL, thesisId: THESIS.id, versionId: VERSION.id }];
    const rows = await thesisChecks(VERSION.id, PASSING);
    const head = rowOf(rows, 'HEAD_VERSION');
    expect(head).toMatchObject({ verdict: 'FAIL', failures: [expect.objectContaining({ versionId: VERSION.id }) as unknown] });
    expect(JSON.stringify(head.failures)).toContain('withdrawn — write a new version');
    expect(publishabilityOf(await evaluatePublication(VERSION.id, PASSING)).failed).toEqual(['HEAD_VERSION']);
  });

  it('the NEGATIVE CONTROL — the same head with a withdrawal of ANOTHER version passes 1', async () => {
    await world();
    store.withdrawals = [{ ...WITHDRAWAL, thesisId: THESIS.id, versionId: 'version-withdrawn-earlier' }];
    expect(rowOf(await thesisChecks(VERSION.id, PASSING), 'HEAD_VERSION')).toMatchObject({ verdict: 'PASS' });
  });
});

describe('`publishabilityOf` is declared in exactly ONE module (R9)', () => {
  const DECLARES = /\b(?:function\s+publishabilityOf\s*[<(]|(?:const|let|var)\s+publishabilityOf\s*[:=])/;

  it('services/publicationEvaluation.ts, and no other module under src/', () => {
    const declaring = tsFiles(SRC)
      .filter((file) => DECLARES.test(readCode(file)))
      .map((file) => file.slice(SRC.length + 1));
    expect(declaring).toEqual([join('services', 'publicationEvaluation.ts')]);
  });

  it('DETECTS a declaration in either spelling — and a call, a type and a comment do not fire', () => {
    expect(DECLARES.test('export function publishabilityOf(evaluation: E) { return fold(evaluation); }')).toBe(true);
    expect(DECLARES.test('const publishabilityOf = (e: E) => fold(e);')).toBe(true);
    expect(DECLARES.test('const verdict = publishabilityOf(evaluation);')).toBe(false);
    expect(DECLARES.test('type V = ReturnType<typeof publishabilityOf>;')).toBe(false);
    expect(DECLARES.test(codeOf('// a second function publishabilityOf( would drift\nconst x = 1;'))).toBe(false);
  });

  // THE FOLD'S RULE, NOT ONLY ITS NAME (the R49 chunk-3 review, M2): "the HARD rows that FAIL" is spelled in the one
  // module that folds. A caller that needs the failed checks reads `publishabilityOf(…).failed`; a second filter would
  // be a second fold under another name, free to disagree about check 17.
  // "Hard" is spelled two ways — `=== 'hard'` and `!== 'advisory'` — so the pattern takes both, in either order.
  const HARD = String.raw`kind\s*(?:===\s*'hard'|!==\s*'advisory')`;
  const FAIL = String.raw`verdict\s*===\s*'FAIL'`;
  const FILTERS_HARD_FAILURES = new RegExp(String.raw`\b${HARD}\s*&&\s*\w+\.${FAIL}|\b${FAIL}\s*&&\s*\w+\.${HARD}`);

  it("the hard-FAIL filter is spelled in services/publicationEvaluation.ts, and no other module under src/", () => {
    const spelling = tsFiles(SRC)
      .filter((file) => FILTERS_HARD_FAILURES.test(readCode(file)))
      .map((file) => file.slice(SRC.length + 1));
    expect(spelling).toEqual([join('services', 'publicationEvaluation.ts')]);
  });

  it('DETECTS the filter in either order — and a filter on one field, a `failed` read and a comment do not fire', () => {
    expect(FILTERS_HARD_FAILURES.test(".filter((row) => row.kind === 'hard' && row.verdict === 'FAIL')")).toBe(true);
    expect(FILTERS_HARD_FAILURES.test(".filter((r) => r.verdict === 'FAIL' && r.kind === 'hard')")).toBe(true);
    expect(FILTERS_HARD_FAILURES.test(".filter((r) => r.kind !== 'advisory' && r.verdict === 'FAIL')")).toBe(true);
    expect(FILTERS_HARD_FAILURES.test(".filter((r) => r.verdict === 'FAIL' && r.kind !== 'advisory')")).toBe(true);
    expect(FILTERS_HARD_FAILURES.test(".filter((c) => c.verdict === 'FAIL')")).toBe(false);
    expect(FILTERS_HARD_FAILURES.test('const { failed } = publishabilityOf(evaluation);')).toBe(false);
    expect(FILTERS_HARD_FAILURES.test(codeOf("// never r.kind === 'hard' && r.verdict === 'FAIL' twice\nconst x = 1;"))).toBe(false);
  });
});

describe('the call-time cycle thesisPredicates → publicationEvaluation → criticMaterial → thesisPredicates (R13)', () => {
  type Loaded = Readonly<Record<string, unknown>>;
  const load = (path: string): Loaded => require(path) as Loaded;

  const expectWhole = (predicates: Loaded, critic: Loaded, evaluation: Loaded): void => {
    expect({
      publishableVersion: typeof predicates['publishableVersion'],
      fingerprint: typeof predicates['fingerprint'],
      trajectoryCurrent: typeof predicates['trajectoryCurrent'],
      CRITIC_PROMPT_VERSION: typeof predicates['CRITIC_PROMPT_VERSION'],
      headFingerprint: typeof critic['headFingerprint'],
      evaluatePublication: typeof evaluation['evaluatePublication'],
      publishabilityOf: typeof evaluation['publishabilityOf'],
    }).toEqual({
      publishableVersion: 'function',
      fingerprint: 'function',
      trajectoryCurrent: 'function',
      CRITIC_PROMPT_VERSION: 'string',
      headFingerprint: 'function',
      evaluatePublication: 'function',
      publishabilityOf: 'function',
    });
  };

  it('thesisPredicates loaded FIRST: every export of the three modules defined and of its kind', () => {
    jest.isolateModules(() => {
      const predicates = load('../src/services/thesisPredicates');
      expectWhole(predicates, load('../src/services/criticMaterial'), load('../src/services/publicationEvaluation'));
    });
  });

  it('criticMaterial loaded FIRST: the same', () => {
    jest.isolateModules(() => {
      const critic = load('../src/services/criticMaterial');
      expectWhole(load('../src/services/thesisPredicates'), critic, load('../src/services/publicationEvaluation'));
    });
  });
});
