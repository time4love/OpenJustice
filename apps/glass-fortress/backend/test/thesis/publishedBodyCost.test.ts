jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/context/researcherContext', () => (require('./tools') as typeof import('./tools')).researcherContextDouble);
jest.mock('../../src/factories/LLMFactory', () => (require('./tools') as typeof import('./tools')).llmFactoryTripwire);

import { resetDouble, store } from '../helpers/evidenceDouble';
import {
  AFTER,
  AFTER_CAPTURE_NAME,
  BEFORE,
  BETWEEN,
  BETWEEN_CAPTURE_NAME,
  CAPTURE_NAME,
  CURRENT_VERSION,
  DIFF_BEFORE_BETWEEN_NAME,
  DIFF_BETWEEN_AFTER_NAME,
  DIFF_NAME,
  DIFF_ROW,
  DIFF_ROW_BEFORE_BETWEEN,
  DIFF_ROW_BETWEEN_AFTER,
  PAGE,
} from '../helpers/corpusFixture';
import { ATTEMPT, MENTION, THESIS, VERSION } from './fixtures';
import { AS_PUBLISHED, delegateCalls, resetTools, seedThesis } from './tools';
import { mentionRow } from './rows';

// ---------------------------------------------------------------------------
// WHAT THE PUBLIC BODY COSTS — docs/gf-ui-flows.md §8 :331–:333 (a page renders the route's body, and the route is
// ONE read); docs/gf-thesis-flows.md A5 :1565–:1569.
//
// THE PROPERTY: the number of database calls the body makes DOES NOT GROW WITH THE NUMBER OF CITATIONS. A thesis
// citing twelve records is one page, and a reader waits for one page — not for twelve serial round trips, each
// resolving a record, reading its attribution and deriving its flag on its own.
//
// THE COUNT IS `delegateCalls()`, NOT `asked.length`, and the difference is the whole reason this case was
// strengthened before it was satisfied. `asked` is appended only by the opt-in `ask()` wrapper
// (`evidenceDouble.ts` :105–:108); UI-2 added four delegates on this very path that nobody wrapped
// (`trackedUrl.findUnique`, `trackedUrl.findMany`, `urlSnapshot.findMany`, `urlVersionDiff.findMany`), plus
// `textVersion.findUnique` on the capture arm. Read from `asked` this body costs 15 and 35; it really costs 19
// and 59. An instrument blind to four of the eight queries a citation makes would go GREEN over a fix that
// removed only the four it could see. `delegateCalls()` ENUMERATES NOTHING — it walks the double's own
// delegates — so it cannot go blind that way again.
//
// SIX DISTINCT RECORDS, AND THE MIX HELD CONSTANT. Citing the same record six times is passed by a per-request
// memo, which resolves it once and collapses every count while the N+1 is still there (the R41 lesson). And a
// plural that skips its query on an empty list makes the count depend on the KINDS cited: if the small world
// cited one DIFF and the large world three captures and three diffs, the capture arm's read would run in one
// and not the other and the counts would differ by two — a red for a reason that is not a defect. So both
// worlds carry BOTH kinds, half captures and half diffs.
//
// WHAT THIS CASE DOES NOT SAY: nothing about how fast one query is. A count that does not grow can still be slow,
// and a count that grows can be fast on three rows — which is exactly why the staging reading is owed beside it.
// The region move already took the page from 27.5 s to 2.15 s: this is the CORRECTNESS fix, the one that makes
// twelve citations cost what three do, and it is not the outage fix.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
});

/** The six records the fixture's three captures over one page imply — three CAPTURE, three DIFF. */
const CAPTURES = [
  { name: CAPTURE_NAME, snapshot: BEFORE },
  { name: AFTER_CAPTURE_NAME, snapshot: AFTER },
  { name: BETWEEN_CAPTURE_NAME, snapshot: BETWEEN },
] as const;

const DIFFS = [
  { name: DIFF_NAME, row: DIFF_ROW },
  { name: DIFF_BEFORE_BETWEEN_NAME, row: DIFF_ROW_BEFORE_BETWEEN },
  { name: DIFF_BETWEEN_AFTER_NAME, row: DIFF_ROW_BETWEEN_AFTER },
] as const;

/** The second ever-published version's id — named once so the attempt, the row and the mentions agree. */
const SECOND_VERSION = 'version-2';

/** A citation: the record's name, and the content version or text the mention pins. */
interface Cited {
  name: string;
  pin: string;
}

/**
 * `count` citations, HALF CAPTURES AND HALF DIFFS, drawn from the six distinct records — and, past six, the
 * same six cited AGAIN, which is what separates "a record cited twice is read once" from "the count does not
 * grow with the number of records".
 */
function citations(count: number): Cited[] {
  const six: Cited[] = [
    ...CAPTURES.map((capture) => ({ name: capture.name, pin: capture.snapshot.textHash })),
    ...DIFFS.map((diff) => ({ name: diff.name, pin: diff.row.contentVersions[0]?.contentVersionHash ?? CURRENT_VERSION.contentVersionHash })),
  ];
  // Interleave so a prefix of any even length is half of each kind.
  const mixed = six.flatMap((_, index) => (index < 3 ? [six[index], six[index + 3]] : [])).filter((entry): entry is Cited => entry !== undefined);
  return Array.from({ length: count }, (_, index) => {
    const entry = mixed[index % mixed.length];
    if (entry === undefined) throw new Error('citations: the mixed list is empty');
    return entry;
  });
}

/**
 * The corpus the body resolves those names against: one page, three captures, three diffs.
 *
 * Each capture carries its `text`, which the all-DIFF world this case used to seed never needed: a CAPTURE
 * citation's pinned content IS that text, so the capture arm was unexercised and a fix that left its
 * per-citation read alone would have passed. Half the citations are captures now, and the arm is real.
 */
function seedCorpusForCost(): void {
  store.pages = [PAGE];
  store.captures = CAPTURES.map((capture) => ({
    ...capture.snapshot,
    trackedUrlId: PAGE.id,
    text: `הטקסט השמור של הצילום מ־${capture.snapshot.waybackTimestamp}`,
  }));
  store.diffs = DIFFS.map((diff) => ({ ...diff.row, trackedUrlId: PAGE.id }));
}

function seedPublishedCiting(count: number): void {
  seedThesis(AS_PUBLISHED);
  seedCorpusForCost();
  store.attempts = [ATTEMPT];
  store.mentions = citations(count).map((cited, index) =>
    mentionRow({ ...MENTION, id: `mention-${String(index)}`, name: cited.name, contentVersionHash: cited.pin }, true),
  );
}

/**
 * The COMPLETE number of delegate calls `publishedPageOf` makes, as a DIFFERENCE read before and after — never
 * a reset, so no other module's mocks are disturbed (the `throughTransaction` marker shape).
 */
async function callsFor(citations: number): Promise<number> {
  seedPublishedCiting(citations);
  // The service itself, imported: `built()` names the modules the acceptance suite waits for, and this one is
  // landed — what is being held here is its COST, not its existence.
  const { publishedPageOf } = await import('../../src/services/publishedThesis');
  const before = delegateCalls();
  await publishedPageOf(THESIS.id);
  return delegateCalls() - before;
}

describe('the public thesis body costs the same whatever it cites', () => {
  it('P0 — the COUNTER SEES SOMETHING: a body that reads a thesis, its versions, its mentions and six records is not free', async () => {
    // THE VACUITY GUARD ON A COUNT, and a decoy is what found it missing. Every case below asserts that a
    // number does not GROW — and a counter blinded to zero satisfies all of them at once, exactly as a scan
    // over an empty subject set "passes". `requireSubjects` is that guard for a set; this is it for a count.
    // The floor is the fixed reads the body cannot avoid (the thesis, its ever-published versions, the
    // attempts, the withdrawals, the pinned version's mentions, the handles, the analyses, the appeals) — a
    // dozen before a single citation is resolved, so ten is a floor no correct implementation goes under.
    const six = await callsFor(6);
    expect(six).toBeGreaterThan(10);
  });

  it('P1 — the count does not grow with the number of DISTINCT records cited (one query per KIND, never one per mention)', async () => {
    const two = await callsFor(2);
    const six = await callsFor(6);
    expect({ two, six, grew: six - two }).toEqual({ two, six: two, grew: 0 });
  });

  it('P2 — a record cited TWICE is read ONCE: twelve citations of the same six records cost what six do', async () => {
    const six = await callsFor(6);
    const twelve = await callsFor(12);
    expect({ six, twelve, grew: twelve - six }).toEqual({ six, twelve: six, grew: 0 });
  });

  it('P4 — the count does not grow with the number of published VERSIONS: the mentions of all of them are one read', async () => {
    const one = await callsFor(6);

    // A SECOND EVER-PUBLISHED VERSION. `EVER_PUBLISHED` is a relation filter — `publicationAttempts: { some:
    // { outcome: 'PUBLISHED' } }` — so a version row alone is invisible to `publicRecordOf` and never reaches
    // `historyOf` at all. The first spelling of this case added the row and nothing else, and it PASSED while
    // the per-version read it exists to hold was never made: a case green for the wrong reason holds nothing.
    // The attempt is what makes the version published, and its own mentions are what `citationRefsOf` reads.
    seedPublishedCiting(6);
    const firstVersionsMentions = store.mentions;
    store.versions = [...store.versions, { ...VERSION, id: SECOND_VERSION, contentHash: 'content-hash-2' }];
    store.attempts = [ATTEMPT, { ...ATTEMPT, id: 'attempt-2', versionId: SECOND_VERSION }];
    store.mentions = [
      ...firstVersionsMentions,
      ...citations(6).map((cited, index) =>
        mentionRow(
          { ...MENTION, id: `second-mention-${String(index)}`, versionId: SECOND_VERSION, name: cited.name, contentVersionHash: cited.pin },
          true,
        ),
      ),
    ];

    const { publishedPageOf } = await import('../../src/services/publishedThesis');
    const before = delegateCalls();
    await publishedPageOf(THESIS.id);
    const two = delegateCalls() - before;
    expect({ one, two, grew: two - one }).toEqual({ one, two: one, grew: 0 });
  });
});

// ---------------------------------------------------------------------------
// AND THE SAME PROPERTY ON THE GATED READ — docs/gf-thesis-flows.md A4 :1476 as amended 2026-09-21.
//
// `get_thesis_context` now resolves HEAD's and PUBLISHED's citations through the same resolver the public page
// uses. The property must be held HERE TOO and not assumed from the public page's: the gated read asks for TWO
// versions, and the obvious way to serve two is to call a single-version resolver twice — which passes every
// shape case in `reads.test.ts` and pays eight reads twice over, on the researcher's own page. A per-mention
// `citationRefsOf` loop would pass those cases too, at one query per citation.
//
// THE CITATIONS ARE VARIED ON PUBLISHED, AND THE HEAD IS HELD AT ONE, FOR A MEASURED REASON. The gated body
// has a SECOND per-citation cost that is not the resolution's and predates it: `criticMaterial.ts` :60–:62
// resolves HEAD's cited records ONE AT A TIME (`resolveRecordByName` in a loop), and each call makes the four
// reads `recordsByName` makes — `trackedUrl.findMany`, `urlSnapshot.findMany`, `urlVersionDiff.findMany`,
// `evidence.findMany`. Measured on the code of 2026-09-21 BEFORE this chunk: a head citing two records cost 34
// delegate calls and one citing six cost 50, four per citation, and the same 16 appears after. Varying the
// citations on PUBLISHED holds that arm constant, so what these cases measure is the RESOLUTION and nothing
// else. The N+1 itself is reported, not fixed here: it is the analysis arm's, shared with `run_analysis`'s
// refusal, and rewriting it is not this chunk.
//
// THE COUNT IS `delegateCalls()` for the reason the block above states: `asked` is blind to the delegates the
// citation path reaches through `recordsByName`, and an instrument blind to them would go green over a fix
// that removed only what it could see.
// ---------------------------------------------------------------------------
describe('the gated working-view body costs the same whatever it cites', () => {
  /** The head, one version past the published one — so the read resolves TWO version ids, as a working view does. */
  const HEAD_VERSION = 'version-head';

  /**
   * PUBLISHED at VERSION citing `citations` records; HEAD one version on, citing exactly ONE — so the analysis
   * arm's per-citation cost is the same in every world and the count varies with the RESOLUTION alone.
   */
  function seedGated(count: number): void {
    seedPublishedCiting(count);
    const published = store.mentions;
    store.versions = [...store.versions, { ...VERSION, id: HEAD_VERSION, contentHash: 'content-hash-head' }];
    store.thesis = store.thesis === null ? null : { ...store.thesis, headVersionId: HEAD_VERSION };
    store.theses = store.theses.map((t) => ({ ...t, headVersionId: HEAD_VERSION }));
    const one = citations(1).at(0);
    if (one === undefined) throw new Error('seedGated: the mixed list is empty');
    store.mentions = [...published, mentionRow({ ...MENTION, id: 'head-mention-0', versionId: HEAD_VERSION, name: one.name, contentVersionHash: one.pin }, false)];
  }

  /** The COMPLETE number of delegate calls `thesisContextOf` makes on that world. */
  async function gatedCallsFor(count: number): Promise<number> {
    seedGated(count);
    const { thesisContextOf } = await import('../../src/mcp/tools/getThesisContext');
    const before = delegateCalls();
    await thesisContextOf({ thesisId: THESIS.id });
    return delegateCalls() - before;
  }

  it('G0 — the COUNTER SEES SOMETHING: a gated body that reads a thesis, two versions, their mentions and six records is not free', async () => {
    // THE VACUITY GUARD ON A COUNT (the `requireSubjects` shape, for a number): a counter blinded to zero
    // satisfies every no-growth case below at once. Ten is a floor the fixed reads alone pass — the thesis,
    // its decisions, its framings, its versions, its withdrawals, the handles, the two version rows, the
    // mentions, the four citation plurals, the analysis and the transcript.
    expect(await gatedCallsFor(6)).toBeGreaterThan(10);
  });

  it('G1 — the count does not grow with the number of citations RESOLVED: six on the published version cost what two do (one query per KIND, never one per mention)', async () => {
    const two = await gatedCallsFor(2);
    const six = await gatedCallsFor(6);
    expect({ two, six, grew: six - two }).toEqual({ two, six: two, grew: 0 });
  });

  it('G2 — a record cited TWICE is read ONCE: twelve citations of the same six records cost what six do', async () => {
    const six = await gatedCallsFor(6);
    const twelve = await gatedCallsFor(12);
    expect({ six, twelve, grew: twelve - six }).toEqual({ six, twelve: six, grew: 0 });
  });

  it('G3 — HEAD and PUBLISHED are ONE resolution and not two: a head that has moved past the published version costs exactly what a head that IS it costs', async () => {
    // The same six citations, once with the head AT the published version — one id to resolve — and once with
    // the head moved on, citing the same six: two ids. A resolver called once per version doubles the four
    // citation plurals between these two worlds; one pass over both ids does not. Every case above holds the
    // head at one citation, where two calls and one differ by too little to see.
    //
    // ZERO IS THE MEASURED DELTA AND NOT AN APPROXIMATION. The read already asks for its head and its
    // published version separately — when they are the same id it reads that row twice — so the second
    // version adds no row read either, and the union of two versions' citations costs what one version's
    // does. Any positive number here is a resolver called per version.
    seedPublishedCiting(6);
    const { thesisContextOf } = await import('../../src/mcp/tools/getThesisContext');
    let before = delegateCalls();
    const atHead = await thesisContextOf({ thesisId: THESIS.id });
    const one = delegateCalls() - before;

    seedPublishedCiting(6);
    const published = store.mentions;
    store.versions = [...store.versions, { ...VERSION, id: HEAD_VERSION, contentHash: 'content-hash-head' }];
    store.thesis = store.thesis === null ? null : { ...store.thesis, headVersionId: HEAD_VERSION };
    store.theses = store.theses.map((t) => ({ ...t, headVersionId: HEAD_VERSION }));
    store.mentions = [
      ...published,
      ...citations(6).map((cited, index) =>
        mentionRow({ ...MENTION, id: `head-mention-${String(index)}`, versionId: HEAD_VERSION, name: cited.name, contentVersionHash: cited.pin }, false),
      ),
    ];
    before = delegateCalls();
    const moved = await thesisContextOf({ thesisId: THESIS.id });
    const two = delegateCalls() - before;

    // THE VACUITY GUARD: the second world really holds two DIFFERENT versions, each with its six citations
    // resolved — without it a body answering `head: null` would cost less and pass by doing nothing. The first
    // world really holds one, so the two worlds are not the same world twice.
    const resolved = (body: typeof moved): string => {
      if (!('head' in body) || body.head === null || body.published === null) return 'missing';
      return `${body.head.versionId === body.published.versionId ? 'same' : 'two'}:${String(body.head.mentions.length)}:${String(body.published.mentions.length)}`;
    };
    expect({ first: resolved(atHead), second: resolved(moved), grew: two - one }).toEqual({
      first: 'same:6:6',
      second: 'two:6:6',
      grew: 0,
    });
  });
});
