jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { createThesisHandler } from '../src/mcp/tools/createThesis';
import { resolveCitations, writeThesisVersion } from '../src/services/thesisVersionWrite';
import { CURRENT_VERSION, DIFF_NAME } from './helpers/corpusFixture';
import { db, resetDouble, store, written } from './helpers/evidenceDouble';
import { AUTHOR, CLAIM, FRAMING, PROVISION, ROUNDS, THESIS, TRAJECTORY_ID, VERSION, VERSION_TEXT } from './thesis/fixtures';
import { actAs, committed, resetTools, seedCorpus, seedThesis, textCiting } from './thesis/tools';

// ---------------------------------------------------------------------------
// THE VERSION WRITE'S RACES AND ONE-CALL PROPERTIES — what the acceptance suite cannot see.
// docs/gf-thesis-flows.md T2 :420–:421, :443–:449; A2 :1297; the R47 sketch §b3, chunk 2 step 6.
//
// IN THE UNIT PROJECT, which gates (the step-18 record §7). Each case holds a property that a case of
// `test/thesis/versionWrite.test.ts` is SATISFIABLE WITHOUT:
//
//   the head's compare-and-set   `:346–:353`' STALE_HEAD is refused by the tool's pre-read alone, so a write
//                                that moved the head from ANY head would pass it. Here the service is handed a
//                                head that moved after the read, and only the compare-and-set can refuse.
//   the framing's compare-and-set  `FRAMING_ATTACHED` there is the tool's read of `framing.thesisId`.
//   ONE createMany               the evidence writer map allows `create` and `createMany` alike; the source scan
//                                in `thesisGuards.test.ts` is the instrument of record, and this counts the call.
//   the claim VERBATIM           `CLAIM_MISMATCH` there is a wholly different claim; a trim would pass it.
//   #doc_'s words                `expectRefusal` holds a non-empty error, never its words (R47 §9-17).
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

const CITATIONS = [
  { kind: 'EVIDENCE' as const, name: DIFF_NAME, current: CURRENT_VERSION.contentVersionHash },
  { kind: 'TRAJECTORY' as const, name: TRAJECTORY_ID },
];

describe('the head moves only from the head the write was made against', () => {
  it('a head that moved after the read refuses STALE_HEAD naming the head that won — and commits nothing', async () => {
    seedThesis();
    // Another write landed between this write's read (VERSION) and its transaction.
    store.theses = store.theses.map((t) => ({ ...t, headVersionId: 'version-that-won' }));
    const out = await writeThesisVersion({
      researcherId: AUTHOR,
      text: VERSION_TEXT,
      claim: CLAIM,
      citations: CITATIONS,
      target: { kind: 'EXISTING', thesisId: THESIS.id, expectedHeadVersionId: VERSION.id },
    });
    expect(out).toEqual({ code: 'STALE_HEAD', error: expect.stringContaining('version-that-won') as unknown });
    expect(committed()).toEqual([]);
    expect(store.theses.find((t) => t['id'] === THESIS.id)?.['headVersionId']).toBe('version-that-won');
  });
});

describe('a framing attaches to one thesis, once', () => {
  it('a framing attached after the read refuses FRAMING_ATTACHED — the new thesis and its version commit nothing', async () => {
    seedCorpus();
    store.framings = [{ ...FRAMING, thesisId: 'thesis-that-won' }];
    store.framingRounds = [...ROUNDS];
    const out = await writeThesisVersion({
      researcherId: AUTHOR,
      text: VERSION_TEXT,
      claim: CLAIM,
      citations: CITATIONS,
      target: { kind: 'NEW', provision: PROVISION, framingId: FRAMING.id },
    });
    expect(out).toMatchObject({ code: 'FRAMING_ATTACHED' });
    expect(committed()).toEqual([]);
    expect(store.theses).toEqual([]);
  });
});

describe("a version's mentions are ONE write", () => {
  it('N citations are ONE createMany of N rows, and no create', async () => {
    seedThesis();
    const out = await writeThesisVersion({
      researcherId: AUTHOR,
      text: VERSION_TEXT,
      claim: CLAIM,
      citations: CITATIONS,
      target: { kind: 'EXISTING', thesisId: THESIS.id, expectedHeadVersionId: VERSION.id },
    });
    expect(out).toMatchObject({ mentions: [{ name: DIFF_NAME }, { name: TRAJECTORY_ID }] });
    expect(db.thesisMention.createMany).toHaveBeenCalledTimes(1);
    expect(db.thesisMention.create).not.toHaveBeenCalled();
    expect(written.filter((w) => w.model === 'thesisMention')).toHaveLength(2);
  });
});

describe('the claim is compared VERBATIM (R47 §6-R3)', () => {
  it('a claim differing from the CHOSEN one by a trailing space refuses CLAIM_MISMATCH', async () => {
    seedCorpus();
    store.framings = [{ ...FRAMING, thesisId: null }];
    store.framingRounds = [...ROUNDS];
    actAs(AUTHOR);
    const out: unknown = JSON.parse(
      await createThesisHandler({ claim: `${CLAIM} `, provision: PROVISION, text: VERSION_TEXT, framingId: FRAMING.id }),
    );
    expect(out).toMatchObject({ code: 'CLAIM_MISMATCH' });
  });
});

describe('the version stores the claim VERBATIM (T2 :451–:453)', () => {
  it('a claim with a trailing space is written WITH it — the EXISTING path compares no framing, so only the row can say', async () => {
    seedThesis();
    const out = await writeThesisVersion({
      researcherId: AUTHOR,
      text: VERSION_TEXT,
      claim: `${CLAIM} `,
      citations: CITATIONS,
      target: { kind: 'EXISTING', thesisId: THESIS.id, expectedHeadVersionId: VERSION.id },
    });
    expect(out).toMatchObject({ thesisId: THESIS.id });
    expect(written.find((w) => w.model === 'thesisVersion')?.data['claim']).toBe(`${CLAIM} `);
  });
});

// AMENDED AT DOCUMENT STEP 33, DECLARED (plan :243 turns this arm into a citation; R81 Q1 keeps its code): the case held
// the world BEFORE step 33, where every `#doc_` was refused naming the step. Since step 33 a `#doc_` is a DOCUMENT citation,
// and one naming no document still refuses NOT_A_RECORD — T2's one word — now naming the token it could not resolve.
describe('#doc_ naming no document (document plan step 33 :245; R81 Q1)', () => {
  it('refuses NOT_A_RECORD with an error that names the token', async () => {
    const token = `#doc_0x${'ab'.repeat(32)}`;
    const out = await resolveCitations(textCiting(token));
    expect(out).toEqual({ code: 'NOT_A_RECORD', error: expect.stringContaining(token) as unknown });
  });
});
