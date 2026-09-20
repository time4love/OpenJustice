jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { requireSubjects } from './scan';
import { fireEvent } from '@testing-library/react';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import { flipsOf } from '../src/components/corpus/Claims';
import { displayUrl } from '../src/lib/format';
import { claimsAnswer, claimsUndetected } from './fixtures/corpus/claims';
import he from '../messages/he.json';

// ---------------------------------------------------------------------------
// claims-per-page — docs/gf-ui-flows.md §25 :787–:810 as amended 2026-09-20; A1 :91 and :1122; §6.1 :247–:249;
// §24 region 0's rule; A2 :1141–:1156; the UI plan's :616–:627.
//
// FIVE PROPERTIES, AND EACH ONE HAS ALREADY BEEN GOT WRONG SOMEWHERE IN THIS REFACTOR:
//
//   (1) A BARE `/corpus/claims` IS THE ONE 404 (§25 :783). The ROUTE answers 200 without `page` — measured,
//       26 rows — so nothing downstream enforces this and only the page can. A view that rendered the bare
//       url would show one page's chronology under no page's name.
//   (2) THE ROWS ARE THE READ'S, IN THE READ'S ORDER (§6.1 :248–:249). The key is the date the claim LAST
//       LEFT and it is NOT on the row: `lastSeen` is newer for a claim that returned. So a re-sort by any
//       field the row carries is a DIFFERENT order that still looks sorted, which is what the decoy plants.
//   (3) ONE TICK PER CAPTURE, from `captures[]` and never from `changes[]` (§25 :791). The spans name their
//       first capture only — 4 marks for 22 captures on the real page.
//   (4) THE SHEET'S HREFS ARE THE COMPOSED URLS, and the diff pair is (the capture before the flip, the
//       capture at it). Measured on the real body: composed from `captures[]` all 87 pairs are diffs the walk
//       wrote; composed from the spans, 49 of 87 name pairs that do not exist.
//   (5) A `page` THAT PARSES TO NOTHING IS NOT A FILTER (§24 region 0), so it is the same 404 as none at all.
//
// THE WORDS ARE PINNED AS LITERALS, read from `messages/he.json` itself rather than through a translator: a
// case that asked `t('present')` would agree with the catalogue however the catalogue drifted, and the copy
// is FROZEN (handoffs/R63-approved-copy-5bc.md, sha 120e84b1…). These are the frozen bytes.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const claimsPage = () => import('../src/app/[locale]/corpus/claims/page');
const WIRE = '/api/corpus/claims?page=page-one';

/** The frozen Hebrew, byte for byte — the values a reader sees, not the keys that hold them. */
const FROZEN = {
  title: 'טענות הדף',
  present: 'קיימת בצילום האחרון',
  absent: 'אינה בצילום האחרון',
  empty: 'לא אותרו טענות במעקב בדף הזה',
  overTime: 'הטענה לאורך הזמן',
  capturePresent: 'קיימת',
  captureAbsent: 'אינה שם',
  leftIn: 'השינוי שבו הוסרה',
  returnedIn: 'השינוי שבו חזרה',
  // AMENDED 2026-09-20 to an ICU plural (frozen file sha 24a5026f…): a group of two said "2 more claims",
  // which is a sentence Hebrew does not make. Both RENDERED branches are pinned below.
  alsoMoved: '{count, plural, one {ועוד טענה אחת שנעה יחד איתה} other {ועוד # טענות שנעו יחד איתה}}',
  entry: 'הטענות בדף הזה',
} as const;

/** The two forms the plural above RENDERS — not catalogue values, so they sit beside the frozen set. */
const PLURAL = {
  one: 'ועוד טענה אחת שנעה יחד איתה',
  other: (count: number) => `ועוד ${String(count)} טענות שנעו יחד איתה`,
} as const;

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/corpus/claims');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function containerOf(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('the claims view answered the one 404, not a body');
  return rendered.container;
}

/**
 * THE SHELL AROUND THE PAGE, WITH THE PANE BESIDE IT — the `pane-tabs-declared` idiom.
 *
 * A sheet is DECLARED into the shell's registry and DRAWN by `RightPane`; a page rendered without the pane
 * declares its tab into a registry nobody reads, so `document` holds no sheet at all. Two cases below read
 * the drawn sheet, so they must render what a reader's browser renders.
 */
const inTheShell = ({ children }: { children: React.ReactNode }) => (
  <TabsProvider>
    {children}
    <RightPane />
  </TabsProvider>
);

async function render(searchParams: Record<string, string>, staged: Record<string, { status: 200; body: unknown } | { status: 404 } | { status: 400 }> = { [WIRE]: { status: 200, body: claimsAnswer } }): Promise<PageRender> {
  setPublicBodies(staged);
  return renderPage((await claimsPage()).default, { locale: LOCALE }, { locale: LOCALE, searchParams, wrapper: inTheShell });
}

describe('claims-per-page', () => {
  it('CP-1 THE CATALOGUE HOLDS THE FROZEN WORDS, byte for byte, in both locales — the control for every case below', () => {
    const claims = he.corpus.claims as Record<string, string>;
    expect({
      title: claims['title'],
      present: claims['present'],
      absent: claims['absent'],
      empty: claims['empty'],
      overTime: claims['overTime'],
      capturePresent: claims['capturePresent'],
      captureAbsent: claims['captureAbsent'],
      leftIn: claims['leftIn'],
      returnedIn: claims['returnedIn'],
      alsoMoved: claims['alsoMoved'],
      entry: claims['entry'],
    }).toEqual(FROZEN);
  });

  it('CP-2 A BARE `/corpus/claims` IS THE ONE 404, and so is a `page` that parses to nothing (§25 :783, §24 region 0)', async () => {
    // NOTHING IS STAGED: a page that read before it refused would fail on the double, which is the point —
    // the refusal must happen before any read, because there is no page to read about.
    setPublicBodies({});
    const bare = await renderPage((await claimsPage()).default, { locale: LOCALE }, { locale: LOCALE, searchParams: {} });
    const blank = await renderPage((await claimsPage()).default, { locale: LOCALE }, { locale: LOCALE, searchParams: { page: '   ' } });
    const empty = await renderPage((await claimsPage()).default, { locale: LOCALE }, { locale: LOCALE, searchParams: { page: '' } });
    // A TWO-SIDED FLOOR: the same call WITH a page must render, or "everything 404s" would pass this case.
    const real = await render({ page: 'page-one' });
    expect({ bare: bare.notFound, blank: blank.notFound, empty: empty.notFound, real: real.notFound }).toEqual({
      bare: true,
      blank: true,
      empty: true,
      real: false,
    });
  });

  it('CP-3 THE PUBLIC DOOR`S 404 IS THIS VIEW`S 404 — a page not surveyed and one no thesis opened alike', async () => {
    const refused = await render({ page: 'page-one' }, { [WIRE]: { status: 404 } });
    expect(refused.notFound).toBe(true);
  });

  it('CP-4 THE ROWS RENDER IN THE READ`S ORDER — the page re-sorts nothing, and the key is not on the row', async () => {
    const container = containerOf(await render({ page: 'page-one' }));
    const rows = requireSubjects('claim rows', [...container.querySelectorAll('[data-claim-row]')]);
    const firstWords = rows.map((row) => row.querySelector('.record-captured')?.textContent ?? '');
    expect({
      count: rows.length,
      firstWords,
    }).toEqual({
      count: claimsAnswer.entries.length,
      firstWords: claimsAnswer.entries.map((entry) => entry.claims.at(0)?.claimText ?? ''),
    });
    // THE ORDER IS NOT ANY ORDER THE ROW COULD PRODUCE FOR ITSELF. `lastSeen` descending is the plausible
    // re-sort — it looks like "newest first" and is a different list — so the fixture is built to make the
    // two disagree, and this asserts they do. Without it a page that sorted by `lastSeen` would pass above.
    const byLastSeen = [...claimsAnswer.entries].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1)).map((entry) => entry.claims.at(0)?.claimText ?? '');
    expect(firstWords).not.toEqual(byLastSeen);
  });

  it('CP-5 ONE TICK PER CAPTURE, each carrying its own instant — never one per flip span', async () => {
    const container = containerOf(await render({ page: 'page-one' }));
    const rows = requireSubjects('claim rows', [...container.querySelectorAll('[data-claim-row]')]);
    const perRow = rows.map((row) => [...row.querySelectorAll('[data-claim-tick]')]);
    expect({
      ticks: perRow.map((ticks) => ticks.length),
      instants: perRow.map((ticks) => ticks.map((tick) => tick.getAttribute('data-capture'))),
      present: perRow.map((ticks) => ticks.map((tick) => tick.getAttribute('data-present') === 'true')),
    }).toEqual({
      ticks: claimsAnswer.entries.map((entry) => entry.captures.length),
      instants: claimsAnswer.entries.map((entry) => entry.captures.map((capture) => capture.waybackTimestamp)),
      present: claimsAnswer.entries.map((entry) => entry.captures.map((capture) => capture.present)),
    });
    // THE TWO ACCOUNTS DISAGREE ON THIS FIXTURE, which is what makes the case above an assertion rather than
    // a coincidence: at least one row has more captures than spans, so "one tick per span" would be a
    // DIFFERENT number and not merely a different source.
    expect(claimsAnswer.entries.some((entry) => entry.captures.length > entry.changes.length)).toBe(true);
    // AND NO INSTANT IS TEXT (§4 :167): the 14-digit names live in `data-`, never in a text node.
    const timestamps = new Set(claimsAnswer.entries.flatMap((entry) => entry.captures.map((capture) => capture.waybackTimestamp)));
    for (const node of textNodes(container)) {
      for (const timestamp of timestamps) expect(node.textContent ?? '').not.toContain(timestamp);
    }
  });

  it('CP-6 A ROW SAYS EXACTLY FIVE THINGS AT MOST, and nothing else reaches a reader', async () => {
    const container = containerOf(await render({ page: 'page-one' }));
    const rows = requireSubjects('claim rows', [...container.querySelectorAll('[data-claim-row]')]);

    // THE WHOLE TEXT OF A ROW, PINNED — not a selector per fact. §25 :790–:792 lists what a row carries and
    // the 2026-09-18 ruling REMOVED two marks from it; a case that asked for each named fact by its own
    // attribute would be green over a SIXTH thing drawn beside them under an attribute nobody thought to
    // query. Reading every text node and pinning the SET is the only form of that assertion that closes.
    const said = rows.map((row) => textNodes(row).map((node) => node.data).filter((text) => text.trim() !== ''));
    const expected = claimsAnswer.entries.map((entry) => [
      entry.claims[0]?.claimText ?? '',
      displayUrl(entry.page.url),
      // `theses.sheet.transitions`, CALLED on this row and rendered — every row of the set flips at least
      // twice (MIN_TRANSITIONS is 2), so the plural's `other` branch is the one that draws here.
      `${String(entry.transitions)} מעברים`,
      entry.finalState === 'PRESENT' ? FROZEN.present : FROZEN.absent,
      // AND THE COUNT WORD ONLY WHERE THERE IS A GROUP, counting the OTHERS — both plural branches render,
      // because the set carries a group of three and a group of exactly two.
      ...(entry.claimCount > 1 ? [entry.claimCount === 2 ? PLURAL.one : PLURAL.other(entry.claimCount - 1)] : []),
    ]);
    expect(said).toEqual(expected);

    // THE FLOOR ON THE PLURAL: both branches were really drawn, so "the plural renders" is a claim about
    // two forms and not about one repeated.
    expect({
      one: said.filter((row) => row.includes(PLURAL.one)).length,
      other: said.filter((row) => row.some((text) => /^ועוד \d+ טענות/.test(text))).length,
      // The set carries EXACTLY one group of two and one larger group, so each branch is drawn once.
    }).toEqual({ one: 1, other: 1 });

    // NEITHER MARK THE 2026-09-18 RULING REMOVED (§25 :795–:806) is on any row, by attribute as well — the
    // set assertion above catches the WORDS, this catches a mark drawn with no words at all.
    expect([...container.querySelectorAll('[data-cited-mark], [data-currency-mark]')]).toEqual([]);
  });

  it('CP-7 THE SHEET`S CAPTURE AND DIFF HREFS EQUAL THE COMPOSED URLS, and the diffs are consecutive-capture pairs', async () => {
    const container = containerOf(await render({ page: 'page-one' }));

    // THE ROW THIS CASE OPENS IS CHOSEN, NOT TAKEN FIRST, and a decoy is why. A row whose every span holds
    // exactly ONE capture has `changes` and `captures` carrying the same timestamps in the same order, so on
    // it the two accounts COINCIDE — and the decoy that composed the sheet's diffs from the spans reddened
    // nothing at all, because the first row of the set is exactly that row. The case must open one where the
    // distinction exists, and must SAY it did.
    const entry = claimsAnswer.entries.find((row) => row.captures.length > row.changes.length);
    if (entry === undefined) throw new Error('CP-7: the fixture set holds no row whose spans cover several captures');
    expect(entry.captures.length).toBeGreaterThan(entry.changes.length);

    const first = container.querySelector(`[data-open-claim="claim:${entry.page.trackedUrlId}:${entry.patternHash}"]`);
    if (first === null) throw new Error('CP-7: no row to tap');
    // `fireEvent` AND NOT `.click()`: the tap sets state that the PANE reads, so the update has to be inside
    // `act` or the sheet is declared into a registry that never re-rendered. A raw `.click()` leaves the
    // assertion reading the tree as it was before the tap — green on a page that opened nothing.
    fireEvent.click(first);

    const id = entry.page.trackedUrlId;
    const sheet = requireSubjects('the declared sheet', [...container.querySelectorAll('[data-claim-sheet]')]).at(0);
    if (sheet === undefined) throw new Error('CP-7: the tap declared no sheet');

    const captureHrefs = [...sheet.querySelectorAll('[data-capture-link]')].map((link) => link.getAttribute('href'));
    const diffHrefs = [...sheet.querySelectorAll('[data-diff-link]')].map((link) => link.getAttribute('href'));
    const flips = flipsOf(entry.captures);
    expect({
      captures: captureHrefs,
      diffs: diffHrefs,
      states: [...sheet.querySelectorAll('[data-capture-state]')].map((one) => one.textContent),
      directions: [...sheet.querySelectorAll('[data-flip-direction]')].map((one) => one.textContent),
      heading: sheet.querySelector('.record-title')?.textContent,
    }).toEqual({
      captures: entry.captures.map((capture) => `/pages/${id}/captures/${capture.waybackTimestamp}`),
      diffs: flips.map((flip) => `/pages/${id}/diffs/${flip.before.waybackTimestamp}/${flip.after.waybackTimestamp}`),
      states: entry.captures.map((capture) => (capture.present ? FROZEN.capturePresent : FROZEN.captureAbsent)),
      directions: flips.map((flip) => (flip.after.present ? FROZEN.returnedIn : FROZEN.leftIn)),
      heading: FROZEN.overTime,
    });

    // A FLOOR, so none of the three lists above is satisfied by emptiness — and the pairs are CONSECUTIVE
    // captures, which is the property that makes them diffs the walk wrote.
    expect(captureHrefs.length).toBeGreaterThanOrEqual(3);
    expect(diffHrefs.length).toBeGreaterThanOrEqual(2);
    for (const flip of flips) {
      const before = entry.captures.indexOf(flip.before);
      expect(entry.captures.indexOf(flip.after)).toBe(before + 1);
    }
  });

  it('CP-8 A GROUP`S SHEET LISTS EVERY MEMBER, each with ONE copy control carrying its own `#tr_` token', async () => {
    const container = containerOf(await render({ page: 'page-one' }));
    const group = claimsAnswer.entries.find((entry) => entry.claimCount > 1);
    if (group === undefined) throw new Error('CP-8: the fixture set no longer carries a group row');
    const tap = container.querySelector(`[data-open-claim="claim:${group.page.trackedUrlId}:${group.patternHash}"]`);
    if (tap === null) throw new Error('CP-8: the group row has no tap');
    fireEvent.click(tap);

    const members = requireSubjects('the group`s members', [...container.querySelectorAll('[data-claim-members] > li')]);
    expect({
      count: members.length,
      texts: members.map((member) => member.querySelector('.record-captured')?.textContent),
      tokens: members.map((member) => member.querySelector('[data-copy-value]')?.getAttribute('data-copy-value')),
      controlsPerMember: members.map((member) => member.querySelectorAll('[data-copy-value]').length),
    }).toEqual({
      count: group.claims.length,
      texts: group.claims.map((claim) => claim.claimText),
      // A THESIS CITES ONE `ClaimTrajectory.id` AND NEVER A PATTERN (§25 :810; T2 :373), so the group's own
      // `patternHash` must appear in no token at all.
      tokens: group.claims.map((claim) => `#tr_${claim.trajectoryId}`),
      controlsPerMember: group.claims.map(() => 1),
    });
    expect(container.innerHTML).not.toContain(`#tr_${group.patternHash}`);
  });

  it('CP-9 A PAGE WITH NO TRAJECTORIES SAYS SO — the empty sentence, not an empty list and not a 404', async () => {
    const container = containerOf(await render({ page: 'page-two' }, { '/api/corpus/claims?page=page-two': { status: 200, body: claimsUndetected } }));
    expect({
      sentence: container.querySelector('[data-claims-empty]')?.textContent,
      rows: container.querySelectorAll('[data-claim-row]').length,
    }).toEqual({ sentence: FROZEN.empty, rows: 0 });
  });

  it('CP-12 EMPTY HAS TWO SENTENCES AND THEY SAY DIFFERENT THINGS — nothing was tracked, against nothing in this range', async () => {
    // (a) THE PAGE IS NAMED IN `undetected`: no pass describes its current state, so the corpus has nothing
    // to say about this page's claims at all. That is the view's own sentence.
    const tracked = containerOf(await render({ page: 'page-two' }, { '/api/corpus/claims?page=page-two': { status: 200, body: claimsUndetected } }));

    // (b) A DATE CHIP IS IN FORCE and the read came back empty. The corpus may know plenty about this page —
    // the reader has simply asked about a window with nothing in it — so saying "no tracked claims were
    // found on this page" would be FALSE, and false in the direction that closes an investigation.
    //
    // BOTH ONE-SIDED WINDOWS, and that is the whole of this arm. A window may be open at either end: `since`
    // alone asks "anything after this day", `until` alone "anything before it", and each narrows the answer
    // exactly as a closed range does. An emptiness rule that read only ONE of the two would be green on
    // every case written with that one — the arm would agree with the defect rather than catch it — so the
    // sentence is asserted over each end in turn, from a set that is stated rather than implied.
    // ANNOTATED AT THE LITERAL, so each `params` is checked against the shape `render` takes rather than
    // inferred into a union of two half-optional objects — which is what `tsc` refused, and refused
    // correctly: the suite ran the same file green, so the compiler is the only reader that saw it.
    const WINDOWS: readonly { name: string; params: Record<string, string>; wire: string }[] = [
      { name: 'since alone', params: { since: '2023-01-01' }, wire: '/api/corpus/claims?page=page-one&since=2023-01-01' },
      { name: 'until alone', params: { until: '2021-01-01' }, wire: '/api/corpus/claims?page=page-one&until=2021-01-01' },
    ];
    const ONE_SIDED = requireSubjects('the one-sided windows', WINDOWS);
    const windows: { name: string; filtered: string | undefined; claims: string | null; chips: number }[] = [];
    for (const one of ONE_SIDED) {
      const container = containerOf(await render({ page: 'page-one', ...one.params }, {
        [one.wire]: { status: 200, body: { entries: [], undetected: [], nextCursor: null } },
      }));
      windows.push({
        name: one.name,
        filtered: container.querySelector('[data-stream-empty]')?.textContent,
        claims: container.querySelector('[data-claims-empty]')?.textContent ?? null,
        chips: container.querySelectorAll('[data-chip]').length,
      });
    }
    expect(windows).toEqual(
      ONE_SIDED.map((one) => ({ name: one.name, filtered: he.corpus.emptyFiltered, claims: null, chips: 2 })),
    );
    const filtered = containerOf(await render({ page: 'page-one', since: '2023-01-01' }, {
      '/api/corpus/claims?page=page-one&since=2023-01-01': { status: 200, body: { entries: [], undetected: [], nextCursor: null } },
    }));

    // (c) A 400: the range is malformed, so the read answered nothing at all and the page knows even less
    // than in (b). A2 :1149 gives it the filtered rendering with the chips shown for removal.
    const refused = '/api/corpus/claims?page=page-one&since=2023-05-01&until=2022-01-01';
    const four = containerOf(await render({ page: 'page-one', since: '2023-05-01', until: '2022-01-01' }, { [refused]: { status: 400 } }));

    expect({
      trackedSentence: tracked.querySelector('[data-claims-empty]')?.textContent,
      trackedFiltered: tracked.querySelector('[data-stream-empty]')?.textContent ?? null,
      filteredSentence: filtered.querySelector('[data-stream-empty]')?.textContent,
      filteredClaimsSentence: filtered.querySelector('[data-claims-empty]')?.textContent ?? null,
      refusedSentence: four.querySelector('[data-stream-empty]')?.textContent,
      refusedClaimsSentence: four.querySelector('[data-claims-empty]')?.textContent ?? null,
      // AND THE CHIPS ARE STILL THERE in both filtered arms — a reader who cannot see the filter cannot
      // remove the filter, which is the whole of A2's "shown for removal".
      filteredChips: filtered.querySelectorAll('[data-chip]').length,
      refusedChips: four.querySelectorAll('[data-chip]').length,
    }).toEqual({
      trackedSentence: FROZEN.empty,
      trackedFiltered: null,
      filteredSentence: he.corpus.emptyFiltered,
      filteredClaimsSentence: null,
      refusedSentence: he.corpus.emptyFiltered,
      refusedClaimsSentence: null,
      filteredChips: 2,
      refusedChips: 3,
    });
  });

  it('CP-11 THE CONTEXT LINE SERVES THIS VIEW — PAGE and the dates, no KIND, no CITED, no lens; removal stays on the claims view', async () => {
    const container = containerOf(await render({ page: 'page-one', since: '2022-01-01', until: '2022-12-31' }, {
      '/api/corpus/claims?page=page-one&since=2022-01-01&until=2022-12-31': { status: 200, body: claimsAnswer },
    }));
    const chips = requireSubjects('the chips of the claims view', [...container.querySelectorAll('[data-chip]')]);
    const labelled = chips.map((chip) => [chip.textContent, chip.getAttribute('href')]);
    expect(labelled).toEqual([
      // THE PAGE CHIP LEAVES THE VIEW, and that is right: without a page there is no claims view, so its
      // removal lands on `/corpus` — carrying the dates, because removing one chip never clears the others.
      [he.corpus.filters.page, '/he/corpus?since=2022-01-01&until=2022-12-31'],
      // THE DATE CHIPS STAY ON THE VIEW. A `since` removed from the claims view must leave the reader on the
      // claims view of the same page; a chip that dropped them back to the stream would be a filter that
      // navigates, which §24 region 2 is not.
      [he.corpus.filters.since, '/he/corpus/claims?page=page-one&until=2022-12-31'],
      [he.corpus.filters.until, '/he/corpus/claims?page=page-one&since=2022-01-01'],
    ]);
    // KIND AND CITED ARE THE STREAM'S AND THIS READ TAKES NEITHER (§6.1 :247): a chip that sent one would
    // earn `Unrecognized key` from the route, so the control must not be drawn at all.
    expect({
      kind: chips.filter((chip) => chip.textContent === he.corpus.kind.capture || chip.textContent === he.corpus.kind.diff).length,
      cited: chips.filter((chip) => chip.textContent === he.corpus.filters.cited).length,
      // AND NO LENS IS ACTIVE HERE. PAGES and CITED are `/corpus`'s two doorways; drawing them on this view
      // would mark one of them current on a page that is neither.
      lenses: container.querySelectorAll('[data-corpus-lenses]').length,
    }).toEqual({ kind: 0, cited: 0, lenses: 0 });
  });

  it('CP-10 A 400 IS THE FILTERS SHOWN FOR REMOVAL (A2 :1149) — the PAGE chip is drawn from the filters, not the facet', async () => {
    const wire = '/api/corpus/claims?page=page-one&since=2023-05-01&until=2022-01-01';
    const container = containerOf(await render({ page: 'page-one', since: '2023-05-01', until: '2022-01-01' }, { [wire]: { status: 400 } }));
    const chips = requireSubjects('the chips shown for removal', [...container.querySelectorAll('[data-chip]')]);
    // THE READ RETURNED NO FACET, so a chip drawn from the answer would be missing exactly when it is needed.
    // REMOVAL KEEPS THE OTHERS (§24 region 2), so the page chip's href drops `page=` and carries the dates —
    // asserting it pointed at a bare `/corpus` would be asserting that removing one chip clears them all.
    const pageChip = chips.find((chip) => chip.textContent === he.corpus.filters.page);
    expect({
      pageChipHref: pageChip?.getAttribute('href'),
      pageChipActive: pageChip?.getAttribute('data-chip-active'),
      removable: chips.filter((chip) => chip.getAttribute('data-chip-active') === 'true').length,
      rows: container.querySelectorAll('[data-claim-row]').length,
    }).toEqual({
      pageChipHref: '/he/corpus?since=2023-05-01&until=2022-01-01',
      pageChipActive: 'true',
      removable: 3,
      rows: 0,
    });
  });
});
