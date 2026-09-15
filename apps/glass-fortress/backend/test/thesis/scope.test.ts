jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { openDebateHandler } from '../../src/mcp/tools/openDebate';
import { resetDouble, store, written } from '../helpers/evidenceDouble';
import { TOOLS, type ThesisRow, type ThesisVersionRow } from './contract';
import { AUTHOR, MENTION, OTHER_RESEARCHER, THESIS, VERSION } from './fixtures';
import { mentionRow } from './rows';
import { AS_PUBLISHED, actAs, answerOf, call, listOf, objectsWhere, refusals, resetTools, scopeCodeSetEquality, seedThesis, tripped } from './tools';

// ---------------------------------------------------------------------------
// `scope` ON THE TWO THESIS LISTS — docs/gf-ui-flows.md §7.1 :312–:327; thesis A4 :1426 and :1523 as amended
// 2026-09-15; docs/gf-ui-refactor-plan.md UI-2 :182–:186. Beside `reads.test.ts`, which keeps the default's two cases
// (:159 "their own theses", :400 "another's thesis owes them nothing") — ruled 2026-09-15 under refactor plan §4 rules
// 2 and 3: a KEEP file is never edited, and the new shape's cases land in the step that lands the shape.
//
// "Two list contracts answer the caller's own by default, and the acceptance suite holds it … A default that moved
// would put colleagues' theses and flags in front of a session with commands it cannot run. So: each gains ONE
// optional parameter, `scope: 'mine' | 'all'`, DEFAULT `mine` — with no argument, today's answer, byte for byte."
// The byte-for-byte cases here compare the two spellings of the default (`{}` and `{ scope: 'mine' }`) and pin the
// EXACT key set of today's answers, so a key added at `mine` reds them.
//
// `all` WITHOUT AN IDENTITY IS REFUSED (plan §5 :903 "on every route and tool"; ui-flows A5 :1064). `list_theses` is
// PUBLIC and refuses nothing at `mine` — `contract.ts` `TOOLS.list_theses.codes` stays `[]` for `reads.test.ts`' code-set
// equality — so the code lives in `scopeCodes`, held by `scopeCodeSetEquality` here (Q4) and by no other file.
//
// THE COMMANDS AT `all` STAY THE AUTHOR'S TO RUN (§7.1 :324; thesis A7 :1685): an entry on a colleague's thesis
// carries its command whoever reads the list, and the write tool it names refuses NOT_AUTHOR — Q6 runs one.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const OTHER_THESIS = 'thesis-other';
const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 10, 9, minute));

/** A second researcher's thesis beside THESIS: its own head citing the diff, unargued — the shape reads.test.ts :410–:420 seeds. */
function seedOthersThesis(): void {
  const head: ThesisVersionRow = { ...VERSION, id: 'version-of-the-other', thesisId: OTHER_THESIS, createdById: OTHER_RESEARCHER, createdAt: at(21) };
  const other: ThesisRow = { ...THESIS, id: OTHER_THESIS, createdById: OTHER_RESEARCHER, headVersionId: head.id, createdAt: at(20) };
  store.theses = [...store.theses, other];
  store.versions = [...store.versions, head];
  store.mentions = [...store.mentions, mentionRow({ ...MENTION, id: 'mention-of-the-other', versionId: head.id }, false, null, OTHER_THESIS)];
}

/** The keys of every object inside `haystack` that `test` accepts, each sorted — what "today's shape exactly" is asserted over. */
const keySets = (haystack: unknown, test: (o: Record<string, unknown>) => boolean): string[][] =>
  objectsWhere(haystack, test).map((o) => Object.keys(o).sort());

/** A4 :1427's six keys of a published entry, and :1429–:1431's nine of an own entry, as `list_theses` answers them today. */
const PUBLISHED_KEYS = ['author', 'claim', 'contentHash', 'provision', 'publishedAt', 'thesisId'];
const OWN_KEYS = ['claim', 'framingIds', 'headIsPublished', 'headVersionId', 'openGaps', 'provision', 'publishedVersionId', 'thesisId', 'unarguedMentions'];

describe("list_theses — `scope: 'mine' | 'all'`, default mine (§7.1 :320–:322; A4 :1426 as amended)", () => {
  it("Q1 — list_theses({}) and list_theses({ scope: 'mine' }) are the same bytes, anonymous and as AUTHOR, and the key sets are today's exactly: six on a published entry, nine on an own entry, two on the envelope", async () => {
    seedThesis(AS_PUBLISHED);
    const anonymous = [await call('list_theses', {}, null), await call('list_theses', { scope: 'mine' }, null)];
    expect(anonymous[1]).toBe(anonymous[0]);
    const theirs = [await call('list_theses', {}, AUTHOR), await call('list_theses', { scope: 'mine' }, AUTHOR)];
    expect(theirs[1]).toBe(theirs[0]);

    expect(keySets(listOf(anonymous[0] ?? ''), (o) => 'contentHash' in o)).toEqual([PUBLISHED_KEYS]);
    const envelope = answerOf(theirs[0] ?? '');
    expect(Object.keys(envelope).sort()).toEqual(['published', 'theses']);
    expect(keySets(envelope['theses'], (o) => 'thesisId' in o)).toEqual([OWN_KEYS]);
    expect(keySets(envelope['published'], (o) => 'contentHash' in o)).toEqual([PUBLISHED_KEYS]);
  });

  refusals('list_theses', [
    {
      code: 'NO_RESEARCHER',
      why: "Q2 — scope all with no identity, before any query (plan §5 :903; ui-flows A5 :1064)",
      as: null,
      seed: () => seedThesis(AS_PUBLISHED),
      input: { scope: 'all' },
    },
  ]);

  it("Q3 — list_theses({ scope: 'all' }) as AUTHOR answers every researcher's theses in the researcher shape, each with author (handle) and mine — AUTHOR's true, OTHER's false — and published unchanged deep-equal (§7.1 :322–:323)", async () => {
    seedThesis(AS_PUBLISHED);
    seedOthersThesis();
    const mine = answerOf(await call('list_theses', {}, AUTHOR));
    const all = answerOf(await call('list_theses', { scope: 'all' }, AUTHOR));

    expect(Object.keys(all).sort()).toEqual(['published', 'theses']);
    expect(all['published']).toEqual(mine['published']);

    const entries = objectsWhere(all['theses'], (o) => 'thesisId' in o && 'mine' in o);
    expect(entries.map((e) => [e['thesisId'], e['author'], e['mine']]).sort()).toEqual([
      [THESIS.id, 'חוקר_א', true],
      [OTHER_THESIS, 'watchdog_7', false],
    ]);
    expect(keySets(all['theses'], (o) => 'thesisId' in o)).toEqual([
      [...OWN_KEYS, 'author', 'mine'].sort(),
      [...OWN_KEYS, 'author', 'mine'].sort(),
    ]);
    // THE OWN ENTRY IS THE SAME ENTRY, with two keys added: strip them and it is what `mine` answered.
    const own = entries.find((e) => e['thesisId'] === THESIS.id) ?? {};
    const { author: _author, mine: _mine, ...rest } = own;
    expect(objectsWhere(mine['theses'], (o) => o['thesisId'] === THESIS.id)).toEqual([rest]);
  });

  // Q4 — the codes this file's cases produced are TOOLS.list_theses.scopeCodes exactly (`tools.ts`); `codes` stays empty
  // for `reads.test.ts`' own equality, held beside it so the two sets cannot merge unnoticed.
  scopeCodeSetEquality('list_theses');
  it('Q4 — list_theses: codes stays empty for reads.test.ts; scopeCodes is where NO_RESEARCHER at scope all lives', () => {
    expect(TOOLS.list_theses.codes).toEqual([]);
    expect(TOOLS.list_theses.scopeCodes).toEqual(['NO_RESEARCHER']);
  });
});

/** UNARGUED's eight keys, FLAGGED's nine and STALE_TRAJECTORY's eight — a review entry as `list_thesis_reviews` answers it today (reads.test.ts :428–:438). */
const REVIEW_KEYS: Readonly<Record<string, readonly string[]>> = {
  UNARGUED: ['command', 'kind', 'material', 'mentionId', 'name', 'owedSince', 'thesisId', 'versionId'],
  FLAGGED: ['command', 'kind', 'material', 'mentionId', 'name', 'owedSince', 'reasons', 'thesisId', 'versionId'],
  STALE_TRAJECTORY: ['citedOn', 'command', 'kind', 'material', 'name', 'owedSince', 'state', 'thesisId'],
};

/** Every review entry's keys, checked against its kind's set — a kind the world does not produce asserts nothing, and the case says which it did. */
function expectReviewKeys(answer: Record<string, unknown>): string[] {
  const entries = objectsWhere(answer['reviews'], (o) => 'kind' in o && 'owedSince' in o);
  for (const entry of entries) {
    const kind = String(entry['kind']);
    expect([kind, Object.keys(entry).sort()]).toEqual([kind, [...(REVIEW_KEYS[kind] ?? [])].sort()]);
  }
  return [...new Set(entries.map((e) => String(e['kind'])))];
}

describe("list_thesis_reviews — `scope: 'mine' | 'all'`, default mine (§7.1 :320–:324; A4 :1523 as amended)", () => {
  it("Q5 — list_thesis_reviews({}) and ({ scope: 'mine' }) are the same bytes; another's thesis owes AUTHOR nothing at mine; the key set per kind is today's exactly", async () => {
    seedThesis();
    seedOthersThesis();
    const theirs = [await call('list_thesis_reviews', {}, AUTHOR), await call('list_thesis_reviews', { scope: 'mine' }, AUTHOR)];
    expect(theirs[1]).toBe(theirs[0]);
    const answer = answerOf(theirs[0] ?? '');
    expect(Object.keys(answer).sort()).toEqual(['owed', 'reviews']);
    // AUTHOR owes on THESIS alone: OTHER's unargued citation is not theirs (reads.test.ts :400's rule, at the default).
    expect(objectsWhere(answer['reviews'], (o) => 'thesisId' in o).map((o) => o['thesisId'])).toEqual([THESIS.id]);
    // The kinds this world produced, named — UNARGUED at least; the sets of the other two hold wherever they appear.
    expect(expectReviewKeys(answer)).toEqual(['UNARGUED']);
  });

  it("Q6 — list_thesis_reviews({ scope: 'all' }) answers REVIEWS over every thesis, owed counting all, each entry with its author AND mine — true on AUTHOR's, false on OTHER's; OTHER's command pastes and, run as AUTHOR, refuses NOT_AUTHOR (§7.1 :323–:324; A7 :1685)", async () => {
    // Both theses UNPUBLISHED (head-only, each citation unargued): `publishedById` is null on both, so `mine` computed
    // from the wrong column cannot pass by accident.
    seedThesis();
    seedOthersThesis();
    const answer = answerOf(await call('list_thesis_reviews', { scope: 'all' }, AUTHOR));
    expect(answer['owed']).toBe(2);
    const entries = objectsWhere(answer['reviews'], (o) => 'thesisId' in o && 'command' in o);
    expect(entries.map((e) => [e['thesisId'], e['author'], e['mine']]).sort()).toEqual([
      [THESIS.id, 'חוקר_א', true],
      [OTHER_THESIS, 'watchdog_7', false],
    ]);
    for (const entry of entries) {
      const kind = String(entry['kind']);
      expect([kind, Object.keys(entry).sort()]).toEqual([kind, [...(REVIEW_KEYS[kind] ?? []), 'author', 'mine'].sort()]);
    }

    // THE COMMAND ON A COLLEAGUE'S ENTRY, RUN: `open_debate thesisId=<t> record={…} rationale=…` (thesisPredicates.ts
    // :456–:463) — the thesis and the record as the command spells them, a rationale supplied — refuses NOT_AUTHOR.
    const command = String(entries.find((e) => e['thesisId'] === OTHER_THESIS)?.['command']);
    const thesisId = /thesisId=(\S+)/.exec(command)?.[1];
    const record = /record=(\{.*?\}) rationale=/.exec(command)?.[1];
    expect([thesisId, typeof record]).toEqual([OTHER_THESIS, 'string']);
    actAs(AUTHOR);
    const run: unknown = JSON.parse(
      await openDebateHandler({
        thesisId: String(thesisId),
        record: JSON.parse(String(record)) as { url: string; before: string; after: string },
        rationale: 'הרשומה מראה את ההסרה',
      }),
    );
    expect(run).toEqual({ error: expect.stringMatching(/\S/) as unknown, code: 'NOT_AUTHOR' });
  });

  refusals('list_thesis_reviews', [
    {
      code: 'NO_RESEARCHER',
      why: 'Q7 — scope all with no identity, before any query — REVIEWS has no caller and `all` has no identity either',
      as: null,
      seed: seedThesis,
      input: { scope: 'all' },
    },
  ]);

  it('Q8 — neither list, at either scope, writes anything or trips the model', async () => {
    seedThesis(AS_PUBLISHED);
    seedOthersThesis();
    for (const input of [{}, { scope: 'mine' }, { scope: 'all' }]) {
      await call('list_theses', input, AUTHOR);
      await call('list_thesis_reviews', input, AUTHOR);
    }
    expect(written).toEqual([]);
    expect(tripped).toEqual([]);
  });
});
