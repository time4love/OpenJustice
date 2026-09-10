jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { resetDouble, store, written, writtenViaTx } from '../helpers/evidenceDouble';
import { AUTHOR, OPEN_GAP, OTHER_RESEARCHER, THESIS, VERSION } from './fixtures';
import {
  AS_PUBLISHED,
  MISSING_THESIS,
  ON_THE_FIXTURE,
  answerOf,
  call,
  codeSetEquality,
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
// read's handler answers without an identity (flows A5 :1037–:1038). What its checks
// RENDER — check 15 "not asked", FLAGGED and STALE_TRAJECTORY as information — is the
// gate's row shape, 7.4's `gate.test.ts`; this file holds that it writes nothing and,
// without a rationale, spends nothing.
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
