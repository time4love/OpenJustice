jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { Prisma } from '@prisma/client';
import { decideGapHandler, type DecideGapInput } from '../src/mcp/tools/decideGap';
import { DIFF_NAME } from './helpers/corpusFixture';
import { db, resetDouble, store, written } from './helpers/evidenceDouble';
import { AUTHOR, OPEN_GAP, THESIS } from './thesis/fixtures';
import { actAs, committed, resetTools, seedThesis, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// decide_gap — what `test/thesis/analysis.test.ts` cannot see. docs/gf-thesis-flows.md T4 :625–:646, A2 :1320–:1330,
// A4 :1488–:1494 as amended; the R48 sketch §b2, §f2, §6-R25, D4–D7.
//
// IN THE UNIT PROJECT, which gates:
//
//   THE RACE        the acceptance STALE_SEQUENCE is satisfiable by the pre-read alone. Here the read answers the log
//                   ONCE as it stood (a one-shot `findMany`, `reaffirmDuringTheWrite`'s shape) and a decision at the
//                   next sequence is already held — only the unique index, which the double MODELS, can refuse
//   the disagree arm and a call naming neither — NO_SUCH_GAP's other two arms
//   each decision writes ONLY its own field; a gap decided by id carries the words it ENTERED with
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const decide = async (input: Partial<DecideGapInput>): Promise<Record<string, unknown>> => {
  actAs(AUTHOR);
  return JSON.parse(
    await decideGapHandler({ thesisId: THESIS.id, decision: 'OPEN', expectedSequence: OPEN_GAP.sequence, gapId: OPEN_GAP.gapId, ...input }),
  ) as Record<string, unknown>;
};

const seedGapped = (): void => {
  seedThesis();
  store.gapDecisions = [{ ...OPEN_GAP }];
};

describe('the race — the compare-and-set is the unique index, not the pre-read', () => {
  it('a decision landing at the next sequence between the read and the create → STALE_SEQUENCE, the actual unknown and said — nothing committed', async () => {
    seedGapped();
    // THE OTHER DECISION IS ALREADY HELD when this call creates; this call's read answered the log before it landed.
    store.gapDecisions = [{ ...OPEN_GAP }, { ...OPEN_GAP, id: 'decided-first', sequence: 2, decision: 'DISMISSED', reason: 'קודם' }];
    db.thesisGapDecision.findMany.mockImplementationOnce(() => Promise.resolve([{ ...OPEN_GAP }]));

    const out = await decide({ decision: 'CONCEDED', reason: 'נודה בכך' });

    expect(out).toEqual({ code: 'STALE_SEQUENCE', error: expect.stringContaining('moved between this call') as unknown });
    expect(committed()).toEqual([]);
  });

  it('a decision against a log already past it refuses STALE_SEQUENCE NAMING where the log stands — before any create', async () => {
    seedGapped();
    store.gapDecisions = [{ ...OPEN_GAP }, { ...OPEN_GAP, id: 'decided-first', sequence: 2, decision: 'DISMISSED', reason: 'קודם' }];
    const out = await decide({ decision: 'CONCEDED', reason: 'נודה בכך' });
    expect(out).toEqual({ code: 'STALE_SEQUENCE', error: expect.stringContaining('is at sequence 2 and this call expected 1') as unknown });
    expect(written).toEqual([]);
  });

  it('a unique violation on ANOTHER index propagates — never read as the log having moved', async () => {
    seedGapped();
    db.thesisGapDecision.create.mockImplementationOnce(() =>
      Promise.reject(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x', meta: { target: ['id'] } })),
    );
    actAs(AUTHOR);
    await expect(
      decideGapHandler({ thesisId: THESIS.id, gapId: OPEN_GAP.gapId, decision: 'DISMISSED', reason: 'לא', expectedSequence: 1 }),
    ).rejects.toThrow('unique');
  });
});

describe('NO_SUCH_GAP — the ruled arms the acceptance case does not reach', () => {
  it('a gapId and a description that DISAGREE refuse — a re-worded description is a new gap', async () => {
    seedGapped();
    expect(await decide({ description: 'מסמך אחר לגמרי' })).toMatchObject({ code: 'NO_SUCH_GAP' });
    expect(written).toEqual([]);
  });

  it('a gapId with an AGREEING description ENTERS the list when the log does not hold it — the description names the gap, the row carries it verbatim', async () => {
    seedThesis();
    const description = `  ${OPEN_GAP.description}\n`;
    expect(await decide({ description, expectedSequence: 0 })).toEqual({ gapId: OPEN_GAP.gapId, decision: 'OPEN', sequence: 1 });
    expect(written.map((w) => [w.model, w.data['description'], w.data['sequence']])).toEqual([['thesisGapDecision', description, 1]]);
  });

  it('a call naming NEITHER a gapId nor a description refuses', async () => {
    seedGapped();
    expect(await decide({ gapId: undefined, description: undefined })).toMatchObject({ code: 'NO_SUCH_GAP' });
  });

  it('negative control: a gapId and the SAME description re-spaced agree, and the decision is written', async () => {
    seedGapped();
    expect(await decide({ description: `  ${OPEN_GAP.description}\n`, decision: 'DISMISSED', reason: 'לא רלוונטי' })).toMatchObject({
      gapId: OPEN_GAP.gapId,
      sequence: 2,
    });
  });
});

describe('each decision writes ONLY its own field (R48 D6), and the gap\'s own words (D7)', () => {
  it('CITED writes its record\'s name and NOT the reason sent beside it — and no pin', async () => {
    seedGapped();
    await decide({ decision: 'CITED', citedName: DIFF_NAME, reason: 'נשלח בטעות' });
    const row = written.find((w) => w.model === 'thesisGapDecision')?.data ?? {};
    expect([row['citedName'], 'reason' in row, 'request' in row, 'callItem' in row]).toEqual([DIFF_NAME, false, false, false]);
  });

  it('OPEN writes none of the four', async () => {
    seedGapped();
    await decide({ decision: 'OPEN', reason: 'x', citedName: DIFF_NAME });
    const row = written.find((w) => w.model === 'thesisGapDecision')?.data ?? {};
    expect(['citedName', 'reason', 'request', 'callItem'].filter((k) => k in row)).toEqual([]);
  });

  it('a gap decided by id carries the description it ENTERED with, verbatim, and the HEAD it was decided on', async () => {
    seedGapped();
    await decide({ decision: 'DISMISSED', reason: 'לא רלוונטי' });
    expect(written.find((w) => w.model === 'thesisGapDecision')?.data).toMatchObject({
      description: OPEN_GAP.description,
      versionId: THESIS.headVersionId,
      sequence: 2,
    });
  });

  it('a REQUESTED request with a BLANK authority refuses REQUEST_REQUIRED; a CALLED item with a blank unit refuses CALL_ITEM_REQUIRED', async () => {
    seedGapped();
    const request = { text: 'בקשה', authority: '  ', legalBasis: 'חוק חופש המידע', addresses: [], restsOn: [] };
    const callItem = { whatIsNeeded: 'פרוטוקול', whoWouldHaveSeenIt: 'הצוות', unit: '', window: '2022-08' };
    expect([
      (await decide({ decision: 'REQUESTED', request }))['code'],
      (await decide({ decision: 'CALLED', callItem }))['code'],
    ]).toEqual(['REQUEST_REQUIRED', 'CALL_ITEM_REQUIRED']);
    expect(tripped).toEqual([]);
  });
});
