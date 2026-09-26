jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { checkPublicationReadinessHandler } from '../src/mcp/tools/checkPublicationReadiness';
import * as evidencePredicates from '../src/services/evidencePredicates';
import * as publicationAssessor from '../src/services/publicationAssessor';
import type { PublicationAssessorOutput } from '../src/services/publicationAssessor';
import * as publicationEvaluation from '../src/services/publicationEvaluation';
import { TRAJECTORY_ID, AUTHOR, CITING_BOTH_VERSION, THESIS, VERSION } from './thesis/fixtures';
import { resetDouble, written } from './helpers/evidenceDouble';
import { CURRENCIES, evidencePasses, seedPublishable, trajectoriesAre } from './thesis/gateWorld';
import { actAs, resetTools, seedThesis, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// check_publication_readiness — what `test/thesis/publication.test.ts` cannot see. docs/gf-thesis-flows.md A4
// :1506–:1508, A6 :1610–:1611; the R49 sketch §b1, §f3. Thesis step 23.
//
// IN THE UNIT PROJECT, which gates, with the assessor STUBBED AT ITS ONE DRAW (`assess`) and the factory a tripwire:
//
//   ONE evaluation           the rows and `publishable` from ONE `evaluatePublication` — a second evaluation reddens
//   the no-head thesis       a LOUD GUARD, never an answer (D1)
//   the paid path            with a rationale ONE draw, its answer labelled, nothing written; without one, nothing spent
//   STALE_TRAJECTORY         read from the currency, even when the evaluation's check 12 passes (D2; step 17 §8's warning)
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const OUTPUT: PublicationAssessorOutput = {
  rationaleHasSubstance: true,
  substanceGaps: [],
  verdict: 'DISPUTES',
  objection: 'הנימוק מסייג את מה שהטקסט קובע',
  names: [],
  allegationsFramed: true,
  allegationsNote: '',
  assessment: 'הנימוק בעל ממש אך אינו תואם את הטקסט.',
};

const readiness = async (input: { thesisId: string; rationale?: string }): Promise<Record<string, unknown>> => {
  actAs(AUTHOR);
  return JSON.parse(await checkPublicationReadinessHandler(input)) as Record<string, unknown>;
};

/** A publishable head: the evidence half stubbed passing, as `gate.test.ts`'s `gateOver` stubs it. */
const seedReadyHead = async (version = VERSION, publishedAtHead = false): Promise<void> => {
  await seedPublishable({ version, publishedAtHead });
  jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(version));
};

const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;

describe('check_publication_readiness — ONE evaluation, mapped and folded (the R49 sketch §b1, R9)', () => {
  it('calls evaluatePublication ONCE, and answers the rows and `publishable` of THAT value', async () => {
    await seedReadyHead();
    trajectoriesAre(CURRENCIES.PINNED_IS_LATEST);
    const evaluate = jest.spyOn(publicationEvaluation, 'evaluatePublication');

    const out = await readiness({ thesisId: THESIS.id });

    // The third argument since document step 34 (the researcher's Q1): the head cites no document, so the tool ASKED and
    // the answer is empty — nothing reached the chain.
    expect(evaluate.mock.calls).toEqual([[VERSION.id, null, { asked: true, byCommitment: new Map() }]]);
    const evaluation = await (evaluate.mock.results.at(0)?.value as ReturnType<typeof publicationEvaluation.evaluatePublication>);
    expect(out).toMatchObject({
      thesisId: THESIS.id,
      versionId: VERSION.id,
      checks: asJson(publicationEvaluation.rowsOf(evaluation)),
      publishable: publicationEvaluation.publishabilityOf(evaluation).publishable,
      assessment: null,
      information: null,
    });
    expect(out['publishable']).toBe(true);
    expect([written, tripped]).toEqual([[], []]);
  });

  it('a thesis with NO head THROWS — a malformed row, never a state to grade — and nothing is spent (D1)', async () => {
    seedThesis({ headVersionId: null });
    const draw = jest.spyOn(publicationAssessor, 'assess');
    await expect(readiness({ thesisId: THESIS.id, rationale: 'נימוק' })).rejects.toThrow(/no head version/);
    expect([draw.mock.calls.length, written, tripped]).toEqual([0, [], []]);
  });
});

describe('check_publication_readiness — paid IFF a rationale, and writes nothing either way (A4 :1506–:1508; ruling Q3)', () => {
  it("with a rationale: ONE draw over the material, the assessment returned LABELLED as the assessor's opinion, its projection graded — and nothing written", async () => {
    await seedReadyHead();
    trajectoriesAre(CURRENCIES.PINNED_IS_LATEST);
    const draw = jest.spyOn(publicationAssessor, 'assess').mockResolvedValue(OUTPUT);
    const evaluate = jest.spyOn(publicationEvaluation, 'evaluatePublication');

    const out = await readiness({ thesisId: THESIS.id, rationale: 'הנימוק לפרסום' });

    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls.at(0)?.[0]).toMatchObject({ text: VERSION.text, rationale: 'הנימוק לפרסום' });
    expect(evaluate.mock.calls).toEqual([[VERSION.id, publicationAssessor.projectionOf(OUTPUT), { asked: true, byCommitment: new Map() }]]);
    expect(out['assessment']).toEqual({ labelled: "the publication assessor's opinion", ...OUTPUT });
    expect([written, tripped]).toEqual([[], []]);
  });

  it.each([
    ['no rationale', undefined],
    ['a blank rationale', '   '],
  ])('with %s: no draw, the assessor-fed rows EXAMINED_NONE, assessment null', async (_title, rationale) => {
    await seedReadyHead();
    trajectoriesAre(CURRENCIES.PINNED_IS_LATEST);
    const draw = jest.spyOn(publicationAssessor, 'assess');

    const out = await readiness({ thesisId: THESIS.id, ...(rationale === undefined ? {} : { rationale }) });

    expect(draw).not.toHaveBeenCalled();
    expect(out['assessment']).toBeNull();
    const verdicts = (out['checks'] as { id: string; verdict: string }[])
      .filter((row) => ['RATIONALE_SUBSTANCE', 'NAMES_NO_PERSON', 'ALLEGATIONS_FRAMED'].includes(row.id))
      .map((row) => row.verdict);
    expect(verdicts).toEqual(['EXAMINED_NONE', 'EXAMINED_NONE', 'EXAMINED_NONE']);
    expect([written, tripped]).toEqual([[], []]);
  });
});

describe('check_publication_readiness — FLAGGED and STALE_TRAJECTORY as information, from their own predicates (A6 :1610–:1611; D2)', () => {
  it("reports STALE_TRAJECTORY from the ONE resolver's currency even when the evaluation's check 12 PASSES — never read off the row", async () => {
    await seedReadyHead(CITING_BOTH_VERSION, true);
    // THE EVALUATION as the gate would compute it while the newest pass AGREED — check 12 passes in it —
    trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
    const agreed = await publicationEvaluation.evaluatePublication(CITING_BOTH_VERSION.id, null);
    expect(publicationEvaluation.rowsOf(agreed).find((row) => row.id === 'TRAJECTORIES_CURRENT')?.verdict).toBe('PASS');
    jest.spyOn(publicationEvaluation, 'evaluatePublication').mockResolvedValue(agreed);
    // — and the newest pass DISAGREEING by the time the information is read.
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);

    const out = await readiness({ thesisId: THESIS.id });

    expect(out['information']).toEqual({
      FLAGGED: [],
      STALE_TRAJECTORY: [{ name: TRAJECTORY_ID, currency: CURRENCIES.RECOMPUTED_DISAGREES }],
    });
    expect([written, tripped]).toEqual([[], []]);
  });

  it('a head that is NOT the published version carries no information — null, not two empty lists', async () => {
    await seedReadyHead(CITING_BOTH_VERSION, false);
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    expect((await readiness({ thesisId: THESIS.id }))['information']).toBeNull();
  });
});
