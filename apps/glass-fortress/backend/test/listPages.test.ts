jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { listPagesHandler } from '../src/mcp/tools/listPages';
import { OUTCOMES } from '../src/walk/derivations';
import { DIFF_NAME, DIFF_ROW, PAGE, URL } from './helpers/corpusFixture';
import { asked, resetDouble, store, written } from './helpers/evidenceDouble';
import { AUTHOR } from './thesis/fixtures';
import { actAs, resetTools, seedCorpus, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// list_pages — the read that names the pages the corpus holds (the step-19 record's F3; the researcher's
// ruling of 2026-09-14). IN THE UNIT PROJECT, which gates.
//
// The double holds ONE page (the corpus fixture's) and ONE work-list row, so the cases hold the SHAPE: every
// outcome present at zero where none, the total, the URL as every other read names it, the same bytes with
// and without an identity, nothing written, nothing spent.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

const parse = (out: string): Record<string, unknown>[] => JSON.parse(out) as Record<string, unknown>[];
const zeros = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));

describe('list_pages — every surveyed page with its outcomes counted', () => {
  it('answers the same bytes with and without an identity; writes and spends nothing', async () => {
    seedCorpus();
    actAs(null);
    const anonymous = await listPagesHandler();
    actAs(AUTHOR);
    expect(await listPagesHandler()).toBe(anonymous);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  it('names the page by its exact URL and counts its ACQUIRED row, every other outcome present at zero', async () => {
    seedCorpus();
    const list = parse(await listPagesHandler());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ url: URL, total: 1, outcomes: { ...zeros, ACQUIRED: 1 } });
    expect(Object.keys(list[0]?.['outcomes'] as object).sort()).toEqual([...OUTCOMES].sort());
  });

  it('a SKIPPED row counts under SKIPPED, and ACQUIRED stays zero — what the corpus holds is the ACQUIRED count', async () => {
    seedCorpus({ acquired: false });
    const list = parse(await listPagesHandler());
    expect(list[0]).toMatchObject({ total: 1, outcomes: { ...zeros, SKIPPED: 1 } });
  });

  it("asks the work-list rows BY PAGE — the where names the page's id (the double holds one page and one row, so an unscoped read would answer the same bytes; the call is what it can see)", async () => {
    seedCorpus();
    await listPagesHandler();
    expect(asked.filter((a) => a.model === 'cdxIndexEntry').map((a) => a.args)).toEqual([
      expect.objectContaining({ where: { trackedUrlId: PAGE.id } }),
    ]);
  });

  // -------------------------------------------------------------------------
  // THE THREE FIELDS THE ENVELOPE ADDS — docs/gf-interaction-flows.md A5 :1071, RULED 2026-09-20 (R66 „Q2 add
  // fields”). Each is a FIELD THE READ VIEW NEEDS and none is a rule this read invents: `trackedUrlId` is the
  // id the gated routes take (#488), `public` is `publicPage` CALLED, `stopPending` is `pendingStopOf` CALLED.
  // -------------------------------------------------------------------------

  it('names the page by its trackedUrlId too, because the read view\'s routes take the id and never the URL (#488)', async () => {
    seedCorpus();
    const list = parse(await listPagesHandler());
    expect(list[0]).toMatchObject({ trackedUrlId: PAGE.id, url: URL });
  });

  it('says whether the page is PUBLIC — false while no published thesis cites it, true once one does', async () => {
    seedCorpus();
    expect(parse(await listPagesHandler())[0]).toMatchObject({ public: false });
    // PUBLIC_PAGE's own two arms, seeded as `test/evidence/corpusReads.test.ts` seeds them: a promoted record
    // OF THIS PAGE, cited by a version that was EVER PUBLISHED (`EVER_PUBLISHED` — a PublicationAttempt with
    // outcome PUBLISHED). Neither arm is spelled here; `publicPage` is what decides.
    store.evidenceRows = [{ id: 'evidence-1', fileHash: DIFF_NAME, snapshot: null, urlVersionDiff: { ...DIFF_ROW, trackedUrlId: PAGE.id } }];
    store.mentions = [{ id: 'mention-1', versionId: 'version-1', kind: 'EVIDENCE', name: DIFF_NAME, thesisVersion: { thesisId: 'thesis-1', isPublished: { id: 'thesis-1' } } }];
    store.attempts = [{ id: 'attempt-1', versionId: 'version-1', outcome: 'PUBLISHED' }];
    expect(parse(await listPagesHandler())[0]).toMatchObject({ public: true });
  });

  it('says stopPending through pendingStopOf: a PENDING row carrying a stop is pending; the ACQUIRED row is not', async () => {
    seedCorpus();
    expect(parse(await listPagesHandler())[0]).toMatchObject({ stopPending: false });
    store.workList = {
      ...(store.workList as Record<string, unknown>),
      status: 'PENDING_JUDGEMENT',
      stop: { gates: [{ gate: 2, material: { chunk: 'a sentence the walk could not judge' } }] },
    };
    expect(parse(await listPagesHandler())[0]).toMatchObject({ stopPending: true, outcomes: { ...zeros, PENDING_JUDGEMENT: 1 } });
  });

  it('a PENDING row with NO stop is awaiting evaluation and is NOT a pending stop — the distinction walk/stop.ts draws', async () => {
    seedCorpus();
    store.workList = { ...(store.workList as Record<string, unknown>), status: 'PENDING_JUDGEMENT', stop: null };
    expect(parse(await listPagesHandler())[0]).toMatchObject({ stopPending: false });
  });

  it('a page with no work-list row says it examined ZERO rows — never nothing', async () => {
    store.workList = null;
    const list = parse(await listPagesHandler());
    expect(list[0]).toMatchObject({ url: URL, total: 0, outcomes: zeros });
  });
});
