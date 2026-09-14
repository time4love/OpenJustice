jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { listFramingsHandler } from '../src/mcp/tools/listFramings';
import { asked, resetDouble, store, written } from './helpers/evidenceDouble';
import { AUTHOR, CLAIM, FRAMING, OTHER_RESEARCHER, PROVISION, ROUNDS, THESIS } from './thesis/fixtures';
import { actAs, resetTools, seedThesis, tripped } from './thesis/tools';

// ---------------------------------------------------------------------------
// list_framings — the read that finds a framing without an id from the chat (the step-19 record's F3;
// the researcher's ruling of 2026-09-14). IN THE UNIT PROJECT, which gates.
//
// What each case holds: every framing to any caller, the same bytes with and without an identity; oldest
// first; the latest CHOSEN claim VERBATIM (what `create_thesis` restates character for character); a
// framing with no choice yet says so; the author's handle, and a missing author row THROWS; nothing is
// written and nothing is spent; an empty world is an empty list, never a refusal.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 10, 9, minute));

/** THESIS's framing (CHOSEN) beside a SECOND, unattached framing with a PROPOSED round only, opened later. */
function seedTwoFramings(): void {
  seedThesis();
  store.framings = [
    { ...FRAMING },
    { ...FRAMING, id: 'framing-2', question: 'שאלה שנייה', provision: null, thesisId: null, researcherId: OTHER_RESEARCHER, createdAt: at(20) },
  ];
  store.framingRounds = [
    ...ROUNDS,
    { id: 'round-2-1', framingId: 'framing-2', sequence: 1, type: 'PROPOSED', content: { framing: 'הצעה', elements: [] }, researcherId: OTHER_RESEARCHER, createdAt: at(21) },
  ];
}

const parse = (out: string): Record<string, unknown>[] => JSON.parse(out) as Record<string, unknown>[];

describe('list_framings — every framing, oldest first, the CHOSEN claim verbatim', () => {
  it('answers the same bytes with and without an identity, and asks no identity of the context', async () => {
    seedTwoFramings();
    actAs(null);
    const anonymous = await listFramingsHandler();
    actAs(AUTHOR);
    const researcher = await listFramingsHandler();
    expect(researcher).toBe(anonymous);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  it('lists both framings oldest first, each with its author handle, its thesis and its round count', async () => {
    seedTwoFramings();
    const list = parse(await listFramingsHandler());
    expect(list.map((e) => e['framingId'])).toEqual([FRAMING.id, 'framing-2']);
    expect(list[0]).toMatchObject({
      framingId: FRAMING.id,
      question: FRAMING.question,
      provision: PROVISION,
      author: 'חוקר_א',
      thesisId: THESIS.id,
      rounds: 3,
      latest: { sequence: 3, type: 'CHOSEN' },
    });
    expect(list[1]).toMatchObject({ framingId: 'framing-2', author: 'watchdog_7', thesisId: null, rounds: 1, latest: { sequence: 1, type: 'PROPOSED' } });
  });

  it("carries the latest CHOSEN round's claim VERBATIM, and null where nothing was chosen", async () => {
    seedTwoFramings();
    const list = parse(await listFramingsHandler());
    expect(list.map((e) => e['claim'])).toEqual([CLAIM, null]);
  });

  it('a later CHOSEN round wins over an earlier one — the claim is the choice in force', async () => {
    seedTwoFramings();
    store.framingRounds = [
      ...store.framingRounds,
      { id: 'round-4', framingId: FRAMING.id, sequence: 4, type: 'CHOSEN', content: { claim: `${CLAIM} — שוב`, provision: PROVISION, elements: [] }, researcherId: AUTHOR, createdAt: at(22) },
    ];
    const list = parse(await listFramingsHandler());
    expect(list[0]).toMatchObject({ claim: `${CLAIM} — שוב`, latest: { sequence: 4, type: 'CHOSEN' }, rounds: 4 });
  });

  it('reads the rounds by the framings it listed and the researchers by their ids — one query each', async () => {
    seedTwoFramings();
    await listFramingsHandler();
    expect(asked.filter((a) => a.model === 'framingRound').map((a) => a.args)).toEqual([
      expect.objectContaining({ where: { framingId: { in: [FRAMING.id, 'framing-2'] } } }),
    ]);
    expect(asked.filter((a) => a.model === 'researcher')).toHaveLength(1);
  });

  it('an empty world is an empty list — an answer, never a refusal', async () => {
    store.framings = [];
    expect(parse(await listFramingsHandler())).toEqual([]);
  });

  it('a framing whose author row is missing THROWS — a broken foreign key, never an anonymous author', async () => {
    seedTwoFramings();
    store.researchers = store.researchers.filter((r) => r['id'] !== OTHER_RESEARCHER);
    await expect(listFramingsHandler()).rejects.toThrow(/no such researcher exists/);
  });
});
