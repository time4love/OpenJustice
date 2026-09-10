jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import * as evidencePredicates from '../../src/services/evidencePredicates';
import { DIFF_NAME } from '../helpers/corpusFixture';
import { resetDouble, store, written, writtenViaTx } from '../helpers/evidenceDouble';
import { built } from './absent';
import { CHECKS, type ThesisGateModule } from './contract';
import { AUTHOR, BOTH_EVIDENCE_MENTION, CITING_BOTH_VERSION, OPEN_GAP, OTHER_RESEARCHER, THESIS, TRAJECTORY_ID, VERSION } from './fixtures';
import { CURRENCIES, evidencePasses, seedPublishable, trajectoriesAre } from './gateWorld';
import {
  AS_PUBLISHED,
  MISSING_THESIS,
  ON_THE_FIXTURE,
  answerOf,
  call,
  codeSetEquality,
  containsDeep,
  handlerOf,
  objectsWhere,
  refusals,
  resetTools,
  seedThesis,
  tripped,
} from './tools';

// ---------------------------------------------------------------------------
// PUBLICATION AND WITHDRAWAL — docs/gf-thesis-flows.md T5 (:772–:789), T6
// (:903–:927) and A4 :1506–:1518, the R40 sketch §3b and §0e. THESIS STEP 23.
//
// NO ATTEMPT BEFORE THE GATE (§0e, on round-3 L2's ground): a PublicationAttempt's
// `rationale` and `assessment` are NON-NULL (A2 :1332–:1336), so a refusal decided
// before the assessor answers — NO_RESEARCHER, NO_THESIS, NOT_AUTHOR,
// REASON_REQUIRED, NOTHING_NEW — has no attempt to write, and a stranger's write on
// a thesis refuses (§9 :1001). Each writes NOTHING and spends nothing. The attempt
// "on every call" (§12 :1141) is every call that REACHES the gate; NOT_PUBLISHABLE
// and its attempt row sit past the assessor and are OWED to step 23.
//
// `check_publication_readiness` refuses no NO_RESEARCHER (7.1 round 2, L2): a GATED
// read's handler answers without an identity (flows A5 :1037–:1038). What each check
// row SAYS — check 15 "not asked" among them — is the gate's, 7.4's `gate.test.ts`.
// This file holds the tool's ANSWER (the R42 follow-up, M3; round 1, F1–F3): every
// check of A6 WHOLE — the first seventeen rows deep-equal to the gate's own
// `thesisChecks` (A4 :1507; one implementation, T5 :731) — over the evidence half
// stubbed as gate.test.ts stubs it; on a head that IS its published version, FLAGGED
// and STALE_TRAJECTORY reported as information (A6 :1610–:1611); writing nothing,
// and without a rationale spending nothing.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('check_publication_readiness — A4 :1506–:1508, GATED (thesis step 23)', () => {
  refusals('check_publication_readiness', [
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none — and an ANONYMOUS call reaches it, since a GATED read reads no caller',
      as: null,
      seed: seedThesis,
      input: { thesisId: MISSING_THESIS },
    },
  ]);

  it('WRITES NOTHING, and without a rationale SPENDS NOTHING — the assessor is asked only with one (A4 :1506–:1508)', async () => {
    seedThesis();
    answerOf(await call('check_publication_readiness', { thesisId: THESIS.id }, AUTHOR));
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  /** Every list anywhere in an answer, outermost first — the rows are A LIST, wherever the envelope puts it. */
  const listsIn = (haystack: unknown): unknown[][] => {
    if (Array.isArray(haystack)) return [haystack, ...haystack.flatMap(listsIn)];
    if (typeof haystack === 'object' && haystack !== null) return Object.values(haystack).flatMap(listsIn);
    return [];
  };

  /** Rows as a tool's JSON carries them — dates as ISO strings — so the gate's own rows compare with the answer's. */
  const asJson = (rows: readonly unknown[]): unknown[] => rows.map((row) => JSON.parse(JSON.stringify(row)) as unknown);

  it("ANSWERS every check of A6 WHOLE — a list whose first seventeen rows ARE thesisChecks(head, null)'s, deep-equal: pass/fail, what each examined, each failure's subject — one implementation, writing nothing (A4 :1507; T5 :731; A6 :1586)", async () => {
    // THE TOOL FIRST, so the case is red by name for step 23 and not for its world.
    await handlerOf('check_publication_readiness');
    const gate = await built<ThesisGateModule>('services/thesisGate', ['thesisChecks']);
    await seedPublishable();
    // The evidence half stubbed passing, as gate.test.ts's `gateOver` (:107) stubs it.
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(VERSION));
    trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
    const answer = answerOf(await call('check_publication_readiness', { thesisId: THESIS.id }, AUTHOR));
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
    // THE ONE SYMBOL's rows for the head with no rationale — asked AFTER the tool, so
    // "writes nothing" above is the tool's alone.
    const rows = asJson((await gate.thesisChecks(VERSION.id, null)).slice(0, CHECKS.length));
    expect(listsIn(answer).map((list) => list.slice(0, CHECKS.length))).toContainEqual(rows);
  });

  /**
   * What an answer REPORTS (A6 :1611) — by VALUE, the field's name the builder's
   * (contract.ts ThesisCheckRow): an object carrying the word as one of its VALUES, with
   * the citation inside it, or as a KEY whose value holds the citation. One spelling for
   * the case that must report and the case that must not (round 2, F5).
   */
  const reporter =
    (answer: unknown) =>
    (word: string, subject: string): boolean =>
      objectsWhere(answer, (o) => (Object.values(o).includes(word) && containsDeep(o, subject)) || (word in o && containsDeep(o[word], subject)))
        .length > 0;

  it('on a head that IS its published version, reports FLAGGED and STALE_TRAJECTORY as INFORMATION, each with its citation — writing nothing (A6 :1610–:1611)', async () => {
    await handlerOf('check_publication_readiness');
    await seedPublishable({ publishedAtHead: true, version: CITING_BOTH_VERSION });
    // The evidence half stubbed passing, as gate.test.ts's `gateOver` (:107) stubs it.
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(CITING_BOTH_VERSION));
    // The cited record WITHDRAWN after publication, and the newest pass DISAGREEING with the cited trajectory.
    store.evidenceRows = store.evidenceRows.map((row) => ({ ...row, status: 'WITHDRAWN' }));
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    // THE WORLD, CHECKED BEFORE THE TOOL IS ASKED: evidence's ONE symbol flags the
    // head's citation on this double, so the case is red for the tool alone.
    expect(await evidencePredicates.flagged(BOTH_EVIDENCE_MENTION.id)).toMatchObject({ flagged: true, reasons: ['WITHDRAWN'] });
    const reports = reporter(answerOf(await call('check_publication_readiness', { thesisId: THESIS.id }, AUTHOR)));
    expect({ FLAGGED: reports('FLAGGED', DIFF_NAME), STALE_TRAJECTORY: reports('STALE_TRAJECTORY', TRAJECTORY_ID) }).toEqual({
      FLAGGED: true,
      STALE_TRAJECTORY: true,
    });
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  it('the NEGATIVE CONTROL — the same published head, its record PROMOTED and current and its trajectory AGREED with by the newest pass, is reported as NEITHER word: the words fire on the state, never on the citation — writing nothing (A6 :1610–:1611; the precedent derivations.test.ts :738–:744)', async () => {
    // THE TOOL FIRST, so the case is red by name for step 23 and not for its world.
    await handlerOf('check_publication_readiness');
    await seedPublishable({ publishedAtHead: true, version: CITING_BOTH_VERSION });
    // The evidence half stubbed passing, as gate.test.ts's `gateOver` (:107) stubs it.
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(CITING_BOTH_VERSION));
    // The cited record left PROMOTED, and the newest pass AGREEING with the cited trajectory.
    trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
    // THE WORLD, CHECKED BEFORE THE TOOL IS ASKED: evidence's ONE symbol does NOT flag
    // the head's citation on this double, so a report of FLAGGED is the tool's alone.
    expect(await evidencePredicates.flagged(BOTH_EVIDENCE_MENTION.id)).toMatchObject({ flagged: false });
    const reports = reporter(answerOf(await call('check_publication_readiness', { thesisId: THESIS.id }, AUTHOR)));
    expect({ FLAGGED: reports('FLAGGED', DIFF_NAME), STALE_TRAJECTORY: reports('STALE_TRAJECTORY', TRAJECTORY_ID) }).toEqual({
      FLAGGED: false,
      STALE_TRAJECTORY: false,
    });
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  codeSetEquality('check_publication_readiness');
});

describe('publish_thesis — T5 :772–:789, A4 :1510–:1514, WRITE and paid (thesis step 23)', () => {
  const act = ON_THE_FIXTURE.publish_thesis;

  refusals('publish_thesis', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: act },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...act, thesisId: MISSING_THESIS },
    },
    {
      code: 'NOT_AUTHOR',
      why: "another researcher's thesis — and no attempt is written for a stranger (§0e)",
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: act,
    },
    {
      code: 'REASON_REQUIRED',
      why: 'a blank rationale — there is nothing to record',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...act, rationale: '   ' },
    },
    {
      code: 'NOTHING_NEW',
      why: 'the head IS the published version (T5 :746)',
      as: AUTHOR,
      seed: () => seedThesis(AS_PUBLISHED),
      input: act,
    },
  ]);

  codeSetEquality('publish_thesis');
});

describe('unpublish_thesis — T6 :903–:927, A4 :1516–:1518 (thesis step 23)', () => {
  const withdraw = ON_THE_FIXTURE.unpublish_thesis;
  const seedPublished = (): unknown => seedThesis(AS_PUBLISHED);

  refusals('unpublish_thesis', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedPublished, input: withdraw },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none',
      as: OTHER_RESEARCHER,
      seed: seedPublished,
      input: { ...withdraw, thesisId: MISSING_THESIS },
    },
    {
      code: 'NOT_AUTHOR',
      why: "another researcher's thesis — unpublishing is the author's act (T6 :926)",
      as: OTHER_RESEARCHER,
      seed: seedPublished,
      input: withdraw,
    },
    { code: 'NOT_PUBLISHED', why: 'nothing is published', as: AUTHOR, seed: seedThesis, input: withdraw },
    { code: 'REASON_REQUIRED', why: 'a blank reason', as: AUTHOR, seed: seedPublished, input: { ...withdraw, reason: ' ' } },
  ]);

  it('in ONE transaction: the pin to null and ONE Withdrawal naming the version, the reason and who — answering the version withdrawn (T6 :909–:912)', async () => {
    seedPublished();
    const out = answerOf(await call('unpublish_thesis', withdraw, AUTHOR));
    expect(written.map((w) => w.model).sort()).toEqual(['thesis', 'withdrawal']);
    expect(writtenViaTx).toEqual(written);
    expect(written.find((w) => w.model === 'thesis')?.data['publishedVersionId']).toBeNull();
    expect(written.find((w) => w.model === 'withdrawal')?.data).toMatchObject({
      thesisId: THESIS.id,
      versionId: VERSION.id,
      reason: withdraw['reason'],
      researcherId: AUTHOR,
    });
    expect(out['withdrawnVersionId']).toBe(VERSION.id);
  });

  it('deletes NOTHING — every version, mention, decision and framing row is still there (T6 :911)', async () => {
    seedPublished();
    store.gapDecisions = [{ ...OPEN_GAP }];
    const counts = (): number[] => [store.versions.length, store.mentions.length, store.gapDecisions.length, store.framings.length];
    const before = counts();
    answerOf(await call('unpublish_thesis', withdraw, AUTHOR));
    expect(counts()).toEqual(before);
  });

  codeSetEquality('unpublish_thesis');
});
