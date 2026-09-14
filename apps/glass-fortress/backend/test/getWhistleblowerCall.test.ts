jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { getWhistleblowerCallHandler } from '../src/mcp/tools/getWhistleblowerCall';
import { resetDouble, store } from './helpers/evidenceDouble';
import { NEXT_VERSION, OPEN_GAP, THESIS, TRAJECTORY_VERSION, VERSION } from './thesis/fixtures';
import { resetTools, seedThesis } from './thesis/tools';

// ---------------------------------------------------------------------------
// get_whistleblower_call — the ruled FILTER, through the tool. docs/gf-thesis-flows.md A3 :1404–:1406 as amended
// 2026-09-14 (the researcher's ruling); the R48 sketch §b4, §6-3.
//
// IN THE UNIT PROJECT, which gates. `test/thesis/reads.test.ts` seeds every decision on the PUBLISHED version, so a tool
// that read the thesis's whole log would pass it; `test/thesisFingerprint.test.ts` holds the predicate, not that the tool
// CALLS it. Here a gap is CALLED on the published version and DISMISSED on a LATER draft: the public call is the published
// version's, and the later decision waits for a publication act.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

const CALL_ITEM = { whatIsNeeded: 'פרוטוקול הדיון', whoWouldHaveSeenIt: 'חברי הצוות', unit: 'אגף הרפואה', window: '2022-08' };

describe('get_whistleblower_call — the decisions decided at or before the publication', () => {
  it('a gap CALLED on the published version and DISMISSED on a later draft is still the public call', async () => {
    seedThesis({ headVersionId: NEXT_VERSION.id, publishedVersionId: TRAJECTORY_VERSION.id, publishedAt: new Date() });
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION];
    store.gapDecisions = [
      { ...OPEN_GAP, versionId: VERSION.id },
      { ...OPEN_GAP, id: 'called-on-published', sequence: 2, decision: 'CALLED', callItem: CALL_ITEM, versionId: TRAJECTORY_VERSION.id },
      { ...OPEN_GAP, id: 'dismissed-on-draft', sequence: 3, decision: 'DISMISSED', reason: 'לא רלוונטי', versionId: NEXT_VERSION.id },
    ];

    const out = JSON.parse(await getWhistleblowerCallHandler({ thesisId: THESIS.id })) as Record<string, unknown>;

    expect(out).toMatchObject({ live: true, publishedVersionId: TRAJECTORY_VERSION.id, call: [CALL_ITEM], requests: [] });
    expect(out['intake']).toEqual(expect.stringContaining('בשמכם'));
  });
});
