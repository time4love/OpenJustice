jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { DIFF_NAME } from '../helpers/corpusFixture';
import { resetDouble, store, written } from '../helpers/evidenceDouble';
import { built } from './absent';
import type { ThesisGapDecisionRow, ThesisPredicatesModule, ThesisRow, ThesisVersionRow } from './contract';
import {
  AUTHOR,
  CLAIM,
  FRAMING,
  MENTION,
  NOTE,
  OPEN_GAP,
  OTHER_RESEARCHER,
  PROVISION,
  THESIS,
  VERSION,
  VERSION_TEXT,
} from './fixtures';
import { mentionRow } from './rows';
import {
  AS_PUBLISHED,
  MISSING_FRAMING,
  MISSING_THESIS,
  ON_THE_FIXTURE,
  PUBLISHED_AT,
  answerOf,
  call,
  codeSetEquality,
  containsDeep,
  listOf,
  objectsWhere,
  refusals,
  resetTools,
  seedThesis,
  tripped,
} from './tools';

// ---------------------------------------------------------------------------
// THE READS AND THE NOTE — docs/gf-thesis-flows.md A4 :1426–:1431, :1476–:1479,
// :1501–:1504, :1520–:1525, §9 and T6, the R40 sketch §3b. Steps 20 (list_theses,
// get_thesis_context, add_note), 22 (get_whistleblower_call) and 24
// (list_thesis_reviews) build them.
//
// THREE KINDS OF READ, THREE RULES (A4 :1418–:1421). A PUBLIC read takes no identity
// and answers identically for everyone — `list_theses`' anonymous face and the
// whistleblower call; a researcher reaching MORE through `list_theses` is access,
// not a second behaviour (§0d, evidence A4 :1074–:1077). A GATED read answers any
// researcher the working state, and its handler reads no caller (flows A5
// :1037–:1038) — `get_thesis_context`. `list_thesis_reviews` is gated too, and
// refuses NO_RESEARCHER because REVIEWS(caller) has no subject without one (L9).
//
// `get_whistleblower_call` REFUSES NOTHING (Q3b, REVIEW's): an id naming no thesis
// answers `{ live: false }`, exactly as a draft does, so the two answers cannot tell
// an anonymous caller which ids are drafts (evidence §5).
//
// `get_thesis_context`'s `since` (ISO-8601) IS COINED (7.3 round 2, M2; REVIEW's
// ruling, the researcher's to overturn). A4 :1479 returns "HISTORY(t), optionally
// since a date" and its input line `{ thesisId }` names no parameter for it; the A4
// amendment is owed with NO_FRAMING's and create_thesis's (`contract.ts`, TOOLS).
//
// TWO THINGS ARE LEFT UNWRITTEN ON PURPOSE: sketch §3b's "THE_CALL … of the PUBLISHED
// version only, never the head's" waits on the researcher's question whether a gap
// decision carries the version it was decided on (T4 :628, :687 against A2 :1320, A3
// :1404); and HISTORY's attribution of a debate waits on question 1.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 10, 9, minute));

describe('list_theses — A4 :1426–:1431, T5 :840–:842, PUBLIC (thesis step 20)', () => {
  const DRAFT_ID = 'thesis-draft';

  /** THESIS published at its head, and a DRAFT of the same author's, never published. */
  function seedPublishedAndDraft(): void {
    const published = seedThesis(AS_PUBLISHED);
    // The draft's head is VERSION's text under its own id, so its contentHash is
    // still its text's hash (A1 :1231) — a row whose hash is not its text's is
    // malformed.
    const draftHead: ThesisVersionRow = { ...VERSION, id: 'version-of-the-draft', thesisId: DRAFT_ID, createdAt: at(18) };
    const draft: ThesisRow = { ...THESIS, id: DRAFT_ID, headVersionId: draftHead.id, createdAt: at(17) };
    store.theses = [published, draft];
    store.versions = [VERSION, draftHead];
    store.mentions = [
      ...store.mentions,
      mentionRow({ ...MENTION, id: 'mention-of-the-draft', versionId: draftHead.id }, false, null, DRAFT_ID),
    ];
  }

  it("answers an ANONYMOUS caller the published theses only, each exactly A4's six keys — the draft does not exist to it (A4 :1427–:1428)", async () => {
    seedPublishedAndDraft();
    const list = listOf(await call('list_theses', {}, null));
    expect(list).toHaveLength(1);
    const entry = objectsWhere(list, (o) => o['thesisId'] === THESIS.id).at(0) ?? {};
    expect(Object.keys(entry).sort()).toEqual(['author', 'claim', 'contentHash', 'provision', 'publishedAt', 'thesisId']);
    // `author` is the author's HANDLE (A4 :1427): the double holds no researcher row
    // to name one, so its value is step 20's — the key is held, not the handle.
    expect(entry).toMatchObject({
      thesisId: THESIS.id,
      claim: CLAIM,
      provision: PROVISION,
      publishedAt: PUBLISHED_AT.toISOString(),
      contentHash: VERSION.contentHash,
    });
    expect(containsDeep(list, DRAFT_ID)).toBe(false);
  });

  it("answers a RESEARCHER their own theses — the draft among them, `headIsPublished` saying whether head and published differ — and CONTAINS every anonymous entry deep-equal: access, not a second behaviour (§0d)", async () => {
    seedPublishedAndDraft();
    const anonymous = listOf(await call('list_theses', {}, null));
    const theirs: unknown = JSON.parse(await call('list_theses', {}, AUTHOR));
    expect(anonymous.filter((entry) => !containsDeep(theirs, entry))).toEqual([]);
    const own = (id: string): unknown[] =>
      objectsWhere(theirs, (o) => o['thesisId'] === id && 'headIsPublished' in o).map((o) => o['headIsPublished']);
    expect(own(DRAFT_ID)).toEqual([false]);
    expect(own(THESIS.id)).toEqual([true]);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  codeSetEquality('list_theses');
});

describe('get_thesis_context — A4 :1476–:1479, GATED (thesis step 20)', () => {
  refusals('get_thesis_context', [
    {
      code: 'NO_THESIS',
      why: "a thesisId naming none — a GATED read's handler answers without an identity, so an anonymous call reaches it (flows A5 :1037–:1038)",
      as: null,
      seed: seedThesis,
      input: { thesisId: MISSING_THESIS },
    },
  ]);

  it("answers ANY researcher the working state — the thesis, HEAD's text and citation, UNARGUED, the gap list, NONE for an analysis never run, the framing, HISTORY — writing nothing (A4 :1477–:1479; §9 :1002–:1004)", async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }];
    store.notes = [{ ...NOTE }];
    const answer = answerOf(await call('get_thesis_context', { thesisId: THESIS.id }, OTHER_RESEARCHER));
    const owed: readonly unknown[] = [THESIS.id, VERSION_TEXT, DIFF_NAME, [DIFF_NAME], OPEN_GAP.gapId, 'NONE', FRAMING.id, NOTE.id];
    expect(owed.filter((value) => !containsDeep(answer, value))).toEqual([]);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  it("HISTORY SINCE A DATE through the tool — `since`, ISO-8601, COINED (7.3 round 2, M2): the ONE predicate's entries after it and none before, the date BETWEEN two rows (A4 :1479; §9 :977–:978)", async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }];
    store.notes = [{ ...NOTE }];
    // Half a minute after OPEN_GAP (09:12) and before NOTE (09:13): an instant equal
    // to a row's own createdAt would pin a strict-or-inclusive boundary A3 :1407
    // never states.
    const since = new Date(Date.UTC(2026, 8, 10, 9, 12, 30));
    const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['history']);
    // HISTORY as the predicate answers it, in the JSON a tool returns — dates as ISO.
    const asJson = (entries: readonly unknown[]): unknown[] => entries.map((e) => JSON.parse(JSON.stringify(e)) as unknown);
    const after = asJson(await p.history(THESIS.id, since));
    const before = asJson(await p.history(THESIS.id)).filter((entry) => !containsDeep(after, entry));
    // THE VACUITY GUARD: the date must have rows on BOTH sides, or the case holds nothing.
    expect([after.length > 0, before.length > 0]).toEqual([true, true]);
    const answer = answerOf(
      await call('get_thesis_context', { thesisId: THESIS.id, since: since.toISOString() }, OTHER_RESEARCHER),
    );
    expect(after.filter((entry) => !containsDeep(answer, entry))).toEqual([]);
    expect(before.filter((entry) => containsDeep(answer, entry))).toEqual([]);
  });

  codeSetEquality('get_thesis_context');
});

describe('get_whistleblower_call — A4 :1501–:1504, PUBLIC, refuses nothing (Q3b) (thesis step 22)', () => {
  const CALL_ITEM = { whatIsNeeded: 'פרוטוקול הדיון', whoWouldHaveSeenIt: 'חברי הצוות', unit: 'אגף הרפואה', window: '2022-08' };
  const REQUEST = { text: 'בקשה', authority: 'משרד הבריאות', legalBasis: 'חוק חופש המידע', addresses: [], restsOn: [DIFF_NAME] };

  /** OPEN_GAP decided CALLED — a second decision on the same gap, so the one in force is CALLED. */
  const CALLED: ThesisGapDecisionRow = {
    ...OPEN_GAP,
    id: 'gap-decision-called',
    sequence: 2,
    decision: 'CALLED',
    callItem: CALL_ITEM,
    createdAt: at(31),
  };

  /**
   * A SECOND gap, REQUESTED. Its description is the sketch §5f's input `c` and its
   * gapId is gapId(c), derived at the same shell as OPEN_GAP's — a gap row whose id
   * is not its description's would be a malformed row.
   */
  const REQUESTED: ThesisGapDecisionRow = {
    ...OPEN_GAP,
    id: 'gap-decision-requested',
    gapId: '0x925e813b18233dc71792ff6d237b1a4032eda5d1bd5625ce0b938f7fda2c8626',
    description: 'מסמך הצגת הנתונים למשרד הבריאות לפני 6 באוגוסט 2022',
    decision: 'REQUESTED',
    request: REQUEST,
    createdAt: at(32),
  };

  it('a DRAFT with a gap CALLED, and an id naming NO thesis, answer the same bytes — `{ live: false }` — so no answer reveals which ids are drafts (Q3b; A4 :1503)', async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }, CALLED];
    const draft = await call('get_whistleblower_call', { thesisId: THESIS.id }, null);
    const nothing = await call('get_whistleblower_call', { thesisId: MISSING_THESIS }, null);
    expect(answerOf(draft)).toEqual({ live: false });
    expect(nothing).toBe(draft);
  });

  it('PUBLISHED with nothing CALLED or REQUESTED is `{ live: false }` too (A4 :1503)', async () => {
    seedThesis(AS_PUBLISHED);
    store.gapDecisions = [{ ...OPEN_GAP }];
    expect(answerOf(await call('get_whistleblower_call', { thesisId: THESIS.id }, null))).toEqual({ live: false });
  });

  it('PUBLISHED: THE_CALL carries each CALLED call item and THE_REQUESTS each request — the same bytes with and without identity, and no model (A3 :1404–:1406; A4 :1502–:1504)', async () => {
    seedThesis(AS_PUBLISHED);
    store.gapDecisions = [{ ...OPEN_GAP }, CALLED, REQUESTED];
    const anonymous = await call('get_whistleblower_call', { thesisId: THESIS.id }, null);
    const researcher = await call('get_whistleblower_call', { thesisId: THESIS.id }, AUTHOR);
    const answer = answerOf(anonymous);
    expect(answer).not.toEqual({ live: false });
    expect([CALL_ITEM, REQUEST].filter((appeal) => !containsDeep(answer, appeal))).toEqual([]);
    expect(researcher).toBe(anonymous);
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });

  codeSetEquality('get_whistleblower_call');
});

describe('add_note — A4 :1520–:1521, §9 :986–:997 (thesis step 20)', () => {
  const onTheThesis = ON_THE_FIXTURE.add_note;
  const onTheFraming = { framingId: FRAMING.id, text: NOTE.text };

  refusals('add_note', [
    { code: 'NO_RESEARCHER', why: 'no researcher in context', as: null, seed: seedThesis, input: onTheThesis },
    {
      code: 'NEITHER',
      why: 'no target at all — a note names a thesis or a framing (§9 :990)',
      as: AUTHOR,
      seed: seedThesis,
      input: { text: NOTE.text },
      beforeAnyQuery: true,
    },
    {
      code: 'NEITHER',
      why: 'BOTH targets — "exactly one set", the A2 CHECK (:1343)',
      as: AUTHOR,
      seed: seedThesis,
      input: { ...onTheThesis, framingId: FRAMING.id },
      beforeAnyQuery: true,
    },
    {
      code: 'NO_THESIS',
      why: 'a thesisId naming none — never NOT_AUTHOR',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...onTheThesis, thesisId: MISSING_THESIS },
    },
    {
      code: 'NO_FRAMING',
      why: 'a framingId naming none (Q3a)',
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: { ...onTheFraming, framingId: MISSING_FRAMING },
    },
    { code: 'NOT_AUTHOR', why: "a note on another researcher's thesis", as: OTHER_RESEARCHER, seed: seedThesis, input: onTheThesis },
    {
      code: 'NOT_AUTHOR',
      why: "a note on another researcher's framing — add_note's word on a framing too (§0f)",
      as: OTHER_RESEARCHER,
      seed: seedThesis,
      input: onTheFraming,
    },
    { code: 'EMPTY', why: 'a blank text', as: AUTHOR, seed: seedThesis, input: { ...onTheThesis, text: '  ' } },
  ]);

  it('appends ONE Note — its target, its text, who wrote it — and nothing else (§9 :991)', async () => {
    seedThesis();
    answerOf(await call('add_note', onTheThesis, AUTHOR));
    expect(written.map((w) => [w.model, w.op])).toEqual([['note', 'create']]);
    expect(written.at(0)?.data).toMatchObject({ thesisId: THESIS.id, text: NOTE.text, researcherId: AUTHOR });
    expect(written.at(0)?.data['framingId'] ?? null).toBeNull();
  });

  it('a note saying a gap is resolved resolves NOTHING — no decision written, the gap as it was (§9 :994–:995)', async () => {
    seedThesis();
    store.gapDecisions = [{ ...OPEN_GAP }];
    answerOf(await call('add_note', { ...onTheThesis, text: 'פער 3 נפתר' }, AUTHOR));
    expect(written.map((w) => w.model)).toEqual(['note']);
    expect(store.gapDecisions).toEqual([OPEN_GAP]);
  });

  codeSetEquality('add_note');
});

describe('list_thesis_reviews — A4 :1523–:1525, T6 :863–:882, GATED (thesis step 24)', () => {
  const SECOND = 'thesis-2';

  refusals('list_thesis_reviews', [
    {
      code: 'NO_RESEARCHER',
      why: 'no researcher — REVIEWS(caller) has no subject without one (L9)',
      as: null,
      seed: seedThesis,
      input: {},
    },
  ]);

  it('a researcher who owes nothing is ANSWERED, `{ owed: 0, reviews: [] }` — never refused; another\'s thesis owes them nothing (A4 :1524–:1525)', async () => {
    seedThesis();
    expect(answerOf(await call('list_thesis_reviews', {}, OTHER_RESEARCHER))).toEqual({ owed: 0, reviews: [] });
  });

  /**
   * Two theses of AUTHOR's, each HEAD citing the diff with no argument: THESIS, and a
   * SECOND begun later with a later head — so every sane key for "oldest first"
   * agrees — SEEDED FIRST, so a list in store order is out of order.
   */
  function seedTwoOwed(): void {
    seedThesis();
    const secondHead: ThesisVersionRow = { ...VERSION, id: 'version-of-thesis-2', thesisId: SECOND, createdAt: at(21) };
    const second: ThesisRow = { ...THESIS, id: SECOND, headVersionId: secondHead.id, createdAt: at(20) };
    store.theses = [second, ...store.theses];
    store.versions = [secondHead, ...store.versions];
    store.mentions = [
      mentionRow({ ...MENTION, id: 'mention-of-thesis-2', versionId: secondHead.id }, false, null, SECOND),
      ...store.mentions,
    ];
  }

  it("answers REVIEWS(caller) — the ONE predicate's entries, never a second derivation — OLDEST FIRST, each with its material and ONE command (A4 :1524; T6 :868–:882)", async () => {
    seedTwoOwed();
    const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['reviews']);
    const owed = await p.reviews(AUTHOR);
    expect(owed.map((e) => e.thesisId).sort()).toEqual([SECOND, THESIS.id].sort());
    const answer = answerOf(await call('list_thesis_reviews', {}, AUTHOR));
    expect(answer).toEqual({
      owed: 2,
      reviews: [THESIS.id, SECOND].map((id) =>
        expect.objectContaining({
          ...owed.find((e) => e.thesisId === id),
          command: expect.stringMatching(/\S/) as unknown,
          owedSince: expect.any(String) as unknown,
          material: expect.any(Object) as unknown,
        }) as unknown,
      ),
    });
    // THE KEY IS THE ORDER: the list is sorted by the instant each item became owed.
    const since = objectsWhere(answer, (o) => 'owedSince' in o).map((o) => String(o['owedSince']));
    expect(since).toEqual([...since].sort());
    // AN UNARGUED ITEM'S MATERIAL IS THE CITATION TO ARGUE — the record at its pin.
    const materials = objectsWhere(answer, (o) => 'material' in o && 'command' in o).map((o) => o['material']);
    expect(materials.filter((m) => !containsDeep(m, MENTION.contentVersionHash))).toEqual([]);
  });

  codeSetEquality('list_thesis_reviews');
});
