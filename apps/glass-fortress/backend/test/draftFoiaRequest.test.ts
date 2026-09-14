jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { draftFoiaRequestHandler } from '../src/mcp/tools/draftFoiaRequest';
import * as foiaDrafter from '../src/services/foiaDrafter';
import type { DraftInput, FoiaDraft } from '../src/services/foiaDrafter';
import { DIFF_NAME } from './helpers/corpusFixture';
import { resetDouble, store, written } from './helpers/evidenceDouble';
import { AUTHOR, OPEN_GAP, THESIS, VERSION_TEXT } from './thesis/fixtures';
import { actAs, resetTools, seedThesis, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// draft_foia_request's PAID PATH — what `test/thesis/analysis.test.ts` cannot see. docs/gf-thesis-flows.md T4
// :654–:683, A4 :1496–:1499; the R48 sketch §b3, §f2, §6-R20, §6-R25.
//
// IN THE UNIT PROJECT, which gates, with the drafter STUBBED AT ITS ONE EXPORT, `draftRequest`:
//
//   WRITES NOTHING          a request is not state (T4 :656) — not the draft, not the draw
//   what it is HANDED       each cited record's computed content AND the paragraphs citing it, labelled
//   the ADDRESSES           the platform's code table by the authority named, never the model's — none for an unknown one
//   the LABELS              `restsOn` resolved to names; a label the call did not hand is returned, never dropped
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const DRAFT: FoiaDraft = {
  text: 'לכבוד הממונה על חופש המידע … {{REQUESTER_NAME}} {{DATE}}',
  authority: 'משרד הבריאות',
  legalBasis: 'חוק חופש המידע, התשנ"ח-1998, סעיף 7(א)',
  restsOn: ['[1]', '[7]'],
};

const draft = async (): Promise<Record<string, unknown>> => {
  seedThesis();
  store.gapDecisions = [{ ...OPEN_GAP }];
  actAs(AUTHOR);
  return JSON.parse(await draftFoiaRequestHandler({ thesisId: THESIS.id, gapId: OPEN_GAP.gapId })) as Record<string, unknown>;
};

describe('draft_foia_request — one draw, nothing written (T4 :663–:671)', () => {
  it('draws ONCE, WRITES NOTHING, and answers the five keys with the addresses from the code table and the labels resolved', async () => {
    const drafter = jest.spyOn(foiaDrafter, 'draftRequest').mockResolvedValue(DRAFT);

    const out = await draft();

    expect(drafter).toHaveBeenCalledTimes(1);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
    expect(out).toEqual({
      text: DRAFT.text,
      authority: 'משרד הבריאות',
      legalBasis: DRAFT.legalBasis,
      addresses: ['chofesh.mida@moh.health.gov.il', 'רחוב בן טבאי 2, ירושלים 9101002'],
      restsOn: [DIFF_NAME],
      unresolvedLabels: ['[7]'],
    });
  });

  it('the drafter is handed the gap, the claim, and each citation\'s computed content WITH the paragraphs of the head that cite it', async () => {
    const drafter = jest.spyOn(foiaDrafter, 'draftRequest').mockResolvedValue(DRAFT);

    await draft();

    const material: DraftInput | undefined = drafter.mock.calls.at(0)?.[0];
    expect(material?.gap).toEqual({ gapId: OPEN_GAP.gapId, description: OPEN_GAP.description, readsAs: 'OPEN' });
    expect(material?.records).toEqual([
      expect.objectContaining({
        label: '[1]',
        name: DIFF_NAME,
        kind: 'DIFF',
        chunks: [{ side: 'REMOVED', text: 'הטקסט שהוסר' }, { side: 'ADDED', text: 'הטקסט שנוסף' }],
        passages: [VERSION_TEXT.trim()],
      }),
    ]);
  });

  it('an authority the code table does not know gets NO address — never a guessed one', async () => {
    jest.spyOn(foiaDrafter, 'draftRequest').mockResolvedValue({ ...DRAFT, authority: 'רשות שאינה בטבלה', restsOn: [] });
    expect(await draft()).toMatchObject({ addresses: [], restsOn: [], unresolvedLabels: [] });
  });

  it('a draw that throws writes nothing', async () => {
    jest.spyOn(foiaDrafter, 'draftRequest').mockRejectedValue(new Error('the provider failed'));
    await expect(draft()).rejects.toThrow('the provider failed');
    expect(written).toEqual([]);
  });
});
