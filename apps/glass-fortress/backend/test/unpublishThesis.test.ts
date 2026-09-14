jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { unpublishThesisHandler } from '../src/mcp/tools/unpublishThesis';
import { WRITE_TRANSACTION } from '../src/walk/pageLog';
import { db, resetDouble, rolledBack, store, windows, written, writtenViaTx } from './helpers/evidenceDouble';
import { AUTHOR, THESIS, VERSION } from './thesis/fixtures';
import { AS_PUBLISHED, actAs, committed, resetTools, seedThesis, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// unpublish_thesis — what `test/thesis/publication.test.ts` cannot see. docs/gf-thesis-flows.md T6 :903–:927, A4
// :1516–:1518, §12 :1135; the R49 sketch §b3, §f3. Thesis step 23.
//
//   THE ONE NULLING ARM   all three pin columns null in ONE compare-and-set, with ONE Withdrawal, ONE transaction
//   THE LOST RACE         another withdrawal won between the read and the write → NOT_PUBLISHED, nothing committed
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

const REASON = 'נמצאה טעות בציטוט';

const withdraw = async (): Promise<Record<string, unknown>> => {
  actAs(AUTHOR);
  return JSON.parse(await unpublishThesisHandler({ thesisId: THESIS.id, reason: REASON })) as Record<string, unknown>;
};

describe('unpublish_thesis — the one nulling arm the design allows (T6 :909; §12 :1135)', () => {
  it('nulls publishedVersionId, publishedAt AND publishedById in ONE updateMany, then ONE Withdrawal, in ONE windowed transaction — and nothing else', async () => {
    seedThesis({ ...AS_PUBLISHED, publicInterestStatement: 'עניין ציבורי מובהק' });

    const out = await withdraw();

    expect(written.map((w) => [w.model, w.op])).toEqual([
      ['thesis', 'updateMany'],
      ['withdrawal', 'create'],
    ]);
    expect(writtenViaTx).toEqual(written);
    expect(windows).toEqual([WRITE_TRANSACTION]);
    expect(written.at(0)?.data).toEqual({ publishedVersionId: null, publishedAt: null, publishedById: null });
    expect(store.thesis).toMatchObject({
      publishedVersionId: null,
      publishedAt: null,
      publishedById: null,
      headVersionId: VERSION.id,
      publicInterestStatement: 'עניין ציבורי מובהק',
    });
    const withdrawal = written.at(1)?.data ?? {};
    expect(withdrawal).toMatchObject({ thesisId: THESIS.id, versionId: VERSION.id, reason: REASON, researcherId: AUTHOR });
    expect(out).toEqual({
      thesisId: THESIS.id,
      withdrawnVersionId: VERSION.id,
      withdrawnAt: (withdrawal['createdAt'] as Date).toISOString(),
    });
    expect(tripped).toEqual([]);
  });

  it('another withdrawal WON between the read and the write → NOT_PUBLISHED, and the transaction commits nothing', async () => {
    // The store already holds the thesis withdrawn; this call's read answered it as it was before.
    seedThesis();
    db.thesis.findUnique.mockImplementationOnce(() => Promise.resolve({ ...THESIS, ...AS_PUBLISHED }));

    const out = await withdraw();

    expect(out).toEqual({ code: 'NOT_PUBLISHED', error: expect.stringMatching(/nothing to withdraw/) as unknown });
    expect(windows).toEqual([WRITE_TRANSACTION]);
    expect(committed()).toEqual([]);
    expect(store.withdrawals).toEqual([]);
    expect(rolledBack).toEqual([]);
  });
});
