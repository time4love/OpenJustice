jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { AFTER, URL } from '../helpers/corpusFixture';
import { resetDouble, store, written } from '../helpers/evidenceDouble';
import { AUTHOR, FRAMING, OTHER_RESEARCHER, PROVISION, ROUNDS, THESIS } from './fixtures';
import {
  AS_PUBLISHED,
  MISSING_FRAMING,
  MISSING_THESIS,
  NAMES_THE_DIFF,
  ON_THE_FIXTURE,
  UNKNOWN_TRAJECTORY,
  answerOf,
  call,
  codeSetEquality,
  containsDeep,
  objectsWhere,
  refusals,
  resetTools,
  seedCorpus,
  seedThesis,
  tripped,
} from './tools';

// ---------------------------------------------------------------------------
// T1's FOUR TOOLS — docs/gf-thesis-flows.md T1 and A4 :1434–:1460, the R40 sketch
// §3b. THESIS STEP 19 builds them, and every case is red by name until it does.
//
// Every refusal case asserts §3a's four things and each tool's code set is policed
// by an equality (`test/thesis/tools.ts` states both once). The framing tools'
// order is NO_RESEARCHER · NO_FRAMING · NOT_YOURS (Q2; NO_FRAMING coined, §6-12);
// `open_framing` on a thesis refuses NO_THESIS and NOT_AUTHOR as the other thesis
// writes do. Every NO_THESIS and NO_FRAMING case is asked by ANOTHER researcher, so
// it holds the order too: a missing row is named missing, never someone else's.
//
// NOTHING PAST A MODEL. `assess_framing` is paid; its audit — PROPOSED verbatim,
// `quoteVerified`, `phraseVerified`, `filled`, ASSESSED with a verdict beside every
// assertion — is OWED to step 19 with the assessor mocked at its boundary (§8). Here
// the model factory is a TRIPWIRE: a refusal that reached it fails on "nothing spent".
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * An element no record fills — T1 :237–:240, "the provision's required record shapes
 * … each UNFILLED". A4 :1437 gives an element's records as `[] | MISSING`, so either
 * spelling of "none" is accepted and the case fixes neither.
 */
const allUnfilled = (elements: unknown): boolean =>
  Array.isArray(elements) &&
  elements.length > 0 &&
  objectsWhere(elements, (e) => 'records' in e).length === elements.length &&
  objectsWhere(elements, (e) => 'records' in e).every((e) => {
    const records = e['records'];
    return records === 'MISSING' || (Array.isArray(records) && records.length === 0);
  });

describe('open_framing — A4 :1434–:1440 (thesis step 19)', () => {
  const onTheThesis = ON_THE_FIXTURE.open_framing;
  /** A framing opened before any thesis exists (T1 :318–:322). */
  const unattached = { question: FRAMING.question, provision: PROVISION };

  refusals('open_framing', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: onTheThesis },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none — asked by ANOTHER researcher it is still NO_THESIS, never NOT_AUTHOR',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...onTheThesis, thesisId: MISSING_THESIS },
    },
    { code: 'NOT_AUTHOR', why: "framing another researcher's thesis", as: OTHER_RESEARCHER, seed: seedThesis, input: onTheThesis },
    {
      code: 'NO_PROVISION_SHAPE',
      why: 'a provision the table does not know',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...unattached, provision: 'NO_SUCH_PROVISION' },
    },
    {
      code: 'PUBLISHED',
      why: "the thesis's head IS its published version — frame the next version, not this (A4 :1438–:1439)",
      as: AUTHOR,
      seed: () => seedThesis(AS_PUBLISHED),
      input: onTheThesis,
    },
    {
      code: 'NO_SUCH_RUN',
      why: 'no ProsecutionRun exists (§10), so any run id',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...unattached, fromRunId: 'run-that-does-not-exist', clusterIndex: 0 },
    },
  ]);

  it('answers { framingId, question, provision, elements }, every element UNFILLED, and writes ONE Framing with no status and no closedAt (A4 :1437; T1 :237–:240; A2 :1300)', async () => {
    seedThesis();
    const out = answerOf(await call('open_framing', unattached, AUTHOR));
    expect(Object.keys(out).sort()).toEqual(['elements', 'framingId', 'provision', 'question']);
    expect(allUnfilled(out['elements'])).toBe(true);
    expect(written.map((w) => [w.model, w.op])).toEqual([['framing', 'create']]);
    expect(written.at(0)?.data).not.toHaveProperty('status');
    expect(written.at(0)?.data).not.toHaveProperty('closedAt');
  });

  it('opened ON a thesis, the Framing carries that thesisId — "set by … open_framing on a thesis" (A2 :1297)', async () => {
    seedThesis();
    answerOf(await call('open_framing', onTheThesis, AUTHOR));
    expect(written.map((w) => [w.model, w.data['thesisId']])).toEqual([['framing', THESIS.id]]);
  });

  codeSetEquality('open_framing');
});

describe('assess_framing — A4 :1442–:1450, WRITE and paid (thesis step 19)', () => {
  const round = ON_THE_FIXTURE.assess_framing;

  refusals('assess_framing', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: round },
    {
      code: 'NO_FRAMING',
      why: 'a framingId naming none — asked by ANOTHER researcher it is still NO_FRAMING, never NOT_YOURS (Q2)',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...round, framingId: MISSING_FRAMING },
    },
    { code: 'NOT_YOURS', why: "another researcher's framing (A4 :1449)", as: OTHER_RESEARCHER, seed: seedThesis, input: round },
    {
      code: 'NO_RECORDS',
      why: 'a round naming no record and no trajectory',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...round, records: [], trajectoryIds: [] },
    },
    {
      code: 'NOT_A_RECORD',
      why: 'a capture, named by page and timestamp, that the corpus does not hold',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...round, records: [{ url: URL, capture: '20000101000000' }] },
    },
    {
      code: 'NOT_ACQUIRED',
      why: 'a capture fetched and SKIPPED, never acquired — it does not speak',
      as: AUTHOR,
      seed: () => {
        seedThesis();
        seedCorpus({ acquired: false });
      },
      input: { ...round, records: [{ url: URL, capture: AFTER.waybackTimestamp }] },
    },
    {
      code: 'AWAITING_DERIVATION',
      why: 'a pair the walk owes a content version — no CURRENT to load — and the refusal NAMES the diff (A4 :1422–:1423)',
      names: NAMES_THE_DIFF,
      as: AUTHOR,
      seed: () => {
        seedThesis();
        seedCorpus({ derived: false });
      },
      input: round,
    },
    {
      code: 'UNKNOWN_TRAJECTORY_ID',
      why: 'a trajectory id no detection pass stored',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...round, trajectoryIds: [UNKNOWN_TRAJECTORY] },
    },
  ]);

  codeSetEquality('assess_framing');
});

describe('choose_framing — A4 :1452–:1456 (thesis step 19)', () => {
  const choice = ON_THE_FIXTURE.choose_framing;

  refusals('choose_framing', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: choice },
    {
      code: 'NO_FRAMING',
      why: 'a framingId naming none — never NOT_YOURS',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...choice, framingId: MISSING_FRAMING },
    },
    { code: 'NOT_YOURS', why: "another researcher's framing (A4 :1454)", as: OTHER_RESEARCHER, seed: seedThesis, input: choice },
    {
      code: 'NOT_ASSESSED',
      why: 'a framing with no ASSESSED round',
      as: AUTHOR,
      seed: () => {
        seedThesis();
        store.framingRounds = ROUNDS.filter((r) => r.type === 'PROPOSED');
      },
      input: choice,
    },
    {
      code: 'PROVISION_MISMATCH',
      why: 'the framing is attached to a thesis under a different provision — a different provision is a different thesis',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...choice, provision: 'NUREMBERG_10' },
    },
  ]);

  it("appends CHOSEN in the researcher's own words — the only row written (T1 :271–:272; A4 :1453)", async () => {
    seedThesis();
    const words = 'הניסוח של החוקר עצמו';
    answerOf(await call('choose_framing', { ...choice, claim: words }, AUTHOR));
    expect(written.map((w) => [w.model, w.op, w.data['type']])).toEqual([['framingRound', 'create', 'CHOSEN']]);
    expect(containsDeep(written.at(0)?.data['content'], words)).toBe(true);
  });

  codeSetEquality('choose_framing');
});

describe('get_framing — A4 :1458–:1459, GATED (thesis step 19)', () => {
  refusals('get_framing', [
    {
      code: 'NO_FRAMING',
      why: "a framingId naming none — a GATED read's handler answers without an identity, so an anonymous call reaches it (flows A5 :1037–:1038)",
      as: null,
      seed: seedThesis,
      input: { framingId: MISSING_FRAMING },
    },
  ]);

  it('answers the framing, every round in sequence, and the thesis it attaches to — to ANY researcher, writing nothing (A4 :1459; §9 :1002–:1004)', async () => {
    seedThesis();
    const answer = answerOf(await call('get_framing', { framingId: FRAMING.id }, OTHER_RESEARCHER));
    expect([FRAMING.id, THESIS.id].filter((id) => !containsDeep(answer, id))).toEqual([]);
    // A round as A2 shapes it (:1302–:1311): its sequence and its type.
    const rounds = objectsWhere(answer, (o) => 'sequence' in o && 'type' in o).map((o) => [o['sequence'], o['type']]);
    expect(rounds).toEqual(ROUNDS.map((r) => [r.sequence, r.type]));
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  codeSetEquality('get_framing');
});
