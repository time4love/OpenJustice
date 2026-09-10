jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { evidenceChecks } from '../../src/services/evidenceChecks';
import * as evidencePredicates from '../../src/services/evidencePredicates';
import type { VersionPublishableReport } from '../../src/services/evidencePredicates';
import { resetDouble, store, written } from '../helpers/evidenceDouble';
import { built } from './absent';
import {
  CHECKS,
  type PublicationAssessment,
  type ThesisCheckRow,
  type ThesisGateModule,
  type VersionPublishability,
} from './contract';
import { CITING_BOTH_VERSION, FRAMING, NEXT_VERSION, ROUNDS, THESIS, TRAJECTORY_ID, VERSION } from './fixtures';
import {
  CONJUNCTS_ALONE,
  CURRENCIES,
  EVIDENCE_FAILS,
  EVIDENCE_NOT_EVALUABLE,
  GAP_ID,
  PASSING,
  analysis,
  evidencePasses,
  gap,
  seedEvidenceHalf,
  seedPublishable,
  trajectoriesAre,
  trajectoriesUnresolved,
  type PublishableSeed,
} from './gateWorld';
import { containsDeep, resetTools, tripped } from './tools';

// ---------------------------------------------------------------------------
// A6 — THE GATE, CHECKS 1–17 BY ID AND KIND — docs/gf-thesis-flows.md A6
// (:1584–:1612), the R40 sketch §4. THESIS STEP 23 builds `services/thesisGate`.
//
// THE GATE MAPS ONE EVALUATION AND DOES NOT LOAD. `thesisChecks(versionId,
// assessment | null)` takes the publication assessor's answer as an INPUT, so no
// model is mocked and none is asked: `factories/LLMFactory` is the TRIPWIRE, and
// check 13's case holds that the gate spends nothing and runs no analysis.
//
// ONE IMPLEMENTATION: THE PREDICATE COMPOSES, THE GATE MAPS (A3 :1395–:1396). The
// agreement runs over §2's OWN fixtures (`gateWorld.ts`, shared with
// `derivations.test.ts`) and over the check-11 and check-12 fixtures, each ALONE (7.2
// round 1's condition). An evaluable evidence-half failure is asserted by its NAME —
// outside §2b (7.2 round 2, Q2). The NOT-evaluable report is asserted to leave
// PUBLISHABLE(v) false and to name nothing: what the gate's rows SAY of it is the §2b
// seam, the researcher's, and its case is not written.
//
// NOTHING IS SAID OF IDS BEYOND 17 — present or absent (sketch §6-9). Checks 18 and 19
// are the document plan's, added by addition; every assertion here reads the FIRST
// seventeen rows.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const gateModule = (): Promise<ThesisGateModule> => built<ThesisGateModule>('services/thesisGate', ['thesisChecks']);

/** A6's first seventeen rows — never a statement about the rows after them. */
const firstSeventeen = (rows: readonly ThesisCheckRow[]): readonly ThesisCheckRow[] => rows.slice(0, CHECKS.length);

const rowOf = (rows: readonly ThesisCheckRow[], id: string): ThesisCheckRow => {
  const held = firstSeventeen(rows).find((r) => r.id === id);
  if (held === undefined) throw new Error(`the gate rendered no ${id} among A6's first seventeen`);
  return held;
};

/** What BINDS: the hard checks that failed. Check 17 is advisory and binds nothing (A6 :1605–:1608). */
const hardFailures = (rows: readonly ThesisCheckRow[]): string[] =>
  firstSeventeen(rows)
    .filter((r) => r.kind === 'hard' && r.verdict === 'FAIL')
    .map((r) => r.id)
    .sort();

interface GateWorld {
  seed?: PublishableSeed;
  /** The assessor's answer; null is a readiness check asked without a rationale. */
  assessment?: PublicationAssessment | null;
  /** The evidence half, stubbed at `publishableEvidence` — every citation passing unless named. */
  half?: VersionPublishableReport;
  /** The trajectory resolver, stubbed — the newest pass agreeing unless named. */
  trajectories?: () => unknown;
  /** Anything the world needs after it is seeded. */
  arrange?: () => void;
}

/**
 * THE GATE'S WORLD. The module is loaded FIRST, so every case is red by name for step
 * 23; then §2's world, the evidence half and the trajectories as the case names them.
 */
async function gateOver(world: GateWorld = {}) {
  const gate = await gateModule();
  const seed = world.seed ?? {};
  const version = seed.version ?? VERSION;
  const p = await seedPublishable(seed);
  jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(world.half ?? evidencePasses(version));
  (world.trajectories ?? (() => trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES)))();
  world.arrange?.();
  const assessment = world.assessment === undefined ? PASSING : world.assessment;
  return { rows: await gate.thesisChecks(version.id, assessment), p, version };
}

/** The gate and PUBLISHABLE(v) over one world: what the gate fails hard is what the report names, and nothing else. */
async function agreement(world: GateWorld & { assessment?: PublicationAssessment }): Promise<VersionPublishability> {
  const { rows, p, version } = await gateOver(world);
  const report = await p.publishableVersion(version.id, world.assessment ?? PASSING);
  expect(hardFailures(rows)).toEqual([...report.failed].sort());
  expect(report.publishable).toBe(hardFailures(rows).length === 0);
  return report;
}

/** A failing row NAMES its subject — looked for by VALUE, never by a field name (A6 :1587–:1588). */
function expectFails(rows: readonly ThesisCheckRow[], check: string, subject: unknown): void {
  const row = rowOf(rows, check);
  expect(row.verdict).toBe('FAIL');
  expect(containsDeep(row.failures, subject)).toBe(true);
}

/** An empty scope says so: EXAMINED_NONE — not a pass — with `examined` present at ZERO (A6 :1588). */
function expectExaminedNone(rows: readonly ThesisCheckRow[], check: string): void {
  const row = rowOf(rows, check);
  expect(row.verdict).toBe('EXAMINED_NONE');
  expect(row.examined).toEqual([]);
}

describe('A6 — the first seventeen checks, by id and by kind (thesis step 23)', () => {
  it("the first seventeen rows are A6's ids in A6's order, by EQUALITY with contract.ts's CHECKS (A6 :1591–:1601)", async () => {
    const { rows } = await gateOver();
    expect(firstSeventeen(rows).map((r) => r.id)).toEqual(CHECKS.map((c) => c.name));
  });

  it('sixteen are HARD and one ADVISORY — check 17 — by equality; no row carries a binding flag (A6 :1605–:1608)', async () => {
    const { rows } = await gateOver();
    expect(firstSeventeen(rows).map((r) => r.kind)).toEqual(CHECKS.map((c) => c.kind));
    expect(CHECKS.filter((c) => c.kind === 'advisory').map((c) => c.id)).toEqual([17]);
    expect(firstSeventeen(rows).filter((r) => Object.keys(r).some((k) => /binding/i.test(k)))).toEqual([]);
  });

  it("rows 5–10 ARE evidenceChecks(versionId)'s rows, deep-equal, from ONE call — asserted as values, never as a count of calls (sketch §4, round-3 L6; A6 :1589)", async () => {
    // THE WORLD, CHECKED BEFORE THE MODULE IS ASKED FOR: the evidence half UN-STUBBED
    // over the double passes all six today, so this case is red for the gate alone.
    seedEvidenceHalf();
    const expected = await evidenceChecks(VERSION.id);
    expect(expected.map((c) => [c.id, c.verdict])).toEqual(CHECKS.slice(4, 10).map((c) => [c.name, 'PASS']));
    const gate = await gateModule();
    await seedPublishable();
    seedEvidenceHalf();
    expect(firstSeventeen(await gate.thesisChecks(VERSION.id, PASSING)).slice(4, 10)).toEqual(expected);
  });
});

describe('an empty scope says so — EXAMINED_NONE, `examined` present at zero (A6 :1588; sketch §4) (thesis step 23)', () => {
  it('checks 11 and 12 over a version citing NO trajectory (round-3 L7)', async () => {
    const { rows } = await gateOver();
    expectExaminedNone(rows, 'TRAJECTORIES_RESOLVE');
    expectExaminedNone(rows, 'TRAJECTORIES_CURRENT');
  });

  it('check 14 over NO gaps — zero examined, never a pass by omission', async () => {
    const { rows } = await gateOver({ seed: { gaps: [] } });
    expectExaminedNone(rows, 'GAPS_DECIDED');
  });

  it('check 15 with NO rationale — the assessor was not asked', async () => {
    const { rows } = await gateOver({ assessment: null });
    expectExaminedNone(rows, 'RATIONALE_SUBSTANCE');
  });
});

describe('one FAIL per check, each naming its subject (A6 :1587–:1588; sketch §4) (thesis step 23)', () => {
  it('1 HEAD_VERSION — the head IS the published version: publishing it is NOTHING_NEW (T5 :746)', async () => {
    const { rows } = await gateOver({ seed: { publishedAtHead: true } });
    expectFails(rows, 'HEAD_VERSION', VERSION.id);
  });

  it('2 CLAIM_FRAMED — the framing chose the claim with no ASSESSED round before it, and the failure names the framing', async () => {
    const { rows } = await gateOver({ seed: { rounds: ROUNDS.filter((r) => r.type !== 'ASSESSED') } });
    expectFails(rows, 'CLAIM_FRAMED', FRAMING.id);
  });

  it('3 CITES_EVIDENCE — a version citing no record (A6 :1203 assigns it here, not to the evidence six)', async () => {
    const { rows } = await gateOver({ seed: { version: NEXT_VERSION } });
    expectFails(rows, 'CITES_EVIDENCE', NEXT_VERSION.id);
  });

  it('4 PUBLIC_INTEREST_STATEMENT — the thesis has none', async () => {
    const { rows } = await gateOver({ seed: { statement: null } });
    expectFails(rows, 'PUBLIC_INTEREST_STATEMENT', THESIS.id);
  });

  it('11 TRAJECTORIES_RESOLVE — a cited trajectory no pass stored, named', async () => {
    const { rows } = await gateOver({ seed: { version: CITING_BOTH_VERSION }, trajectories: trajectoriesUnresolved });
    expectFails(rows, 'TRAJECTORIES_RESOLVE', TRAJECTORY_ID);
  });

  it('12 TRAJECTORIES_CURRENT — a cited trajectory the newest pass DISAGREES with, named', async () => {
    const { rows } = await gateOver({
      seed: { version: CITING_BOTH_VERSION },
      trajectories: () => trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES),
    });
    expectFails(rows, 'TRAJECTORIES_CURRENT', TRAJECTORY_ID);
  });

  it('13 ANALYSIS_CURRENT — the only analysis is stale; and the gate SPENDS NOTHING and RUNS NONE (sketch §4)', async () => {
    const { rows } = await gateOver({
      seed: { analysed: false },
      arrange: () => {
        store.analyses = [analysis('a-fingerprint-that-moved')];
      },
    });
    expectFails(rows, 'ANALYSIS_CURRENT', VERSION.id);
    expect(tripped).toEqual([]);
    expect(written).toEqual([]);
  });

  it('14 GAPS_DECIDED — a gap reading OPEN, named', async () => {
    const { rows } = await gateOver({ seed: { gaps: [gap(1, 'OPEN')] } });
    expectFails(rows, 'GAPS_DECIDED', GAP_ID);
  });

  it('15 RATIONALE_SUBSTANCE — the assessor found no substance in the rationale for this version', async () => {
    const { rows } = await gateOver({ assessment: { ...PASSING, substance: false } });
    expectFails(rows, 'RATIONALE_SUBSTANCE', VERSION.id);
  });

  it('17 ALLEGATIONS_FRAMED is ADVISORY — an assessment finding the claims not framed as allegations FAILS 17, and the version is STILL publishable (A6 :1601; T5 :758)', async () => {
    const assessment = { ...PASSING, allegationsFramed: false };
    const { rows, p } = await gateOver({ assessment });
    expect(rowOf(rows, 'ALLEGATIONS_FRAMED')).toMatchObject({ kind: 'advisory', verdict: 'FAIL' });
    expect(hardFailures(rows)).toEqual([]);
    expect((await p.publishableVersion(VERSION.id, assessment)).publishable).toBe(true);
  });
});

describe('names-vacuity', () => {
  // THESIS A7 :1655–:1657: "a version naming a known person fails NAMES_NO_PERSON, and
  // the passing report names how many names it examined — a pass that examined
  // nothing says zero, never nothing". Check 16's FAIL case is this describe's first.
  it('an assessment listing a known person FAILS 16 NAMES_NO_PERSON, and names them (thesis step 23)', async () => {
    const { rows } = await gateOver({ assessment: { ...PASSING, names: ['ישראל ישראלי'] } });
    expectFails(rows, 'NAMES_NO_PERSON', 'ישראל ישראלי');
  });

  it('a PASSING report says how many names it examined — ZERO, never nothing (thesis step 23)', async () => {
    const { rows } = await gateOver();
    const row = rowOf(rows, 'NAMES_NO_PERSON');
    expect(row.verdict).toBe('PASS');
    expect(row.examined).toEqual([]);
  });
});

describe('the gate and PUBLISHABLE(v) agree on every fixture — one implementation, the predicate composes and the gate maps (sketch §4; A3 :1395–:1396) (thesis step 23)', () => {
  it('every conjunct true: the gate fails nothing hard, and the version is publishable', async () => {
    expect(await agreement({})).toEqual({ publishable: true, failed: [] });
  });

  it('every conjunct true on a version citing a trajectory the newest pass AGREES with', async () => {
    expect(await agreement({ seed: { version: CITING_BOTH_VERSION } })).toEqual({ publishable: true, failed: [] });
  });

  it('the evidence half failing — a WITHDRAWN record — both name EVIDENCE_NOT_WITHDRAWN (an evaluable failure\'s VALUE, outside §2b: 7.2 round 2, Q2)', async () => {
    expect((await agreement({ half: EVIDENCE_FAILS })).failed).toEqual(['EVIDENCE_NOT_WITHDRAWN']);
  });

  it("the evidence half NOT evaluable: PUBLISHABLE(v) is not publishable and NO name is asserted; the gate's rows 5–10 are evidenceChecks' own for it — what the rows SAY of it is the §2b seam, the researcher's", async () => {
    const { rows, p } = await gateOver({ half: EVIDENCE_NOT_EVALUABLE });
    expect(firstSeventeen(rows).slice(4, 10)).toEqual(await evidenceChecks(VERSION.id));
    expect((await p.publishableVersion(VERSION.id, PASSING)).publishable).toBe(false);
  });

  for (const [what, seed, assessment, check] of CONJUNCTS_ALONE) {
    it(`${what} ALONE — the gate fails ${check} and nothing else hard, and PUBLISHABLE(v) names it`, async () => {
      expect((await agreement({ seed, assessment })).failed).toEqual([check]);
    });
  }

  // The check-11 and check-12 fixtures (7.2 round 1, Q2's condition): CITING_BOTH_VERSION,
  // so the record half and every other conjunct stay true while the trajectory fails.
  const TRAJECTORIES_ALONE: readonly (readonly [string, () => unknown, string])[] = [
    ['a cited trajectory no pass stored', trajectoriesUnresolved, 'TRAJECTORIES_RESOLVE'],
    ['a cited trajectory the newest pass DISAGREES with', () => trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES), 'TRAJECTORIES_CURRENT'],
  ];
  for (const [what, trajectories, check] of TRAJECTORIES_ALONE) {
    it(`${what} ALONE — the gate fails ${check} and nothing else hard, and PUBLISHABLE(v) names it`, async () => {
      expect((await agreement({ seed: { version: CITING_BOTH_VERSION }, trajectories })).failed).toEqual([check]);
    });
  }
});
