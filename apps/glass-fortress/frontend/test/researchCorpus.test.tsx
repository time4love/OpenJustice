jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());
// The PUBLIC arm of CO-4 renders `/corpus`, a Server Component whose `readPublic` needs a backend; the double
// spreads the REAL module, so `authHeaders`/`authedFetch` are untouched and the gated reads still go through
// `global.fetch`, which the page helpers intercept.
jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());

import {
  gatedFetchUrls,
  renderPage,
  renderResearchClaims,
  renderResearchCorpus,
  setAuthState,
  setPathname,
  textNodes,
  type Locale,
} from './render';
import { requireSubjects } from './scan';
import { joinPageFacts } from '../src/components/research/ResearchCorpus';
import { rulesInForceAt } from '../src/components/research/ExtractionSheet';
import { parseCorpusStream } from '../src/lib/corpusBody';
import { corpusAtAll, corpusAtAllAtPageOne, claimsAtAll } from './fixtures/research/corpusAll';
import { articleRules, pages as pagesFixture } from './fixtures/research/reads';
import type { ArticleRule } from '../src/types/research';

// ---------------------------------------------------------------------------
// `/research/corpus` AND `/research/corpus/claims` AT `all` — docs/gf-ui-flows.md §27 :863–:876, §28
// :878–:885, §25 :787–:810; A2 :1149 (the 400); interaction A5 :1071, :1199, :1208, :1214; MARKING :576–:578;
// UI plan UI-8 :750–:760.
//
// THE CASES ARE NAMED CO-n — the Corpus dOor — so no name collides with `record-content-is-one`'s RC-n.
//
// WHAT EACH ARM IS FOR, in one line: the mark exists in BOTH its homes and is absent at `public`; a row's
// TEXT-NODE SET is pinned at both scopes so a word added or lost is caught by VALUE and not by property name
// (R65's M4); the join to `list_pages` is TOTAL and loud; §27's three sheets cost nothing until they are
// opened; a closed record offers no door and reads no bytes; and a refused filter can be taken out.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';

/**
 * THE DATE THAT REACHES THE CROSS-PAGE STREAM — §24 region 0's five, of which `since` is the one that means
 * "the records in a range across pages". A read naming a PAGE answers about that page alone, so a case that
 * needs two pages' rows in one list must ask a question whose answer holds two pages.
 */
const ACROSS_PAGES = '2021-01-01';

/**
 * THE CHIPS THAT WOULD CHANGE THE PAGE IN FORCE — a picker's chip, or a chip that removes the page. Board
 * ט·ב (2026-09-21) allows neither: the page is the view's SUBJECT, chosen in region 0 and left by the one
 * `corpus.allPages` link, so every chip in the row must carry the page it arrived with.
 *
 * THE PREDICATE IS ON THE WIRE AND NOT ON A WORD. It read `chip.textContent.includes('דף')` until this
 * round, and the control that was removed labelled its chips `displayUrl(page.url)` — „example.gov/one/",
 * which holds no „דף" — so the whole picker could return and the case would stay green. Reproduced: wired
 * end to end the picker renders exactly those urls and the suite does not move.
 *
 * IT IS NOT "no chip carries a `page` parameter" EITHER, and that is the trap one level down: on a
 * single-page view every ROW chip carries `page=<id>` by design, because a chip's href is the filter set
 * with that ONE chip changed (§24 :750). What marks a page chip is that it changes the PAGE.
 */
const chipsTouchingThePage = (container: HTMLElement, page: string): Element[] =>
  [...container.querySelectorAll('[data-chip]')].filter(
    (chip) => new URLSearchParams((chip.getAttribute('href') ?? '').split('?').at(1) ?? '').get('page') !== page,
  );

beforeEach(() => {
  setAuthState('approved-researcher');
  window.localStorage.clear();
});
afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
  window.localStorage.clear();
});

/** A row's whole visible text, normalised — the SET a case pins, never a property's name. */
function textSetOf(element: Element): string[] {
  return textNodes(element)
    .map((node) => (node.textContent ?? '').replace(/\s+/gu, ' ').trim())
    .filter((text) => text !== '');
}

/**
 * THE ROW THAT SAYS `words` — and for a CLAIM row those words are no longer the url.
 *
 * §24 :763 as amended 2026-09-21 takes the page's label off a row of a view that cannot span pages, and the
 * claims view never can. A claim row is therefore identified by the CLAIM it carries, which is the thing the
 * row is actually about; a page row is still identified by its url, which is the thing THAT row is about.
 */
function rowFor(container: HTMLElement, selector: string, words: string): Element {
  const rows = [...container.querySelectorAll(selector)];
  const found = rows.find((row) => (row.textContent ?? '').includes(words));
  if (found === undefined) throw new Error(`no ${selector} saying ${words} — found ${String(rows.length)} rows`);
  return found;
}

/** The two claim rows of `claimsAtAll`, named by their own sentences — the opened page's and the closed one's. */
const CLAIM_OF = { open: 'הטענה שעזבה את העמוד הפתוח', closed: 'הטענה שעזבה את העמוד הסגור' } as const;

describe('the gated corpus door — /research/corpus', () => {
  it('CO-1 THE FLOOR, READ OFF THE PARSE: the fixture carries a page that is NOT public, with BOTH row weights on it', () => {
    // OFF THE PARSE AND NOT OFF THE LITERAL (R65's trap): the page renders what `parseCorpusStream` returns,
    // so a fixture whose invariant held only in the source would be asserting something the page never sees.
    const parsed = parseCorpusStream(corpusAtAll);
    const closed = requireSubjects('entries of a page that is not public', parsed.entries.filter((entry) => !entry.page.public));
    expect({
      closedEntries: closed.length,
      weights: [...new Set(closed.map((entry) => entry.kind))].sort(),
      facetHasClosed: parsed.pages.some((page) => !page.public),
      facetHasOpen: parsed.pages.some((page) => page.public),
      claimsClosed: claimsAtAll.entries.filter((entry) => !entry.page.public).length,
    }).toEqual({ closedEntries: 2, weights: ['CAPTURE', 'DIFF'], facetHasClosed: true, facetHasOpen: true, claimsClosed: 1 });
  });

  it('CO-2 THE NOT PUBLIC MARK IS ON THE PAGES LIST at `all` (UI plan :751, ui §24 :656 and :701) and on NEITHER row at `public`', async () => {
    const gated = await renderResearchCorpus(LOCALE);
    const closedRow = rowFor(gated, '[data-page-row]', 'example.gov/two');
    const openRow = rowFor(gated, '[data-page-row]', 'example.gov/one');
    expect({
      rows: gated.querySelectorAll('[data-page-row]').length,
      closedMark: closedRow.querySelectorAll('[data-mark="notPublic"]').length,
      openMark: openRow.querySelectorAll('[data-mark="notPublic"]').length,
    }).toEqual({ rows: 2, closedMark: 1, openMark: 0 });
  });

  it('CO-3 THE MARK IS ON BOTH ROW WEIGHTS OF THE STREAM (§27 :866 says "rows") and on neither row of an opened page', async () => {
    // A CROSS-PAGE STREAM, reached by a DATE and not by a page (§24 region 0's five). This case needs two
    // pages' rows in one list, and `?page=page-one` is a read that answers about page-one alone — it used to
    // be staged with a body holding the closed page's rows too, which no backend produces. `?since=` is the
    // parameter §24 gives for "the records in a range ACROSS pages", so the body and the question now agree.
    const gated = await renderResearchCorpus(LOCALE, { searchParams: { since: ACROSS_PAGES } });
    const closedCapture = rowFor(gated, '[data-capture-row]', 'example.gov/two');
    const openCapture = rowFor(gated, '[data-capture-row]', 'example.gov/one');
    const closedDiff = rowFor(gated, '[data-diff-card]', 'example.gov/two');
    const openDiff = rowFor(gated, '[data-diff-card]', 'example.gov/one');
    expect({
      closedCapture: closedCapture.querySelectorAll('[data-mark="notPublic"]').length,
      closedDiff: closedDiff.querySelectorAll('[data-mark="notPublic"]').length,
      openCapture: openCapture.querySelectorAll('[data-mark="notPublic"]').length,
      openDiff: openDiff.querySelectorAll('[data-mark="notPublic"]').length,
    }).toEqual({ closedCapture: 1, closedDiff: 1, openCapture: 0, openDiff: 0 });
  });

  it("CO-4 A PAGES-LIST ROW'S TEXT-NODE SET, pinned at `all` and at `public` — by VALUE, not by property name", async () => {
    // R65's M4: a word drawn under a different attribute passes a NAME-based absence. The SET is what a
    // reader meets, so a mark lost, a count changed or a word added reddens this and nothing else has to.
    const gated = await renderResearchCorpus(LOCALE);
    const closed = textSetOf(rowFor(gated, '[data-page-row]', 'example.gov/two'));
    const open = textSetOf(rowFor(gated, '[data-page-row]', 'example.gov/one'));

    const publicPage = (await import('../src/app/[locale]/corpus/page')).default;
    const { setPublicBodies } = await import('./render');
    setPublicBodies({ '/api/corpus': { status: 200, body: corpusAtAll } });
    const rendered = await renderPage(publicPage, { locale: LOCALE }, { locale: LOCALE });
    if (rendered.notFound) throw new Error('/corpus answered the one 404');
    const publicRows = [...rendered.container.querySelectorAll('[data-page-row]')];
    setPublicBodies(undefined);

    expect({
      closedAtAll: closed,
      openAtAll: open,
      // AT `public` THE CLOSED PAGE IS NOT DRAWN AT ALL — `rowsForScope` drops it, so the mark has nothing to
      // be on and the disclosure rule is held one step before the mark is.
      publicRowCount: publicRows.length,
      publicRowText: publicRows.map((row) => textSetOf(row)),
    }).toEqual({
      // THE WHOLE ROW, WORD FOR WORD: the mark, the url, the interval FORMATTED from two 14-digit instants,
      // the record count, the five outcomes this page actually has, and the pending stop as a sentence.
      closedAtAll: [
        'לא פתוח לציבור',
        'example.gov/two/',
        '2.5.2022 – 4.7.2022',
        '·',
        '2 רשומות',
        // THE TOTAL BEFORE THE BREAKDOWN (board ה, 2026-09-21): `research.corpus.rows` over the page's own
        // `total`, so the per-outcome numbers divide a whole the row has already stated.
        '12 שורות',
        'הארכיון לא מסר אותו', '·', '1',
        'זהה לקודם', '·', '4',
        'כפילות', '·', '2',
        'נרכש', '·', '4',
        'ממתין לשיפוט', '·', '1',
        'עצירה ממתינה; היא נפתרת בשיחה',
      ],
      openAtAll: [
        'example.gov/one/',
        '23.12.2021 – 1.3.2022',
        '·',
        '2 רשומות',
        '43 שורות',
        'לא נשלף', '·', '1',
        'זהה לקודם', '·', '20',
        'נרכש', '·', '22',
      ],
      publicRowCount: 1,
      publicRowText: [['example.gov/one/', '23.12.2021 – 1.3.2022', '·', '2 רשומות']],
    });
  });

  it('CO-5 THE JOIN TO `list_pages` IS TOTAL — a facet naming a page the other read does not FAILS BY NAME', () => {
    expect(() => joinPageFacts(corpusAtAll.pages, pagesFixture)).not.toThrow();
    const short = pagesFixture.filter((page) => page.trackedUrlId !== 'page-two');
    expect(() => joinPageFacts(corpusAtAll.pages, short)).toThrow(/list_pages does not: https:\/\/example\.gov\/two\//u);
  });

  it('CO-6 §27 :874–:876 — the rows PER OUTCOME and the pending stop as TEXT, and NO anchor to /article-rules/ anywhere', async () => {
    const gated = await renderResearchCorpus(LOCALE);
    const closedRow = rowFor(gated, '[data-page-row]', 'example.gov/two');
    const openRow = rowFor(gated, '[data-page-row]', 'example.gov/one');
    expect({
      // ONLY THE OUTCOMES A PAGE HAS: all seven arrive zero-filled (A5 :1071) and five rows of "· 0" are noise.
      closedOutcomes: [...closedRow.querySelectorAll('[data-outcome]')].map((node) => node.getAttribute('data-outcome')),
      openOutcomes: [...openRow.querySelectorAll('[data-outcome]')].map((node) => node.getAttribute('data-outcome')),
      closedStop: closedRow.querySelectorAll('[data-stop-pending]').length,
      openStop: openRow.querySelectorAll('[data-stop-pending]').length,
      stopIsText: closedRow.querySelector('[data-stop-pending]')?.tagName,
      markingAnchors: [...gated.querySelectorAll('a[href]')].filter((a) => (a.getAttribute('href') ?? '').includes('/article-rules/')).length,
    }).toEqual({
      closedOutcomes: ['UNSERVABLE', 'IDENTICAL', 'DUPLICATE', 'ACQUIRED', 'PENDING_JUDGEMENT'],
      openOutcomes: ['UNFETCHED', 'IDENTICAL', 'ACQUIRED'],
      closedStop: 1,
      openStop: 0,
      stopIsText: 'SPAN',
      markingAnchors: 0,
    });
  });

  it('CO-7 A CLOSED RECORD OFFERS NO DOOR AND READS NO BYTES — and an OPENED one reads its own, so the zero is not vacuous', async () => {
    // THE ZERO HAD TO BE EARNED. Written first as "open the page, count the requests", this case passed over a
    // decoy that let every record open — because nothing had TAPPED a row, so no sheet had mounted and no read
    // could have happened either way. A count that is zero because nothing was exercised is the vacuity this
    // repository names as its own, so both arms tap, and the OPEN arm proves the reader is looking.
    // THE CAPTURE READ GOES THROUGH `fetchJson` (`RecordSheet.useCaptureText`), which this file's api double
    // records — a different door from the gated reads, and the reason both are read here rather than one.
    const { apiCallsMade, setPublicBodies } = await import('./render');
    setPublicBodies({
      '/api/pages/page-one/captures/20211223211940': { status: 200, body: { text: 'הטקסט שנשמר', textHash: '2'.repeat(64), current: true } },
      '/api/pages/page-two/captures/20220502120000': { status: 200, body: { text: 'לא אמור להיקרא', textHash: '7'.repeat(64), current: true } },
    });
    const open = async (url: string): Promise<readonly string[]> => {
      const before = apiCallsMade().length;
      const gated = await renderResearchCorpus(LOCALE, { searchParams: { since: ACROSS_PAGES } });
      const tap = [...gated.querySelectorAll('[data-open-record]')].find((node) => (node.getAttribute('data-open-record') ?? '').includes(url));
      if (tap === undefined) throw new Error(`the stream drew no row of ${url} to open`);
      const { act } = await import('react');
      const { fireEvent } = await import('@testing-library/react');
      await act(async () => {
        fireEvent.click(tap);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      if (gated.querySelector('[data-record-sheet]') === null) throw new Error(`the tap on ${url} opened no record sheet`);
      return apiCallsMade()
        .slice(before)
        .map((call) => call.path)
        .filter((path) => path.includes('/api/pages/'));
    };

    const closedReads = await open('page-two');
    const openReads = await open('page-one');
    const layout = await renderResearchCorpus(LOCALE, { searchParams: { since: ACROSS_PAGES } });
    setPublicBodies(undefined);
    const closedRow = rowFor(layout, '[data-capture-row]', 'example.gov/two');
    const openRow = rowFor(layout, '[data-capture-row]', 'example.gov/one');

    expect({
      // The public record door is never asked about a page it would refuse (`getCapture.ts` :89 NOT_PUBLIC)…
      closedReads,
      // …and IS asked about one it will serve, which is what makes the line above a measurement.
      openReads,
      closedAnchors: closedRow.querySelectorAll('a[href]').length,
      openAnchors: openRow.querySelectorAll('a[href]').length,
    }).toEqual({
      closedReads: [],
      openReads: ['/api/pages/page-one/captures/20211223211940'],
      closedAnchors: 0,
      openAnchors: 0,
    });
  });

  it('CO-8 THE SHEET: a closed record draws the mark and NO link onward; an opened one keeps its link', async () => {
    const closed = await renderResearchCorpus(LOCALE, { searchParams: { since: ACROSS_PAGES } });
    const tap = [...closed.querySelectorAll('[data-open-record]')].find((node) => (node.getAttribute('data-open-record') ?? '').includes('page-two'));
    if (tap === undefined) throw new Error('the stream drew no row of the closed page to open');
    const { act } = await import('react');
    const { fireEvent } = await import('@testing-library/react');
    await act(async () => {
      fireEvent.click(tap);
      await Promise.resolve();
    });
    const sheet = closed.querySelector('[data-record-sheet]');
    if (sheet === null) throw new Error('the tap opened no record sheet');
    expect({
      kind: sheet.getAttribute('data-record-kind'),
      notPublic: sheet.querySelectorAll('[data-record-not-public] [data-mark="notPublic"]').length,
      linkOnward: sheet.querySelectorAll('p[data-open-record] a').length,
      // The COPY of the citation token stays: a researcher citing a record the public cannot yet read is how
      // a page BECOMES public, so the act the gated door exists for is not withheld.
      copyToken: sheet.querySelectorAll('[data-copy-value]').length,
    }).toEqual({ kind: 'CAPTURE', notPublic: 1, linkOnward: 0, copyToken: 1 });
  });

  it('CO-9 §27 :871 OPENED ONLY ON DEMAND — no extraction read before a press, then exactly one more per level', async () => {
    const gated = (depth: 0 | 1 | 2 | 3) => renderResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth });
    // THE DISTINCT READS, IN FIRST-APPEARANCE ORDER, which is what §27 :871 claims. The raw sequence is NOT
    // the subject: the pane shows one layer at a time (§9 :1070), so switching to a deeper sheet unmounts the
    // one above it and re-opening re-reads — a repeated GET, recorded as a LOW, and pinning the sequence
    // would pin the pane's selection timing rather than the clause.
    const reads = (urls: readonly string[]): string[] => [
      ...new Set(urls.filter((url) => url.includes('/api/research/pages/')).map((url) => url.replace(/^.*\/api\/research/u, '/api/research'))),
    ];

    await gated(0);
    const none = reads(gatedFetchUrls());
    await gated(1);
    const one = reads(gatedFetchUrls());
    await gated(2);
    const two = reads(gatedFetchUrls());
    await gated(3);
    const three = reads(gatedFetchUrls());

    expect({ none, one, two, three }).toEqual({
      // THE FLOOR IS THE EMPTY ONE: a stream of rows costs NOTHING until a reader asks how a text was cut.
      none: [],
      one: ['/api/research/pages/page-one/captures'],
      two: ['/api/research/pages/page-one/captures', '/api/research/pages/page-one/rules'],
      three: [
        '/api/research/pages/page-one/captures',
        '/api/research/pages/page-one/rules',
        '/api/research/pages/page-one/rules/rule-1/history',
      ],
    });
  });

  it('CO-10 THE RULES IN FORCE AT A CAPTURE — the comparison is the 14-DIGIT INSTANT, and the same day is not one point', () => {
    const [live, ended] = [articleRules.rules[0], articleRules.rules[1]];
    if (live === undefined || ended === undefined) throw new Error('the fixture must carry a live rule and an ended one');
    const ids = (rules: readonly ArticleRule[], at: string): string[] => rulesInForceAt(rules, at).map((rule) => rule.ruleId);

    // THE SAME DAY IS NOT ONE POINT, and the schema says so in as many words (`schema.prisma` :1790–:1792):
    // "a rule marked against the 14:00 capture must not govern 09:00 of the same day". A `YYYY-MM-DD`
    // comparison cannot express this at all, which is why the arm is here and not only in the fixture.
    const sameDay: ArticleRule[] = [{ ruleId: 'rule-afternoon', selector: 'main', validFrom: '20211223140000', validTo: null, trusted: false, lastMatched: null }];

    expect({
      // THE FIXTURE'S OWN FLOOR: the wire's spelling, one rule with an end and one without.
      shape: [live.validFrom, live.validTo, ended.validFrom, ended.validTo],
      // page-one's capture, `20211223211940` — the row the extraction sheet is opened from.
      atTheCapture: ids(articleRules.rules, '20211223211940'),
      // `validFrom` is INCLUSIVE: the capture the rule was marked against is governed by it.
      atItsOwnCapture: ids(articleRules.rules, '20211201000000'),
      // One second before it begins, it is not in force — and NEITHER IS THE ENDED ONE: the fixture's two
      // rules do not abut, so there is a real gap between `20211130000000` and `20211201000000` where the
      // page must say no rule governed the extraction. An arm that assumed they touched would have been
      // asserting a fixture's accident as if it were the contract.
      oneSecondBeforeTheLiveRule: ids(articleRules.rules, '20211130235959'),
      // INSIDE the ended rule's own interval it IS in force, which is what makes the line above a boundary
      // rather than a function that returns nothing.
      insideTheEndedRule: ids(articleRules.rules, '20210601000000'),
      // `validTo` is EXCLUSIVE: at the capture that ended it, the rule is already out.
      atTheEndingCapture: ids(articleRules.rules, '20211130000000'),
      // THE SAME-DAY ARM, both sides of 14:00 on 2021-12-23.
      sameDayMorning: ids(sameDay, '20211223090000'),
      sameDayAtTheMark: ids(sameDay, '20211223140000'),
      sameDayEvening: ids(sameDay, '20211223211940'),
    }).toEqual({
      shape: ['20211201000000', null, '20210101000000', '20211130000000'],
      atTheCapture: ['rule-1'],
      atItsOwnCapture: ['rule-1'],
      oneSecondBeforeTheLiveRule: [],
      insideTheEndedRule: ['rule-2'],
      atTheEndingCapture: [],
      sameDayMorning: [],
      sameDayAtTheMark: ['rule-afternoon'],
      sameDayEvening: ['rule-afternoon'],
    });
  });

  it('CO-11 A2 :1149 — a REFUSED filter is drawn FOR REMOVAL, with no empty sentence and no throw', async () => {
    const gated = await renderResearchCorpus(LOCALE, {
      searchParams: { page: 'page-one', since: '2021-01-01' },
      answers: { '/api/research/corpus?page=page-one&since=2021-01-01': { status: 400, body: { error: 'Bad request', code: 'INVALID_RANGE' } } },
    });
    const chips = [...gated.querySelectorAll('[data-chip]')];
    expect({
      // The filters IN FORCE, each with a link that TAKES IT OUT — never a picker, and never the facet's
      // rows, which a refused read did not return.
      chips: chips.map((chip) => (chip.textContent ?? '').trim()),
      removals: chips.map((chip) => chip.getAttribute('href')),
      stream: gated.querySelectorAll('[data-stream]').length,
      emptySentence: gated.querySelectorAll('[data-stream-empty]').length,
      // THE PAGE COMES OFF BY THE LINK, and it is drawn on the REFUSAL — the condition is the filter in
      // force, never the facet, because a refused read returns no facet and that is the moment a reader most
      // needs to take the page off. The label is present, so the row says what it is.
      allPages: gated.querySelector('[data-all-pages]')?.getAttribute('href'),
      label: gated.querySelector('[data-filters-label]')?.textContent,
      lenses: gated.querySelectorAll('[data-corpus-lenses]').length,
    }).toEqual({
      allPages: '/he/research/corpus',
      label: 'סינון',
      lenses: 0,
      // ROW FILTERS ONLY (board ט·ב): the SINCE removal, then `/corpus`'s own KIND and CITED controls, which
      // are `list_corpus`' parameters and belong on a stream view at either scope. NO PAGE CHIP — the page is
      // the view's subject, and it comes off by the link below. Every href is under the GATED base, which is
      // the whole of the scope thread: a refused filter on this door cannot send a researcher out of it.
      chips: ['מתאריך', 'צילומים', 'שינויים', 'מצוטטות'],
      removals: [
        '/he/research/corpus?page=page-one',
        '/he/research/corpus?page=page-one&since=2021-01-01&kind=CAPTURE',
        '/he/research/corpus?page=page-one&since=2021-01-01&kind=DIFF',
        '/he/research/corpus?page=page-one&since=2021-01-01&cited=1',
      ],
      stream: 0,
      emptySentence: 0,
    });
  });

  it('CO-12 ONE DECLARER: the record sheet and the extraction sheet are BOTH in the pane, neither erasing the other', async () => {
    const gated = await renderResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 3 });
    const tabs = [...gated.querySelectorAll('[role="tab"]')].map((tab) => (tab.textContent ?? '').trim());
    // The extraction sheet was opened from a row whose record sheet the same press did not open, so the
    // three sheets standing together is what a second `DeclareTabs` would have destroyed.
    expect(tabs).toEqual(['כיצד חולץ הטקסט הזה', 'הכללים שהיו בתוקף בתאריך הצילום', 'ההיסטוריה של הכלל']);
  });

  it('CO-13 THE EXTRACTION SHEET, ONE LEVEL AT A TIME — the work row, then the rules in force, then the history', async () => {
    // THE PANE SHOWS ONE LAYER AT A TIME (§9 :1070; `RightPane` renders the ACTIVE tab's content alone), so
    // each level is read at the depth where a reader is actually standing. A case that expected all three
    // panels at once would be asserting a pane this shell does not have.
    const one = await renderResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 1 });
    const work = {
      outcome: (one.querySelector('[data-work-outcome]')?.textContent ?? '').trim(),
      compared: one.querySelectorAll('[data-work-compared]').length,
      stale: one.querySelectorAll('[data-work-stale]').length,
      gates: one.querySelectorAll('[data-work-gates]').length,
    };

    const two = await renderResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 2 });
    const rules = {
      // The ENDED rule is not offered: `rulesInForceAt` is the one derivation this sheet performs (§27 :869).
      drawn: [...two.querySelectorAll('[data-rule-row]')].map((row) => row.getAttribute('data-rule')),
      trusted: two.querySelectorAll('[data-rule-trusted]').length,
      // §27 :874–:876 — the pending stop is a SENTENCE, and `markingUrl` is in the body and on no anchor.
      stop: (two.querySelector('[data-stop-pending]')?.textContent ?? '').trim(),
      markingAnchors: [...two.querySelectorAll('a[href]')].filter((a) => (a.getAttribute('href') ?? '').includes('/article-rules/')).length,
    };

    const three = await renderResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 3 });
    const history = {
      matches: three.querySelectorAll('[data-rule-match]').length,
      removedText: [...three.querySelectorAll('[data-removed-text]')].map((node) => (node.textContent ?? '').trim()),
      // Q6: the walk's reads still carry ids, and this sheet draws NEITHER — a rule's history shows no author.
      idsAsText: textNodes(three).filter((node) => /researcher-row-\d/u.test(node.textContent ?? '')).length,
    };

    expect({ work, rules, history }).toEqual({
      work: { outcome: 'נרכש', compared: 0, stale: 0, gates: 0 },
      rules: { drawn: ['rule-1'], trusted: 1, stop: 'עצירה ממתינה; היא נפתרת בשיחה', markingAnchors: 0 },
      history: { matches: 2, removedText: ['שורה שהוסרה', 'שורה שנייה'], idsAsText: 0 },
    });
  });

  it('CO-22 A SURVEYED PAGE WITH NO CAPTURES DRAWS ON THIS DOOR TOO — and this is the door that would have fallen', async () => {
    // THE GATED DOOR IS WHERE THIS BITES, and that is why it gets its own arm rather than the public one's by
    // inheritance. §27 renders the SAME list at `all`, over EVERY SURVEYED page — so a page whose captures
    // have not been acquired yet is a row this door draws and the public one never sees (`public` is false
    // until a published thesis opens it). The facet sends `first: null` for it
    // (`backend/src/services/corpusReads.ts` :1307), the parser used to call `text()` on that, and ONE such
    // row took region 0 of this door down entirely.
    //
    // IT IS ONE SURVEY AWAY: `surveyWaybackCaptures.ts` :149 creates the `TrackedUrl` and its work-list rows,
    // and a LATER step acquires the captures. Every newly surveyed url sits in this state until it runs.
    const fresh = {
      ...corpusAtAll,
      pages: [
        ...corpusAtAll.pages,
        { trackedUrlId: 'surveyed-empty', url: 'https://example.gov/fresh/', public: false, first: null, last: null, entries: 0, shape: null },
      ],
    };
    // THE JOIN TO `list_pages` IS TOTAL AND LOUD (§27 :873, and `joinPageFacts` throws by name), so the
    // surveyed page must exist in BOTH reads — which is exactly the state a real survey produces: the row is
    // created by `surveyWaybackCaptures.ts` :149 and both reads see it from that moment.
    const freshFacts = [
      ...pagesFixture,
      {
        trackedUrlId: 'surveyed-empty',
        url: 'https://example.gov/fresh/',
        public: false,
        title: null,
        surveyedAt: '2026-01-04T09:00:00.000Z',
        total: 0,
        outcomes: { UNFETCHED: 0, UNSERVABLE: 0, IDENTICAL: 0, DUPLICATE: 0, ACQUIRED: 0, PENDING_JUDGEMENT: 0, SKIPPED: 0 },
        stopPending: false,
      },
    ];
    const gated = await renderResearchCorpus(LOCALE, {
      answers: {
        '/api/research/corpus': { status: 200, body: fresh },
        '/api/research/pages': { status: 200, body: freshFacts },
      },
    });
    const row = rowFor(gated, '[data-page-row]', 'example.gov/fresh');
    expect({
      // THE DOOR STOOD UP — the whole defect. A throwing parser rendered no list at all, so every count here
      // was zero and nothing below could be reached.
      rows: gated.querySelectorAll('[data-page-row]').length,
      // THE ROW'S WHOLE TEXT, BY VALUE: the url and „0 רשומות", and NO interval. No new string — the
      // catalogue's own `corpus.records` — and no stand-in date, which would be a day this page never held.
      said: textSetOf(row),
      // AND §27's MARK IS STILL ON IT: a surveyed page is exactly a page no published thesis has opened, so
      // the row that this chunk keeps alive is the row that most needs the mark.
      notPublic: row.querySelectorAll('[data-mark="notPublic"]').length,
      // THE CONTROL, in the same render: the rows that DO hold captures still draw their interval, so the
      // absence above is this row's answer and not a component that stopped drawing dates.
      withInterval: [...gated.querySelectorAll('[data-page-row]')].filter((one) => (one.textContent ?? '').includes('23.12.2021')).length,
      // §27's OWN FACTS on the row, from `list_pages`: a surveyed page with nothing acquired says „0 שורות".
      // They are pinned here because the SET is the assertion — a word added beside the count would otherwise
      // pass unread, which is R65's M4.
    }).toEqual({ rows: 3, said: ['לא פתוח לציבור', 'example.gov/fresh/', '0 רשומות', '0 שורות'], notPublic: 1, withInterval: 1 });
  });

  it('CO-18 BOARD ט·ב — the single-page HEADER, on BOTH doors: the way back, then the card, then the filters', async () => {
    // THE ORDER IS THE RULING (§24 :752): the page card is the FIRST element of a single-page view, above the
    // filters — a header that says the view is ONE page's — with the one way back above it. Pinned as the
    // ELEMENT ORDER and as the card's TEXT-NODE SET (R65's M4), on both doors, because the two doors render
    // one component and a change to it reaches both.
    const gated = await renderResearchCorpus(LOCALE, { searchParams: { page: 'page-one' } });
    const { setPublicBodies } = await import('./render');
    // THE SAME BODY ON BOTH DOORS, which is what makes the two shapes comparable word for word — and it is
    // the PAGE-NAMED one, because both doors are being asked about one page and only that read carries §28's
    // `shape`. Staged with `corpusAtAll` the public arm would draw a card with NO strip while the gated arm
    // drew one, and the case would be comparing two different questions.
    setPublicBodies({ '/api/corpus?page=page-one': { status: 200, body: corpusAtAllAtPageOne } });
    const openDoor = await renderPage((await import('../src/app/[locale]/corpus/page')).default, { locale: LOCALE }, { locale: LOCALE, searchParams: { page: 'page-one' } });
    if (openDoor.notFound) throw new Error('/corpus?page= answered the one 404');
    setPublicBodies(undefined);

    const shapeOf = (container: HTMLElement, base: string) => {
      const main = container.querySelector('main');
      if (main === null) throw new Error('no <main>');
      return {
        order: [...main.children].map((child) =>
          child.hasAttribute('data-all-pages')
            ? 'the way back'
            : child.hasAttribute('data-page-card')
              ? 'the page card'
              : child.hasAttribute('data-corpus-context')
                ? 'the filters'
                : child.tagName,
        ),
        back: [(container.querySelector('[data-all-pages]')?.textContent ?? '').trim(), container.querySelector('[data-all-pages]')?.getAttribute('href')],
        card: textSetOf(container.querySelector('[data-page-card]') ?? document.createElement('div')),
        label: container.querySelector('[data-filters-label]')?.textContent,
        // NO LENS INSIDE A SINGLE-PAGE VIEW, and no chip per page anywhere.
        lenses: container.querySelectorAll('[data-corpus-lenses]').length,
        // NO CHIP TOUCHES THE PAGE — on the WIRE; see `chipsTouchingThePage` for what that predicate is and
        // what the two weaker spellings of it could not see.
        pageChips: chipsTouchingThePage(container, 'page-one').length,
        base,
      };
    };

    const expected = (base: string) => ({
      order: ['H1', 'the way back', 'the page card', 'the filters', 'UL'],
      back: ['כל העמודים', base],
      // THE CARD'S OWN WORDS — and „9 רשומות" is the FACET'S count, not the four rows the window holds:
      // region 3 speaks for the page (§24 :755) and the stream below speaks for the window.
      card: ['example.gov/one/', '23.12.2021 – 1.3.2022', '·', '9 רשומות', 'הטענות בדף הזה', 'ינו׳', 'פבר׳'],
      label: 'סינון',
      lenses: 0,
      pageChips: 0,
      base,
    });

    expect({ gated: shapeOf(gated, '/he/research/corpus'), open: shapeOf(openDoor.container, '/he/corpus') }).toEqual({
      gated: expected('/he/research/corpus'),
      open: expected('/he/corpus'),
    });
  });

  it('CO-19 THE STRIP LABELS YEARS ON A LONG PAGE — the ruling reaches the DOM, not only the pure module', async () => {
    // `timeStrip.test.ts` holds the arithmetic; this holds that the CARD asks the locale for the unit the
    // module named. A 42-month facet — walla's real span — must draw YEAR words and no month word.
    // THE PAGE-NAMED BODY WITH A LONGER INTERVAL, and its `shape` kept: the strip is drawn from the facet's
    // shape now, so a row whose shape were dropped here would draw no strip at all and the case would be
    // asserting the absence of month words rather than the presence of year words.
    const row = corpusAtAllAtPageOne.pages.at(0);
    if (row === undefined) throw new Error('CO-19: the page-named fixture carries no facet row');
    const long = { ...corpusAtAllAtPageOne, pages: [{ ...row, first: '20190314120000', last: '20220902120000' }] };
    const gated = await renderResearchCorpus(LOCALE, {
      searchParams: { page: 'page-one' },
      answers: { '/api/research/corpus?page=page-one': { status: 200, body: long } },
    });
    const ticks = [...gated.querySelectorAll('[data-tick-unit]')];
    expect({
      units: [...new Set(ticks.map((tick) => tick.getAttribute('data-tick-unit')))],
      words: ticks.map((tick) => (tick.textContent ?? '').trim()),
    }).toEqual({ units: ['year'], words: ['2020', '2021', '2022'] });
  });
});

describe('region 4 lands with its destination', () => {
  it('CO-17 Q-H — `/research` now draws the link to the gated corpus, under the locale, and it resolves to a page that exists', async () => {
    // A LINK LANDS WITH ITS DESTINATION (ruled 2026-09-20). The key `research.corpus.open` shipped with the
    // frozen namespace at chunk 4 and had NO caller until this chunk, exactly so a researcher on staging would
    // never meet a 404 from the platform's own navigation (§32's rule, read on a region's link).
    const { renderResearchDashboard } = await import('./render');
    const dashboard = await renderResearchDashboard(LOCALE);
    const link = dashboard.querySelector('[data-corpus-open]');
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { FRONTEND } = await import('./scan');
    expect({
      drawn: (link?.textContent ?? '').trim(),
      href: link?.getAttribute('href'),
      destinationExists: existsSync(join(FRONTEND, 'src/app/[locale]/research/corpus/page.tsx')),
    }).toEqual({
      drawn: 'הארכיון של החוקרים',
      href: '/he/research/corpus',
      destinationExists: true,
    });
  });
});

describe('the gated claims lens — /research/corpus/claims', () => {
  it('CO-20 THE WAY BACK IS HELD ON THIS DOOR TOO — the word and the href, on the answer AND on the refusal', async () => {
    // M2: A RULE WITH TWO SYMMETRIC HALVES, HELD BY ONE. Deleting `data-all-pages` from this view's success
    // branch left the suite GREEN — reproduced — while the same deletion on the PUBLIC claims door reds CP-10
    // and CP-11, and on the public corpus door reds thirty-five cases. Board ט·ב made this link the ONLY way
    // off a page (the PAGE chip it replaced is gone), so an unheld half is a reader with no exit.
    //
    // BOTH ARMS, because the refusal is where it matters most: a 400 leaves a view whose only parameter is
    // the page, and a link drawn only when the answer came back is a link missing exactly when it is needed.
    const answered = await renderResearchClaims(LOCALE);
    const refused = await renderResearchClaims(LOCALE, {
      searchParams: { since: '2023-05-01', until: '2022-01-01' },
      answers: { '/api/research/corpus/claims?page=page-one&since=2023-05-01&until=2022-01-01': { status: 400 } },
      open: false,
    });
    const back = (container: HTMLElement) => {
      const link = container.querySelector('[data-all-pages]');
      return { words: (link?.textContent ?? '').trim(), href: link?.getAttribute('href'), count: container.querySelectorAll('[data-all-pages]').length };
    };
    expect({ answered: back(answered), refused: back(refused) }).toEqual({
      // „כל העמודים", and it lands on region 0 AT THIS SCOPE — the gated list, never the public one.
      answered: { words: 'כל העמודים', href: '/he/research/corpus', count: 1 },
      refused: { words: 'כל העמודים', href: '/he/research/corpus', count: 1 },
    });
    // A FLOOR ON THE TWO ARMS THEMSELVES, so the pair above is not one state read twice: the answered view
    // drew rows and the refused one drew none.
    expect({
      answeredRows: answered.querySelectorAll('[data-claim-row]').length > 0,
      refusedRows: refused.querySelectorAll('[data-claim-row]').length,
    }).toEqual({ answeredRows: true, refusedRows: 0 });
  });

  it('CO-21 M3 — THE FILTER ROW IS DRAWN ONLY WHEN IT HOLDS A CONTROL, on the gated claims view', async () => {
    // MEASURED LIVE on `/he/research/corpus/claims?page=<corona>`: `data-corpus-filters` rendered with its
    // whole innerText equal to „סינון" and a chip count of ZERO. This view draws neither KIND nor CITED by
    // design — `list_trajectories` takes neither (§6.1 :247) — so with no date set the row is a LABEL OVER
    // NOTHING: it tells a reader a control is there and then withholds it.
    const bare = await renderResearchClaims(LOCALE);
    const dated = await renderResearchClaims(LOCALE, {
      searchParams: { since: '2022-01-01' },
      answers: { '/api/research/corpus/claims?page=page-one&since=2022-01-01': { status: 200, body: claimsAtAll } },
    });
    expect({
      // ABSENT when it would hold nothing — the row AND its label, because a label with no row is the same
      // defect wearing a different attribute.
      bareRow: bare.querySelectorAll('[data-corpus-filters]').length,
      bareLabel: bare.querySelectorAll('[data-filters-label]').length,
      bareChips: bare.querySelectorAll('[data-chip]').length,
      // PRESENT, WITH ITS LABEL, the moment there is one — the two-sided control, so "never drawn" fails too.
      datedRow: dated.querySelectorAll('[data-corpus-filters]').length,
      datedLabel: dated.querySelector('[data-filters-label]')?.textContent,
      datedChips: dated.querySelectorAll('[data-chip]').length,
      // AND THE REST OF THE VIEW IS UNTOUCHED by the row's absence: the count line and the way back stay.
      bareCount: bare.querySelectorAll('[data-corpus-count]').length,
      bareBack: bare.querySelectorAll('[data-all-pages]').length,
    }).toEqual({ bareRow: 0, bareLabel: 0, bareChips: 0, datedRow: 1, datedLabel: 'סינון', datedChips: 1, bareCount: 1, bareBack: 1 });
  });

  it('CO-14 §25 :783 — without a `page` the gated view answers the ONE 404, in the SERVER shell', async () => {
    const claimsPage = (await import('../src/app/[locale]/research/corpus/claims/page')).default;
    const rendered = await renderPage(claimsPage, { locale: LOCALE }, { locale: LOCALE, searchParams: {} });
    expect(rendered.notFound).toBe(true);
  });

  it('CO-23 THE CLAIMS VIEW NAMES ITS PAGE ONCE ON THIS DOOR TOO, and no row repeats it (§25 :790, 2026-09-21)', async () => {
    // ONE COMPONENT, TWO DOORS. The header is drawn inside `Claims` and not in either page shell, which is
    // why `/research/corpus/claims/page.tsx` and `ResearchClaims.tsx` were not touched to get it: a header
    // spelled in each shell would be one rule with two implementations, and neither shell has the url anyway
    // — `list_trajectories` carries it on the ENTRIES. This arm pins the gated door by VALUE all the same,
    // because §31's closure case says the doors REACH one module and not what that module then draws here.
    const gated = await renderResearchClaims(LOCALE);
    const urls = [...gated.querySelectorAll('[data-page-url]')];
    expect({
      named: urls.length,
      insideARow: gated.querySelectorAll('[data-claim-row] [data-page-url]').length,
      // THE FLOOR: there are rows to have repeated it on.
      rows: gated.querySelectorAll('[data-claim-row]').length,
    }).toEqual({ named: 1, insideARow: 0, rows: 2 });
  });

  it('CO-15 THE CLOSED PAGE`S RECORD WORDS ARE TEXT, NOT ANCHORS — and an opened page`s are anchors', async () => {
    const gated = await renderResearchClaims(LOCALE);
    const sheet = gated.querySelector('[data-claim-sheet]');
    if (sheet === null) throw new Error('the tap opened no claim sheet');
    // The first row is the OPENED page's: its sheet composes real links to real record pages.
    expect({
      captureLinks: sheet.querySelectorAll('[data-capture-link]').length,
      captureText: sheet.querySelectorAll('[data-capture-link-closed]').length,
      diffLinks: sheet.querySelectorAll('[data-diff-link]').length,
      diffText: sheet.querySelectorAll('[data-diff-link-closed]').length,
      rows: gated.querySelectorAll('[data-claim-row]').length,
      closedRowMark: rowFor(gated, '[data-claim-row]', CLAIM_OF.closed).querySelectorAll('[data-mark="notPublic"]').length,
      openRowMark: rowFor(gated, '[data-claim-row]', CLAIM_OF.open).querySelectorAll('[data-mark="notPublic"]').length,
    }).toEqual({ captureLinks: 2, captureText: 0, diffLinks: 1, diffText: 0, rows: 2, closedRowMark: 1, openRowMark: 0 });
  });

  it('CO-16 THE CLOSED ROW`S OWN SHEET draws its capture and diff words as TEXT, with no anchor at all', async () => {
    const gated = await renderResearchClaims(LOCALE);
    const closedRow = rowFor(gated, '[data-claim-row]', CLAIM_OF.closed);
    const tap = closedRow.querySelector('[data-open-claim]');
    if (tap === null) throw new Error('the closed claim row drew no control to open');
    const { act } = await import('react');
    const { fireEvent } = await import('@testing-library/react');
    await act(async () => {
      fireEvent.click(tap);
      await Promise.resolve();
    });
    const sheet = gated.querySelector('[data-claim-sheet]');
    if (sheet === null) throw new Error('the tap opened no claim sheet');
    expect({
      captureLinks: sheet.querySelectorAll('[data-capture-link]').length,
      captureText: sheet.querySelectorAll('[data-capture-link-closed]').length,
      diffLinks: sheet.querySelectorAll('[data-diff-link]').length,
      diffText: sheet.querySelectorAll('[data-diff-link-closed]').length,
      anchors: sheet.querySelectorAll('a[href]').length,
      // The MEMBERS of the group still each carry their one COPY control (§25 :810) — the token is the act.
      members: sheet.querySelectorAll('[data-claim-members] > li').length,
    }).toEqual({ captureLinks: 0, captureText: 2, diffLinks: 0, diffText: 1, anchors: 0, members: 2 });
  });
});
