jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { requireSubjects } from './scan';
import list from './fixtures/thesis/list.json';

// ---------------------------------------------------------------------------
// theses-list-is-the-catalogue — docs/gf-ui-flows.md §3 :145 (UN-RETIRED 2026-09-18: "every PUBLISHED thesis,
// one row each, newest first"), §33 :959–:969 (the door keeps the LATEST and the list moved here, carrying the
// fewness reasoning with it), §32 :934 (`תזות` leads here), A1 :1119; docs/gf-ui-refactor-plan.md UI-7 :600–:610.
//
// "ONE PAGE CANNOT BE BOTH THE WELCOME AND THE CATALOGUE" (§33 :969) is the sentence this instrument is named
// for, and it cuts BOTH ways: the page must BE the catalogue — every published thesis, newest first — and it
// must be ONLY the catalogue. No search, no filter, no count (§33 :964–:966: the fewness reasoning moved with
// the list), and NO DISCLAIMER: COMPLIANCE.md :92 names every thesis page and every `/call/[thesisId]` page,
// and a list of theses is neither.
//
// THE FIXTURE IS HAND-WRITTEN FROM A4 :1427 and carries all SIX fields, `contentHash` included, because it is a
// BODY. The parser narrows five (`types/thesis.ts`): a fixture that carried only what the parser keeps could
// never witness the narrowing. Its three rows are deliberately OUT OF ORDER, so "newest first" is a sort this
// case measures rather than the order the fixture happened to be written in.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const thesesPage = () => import('../src/app/[locale]/theses/page');

/** The fixture's claims, NEWEST FIRST — the order the page must produce, by value. */
const NEWEST_FIRST = [
  'הטענה החדשה ביותר: הודעת משרד הבריאות על סיכון ידוע הוסרה ולא הוחזרה',
  'הטענה האמצעית: בין שני צילומים נגרע מדף המידע הרשמי סעיף תופעות הלוואי על כותרתו',
  'הטענה הוותיקה ביותר: לא פורסמה הערכת סיכונים לפני תחילת ההתערבות',
];

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function containerOf(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('/theses answered a 404, not a body');
  return rendered.container;
}

async function renderList(body: unknown, locale: Locale = LOCALE): Promise<HTMLElement> {
  setPublicBodies({ '/api/thesis': { status: 200, body } });
  return containerOf(await renderPage((await thesesPage()).default, { locale }, { locale }));
}

const claimsOf = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-thesis-row]')].map((row) => (row.querySelector('[data-claim]')?.textContent ?? '').trim());

const shownText = (container: HTMLElement): string =>
  textNodes(container)
    .map((node) => node.data)
    .join(' ');

describe('theses-list-is-the-catalogue', () => {
  it('ONE ROW PER PUBLISHED THESIS, NEWEST FIRST — asserted by the CLAIMS IN ORDER, not by a count', () => {
    // A count of three is satisfied by the wrong three and by any order at all. The VALUE is the assertion:
    // the fixture is written oldest-in-the-middle so neither the given order nor its reverse can pass.
    return renderList(list).then((container) => {
      expect({ claims: claimsOf(container), rows: container.querySelectorAll('[data-thesis-row]').length }).toEqual({
        claims: NEWEST_FIRST,
        rows: 3,
      });
    });
  });

  it('A ROW CARRIES THE CLAIM, THE PROVISION AS A LABEL, THE HANDLE AND „פורסם <date>" — and links to that thesis', async () => {
    const container = await renderList(list);
    const first = container.querySelector('[data-thesis-row]');
    const shown = (first?.textContent ?? '').trim();
    expect({
      claim: shown.includes(NEWEST_FIRST[0] ?? ''),
      // THE PROVISION LABEL, which proves `ProvisionName` is CALLED and not re-spelled: `NUREMBERG_1` is a CODE,
      // and what a reader must see is the catalogue's word for it (`provision-is-a-lookup`, landed 2026-09-19).
      provisionLabel: shown.includes('קוד נירנברג, סעיף 1'),
      codeIsNotShown: shown.includes('NUREMBERG_1'),
      handle: shown.includes('handle-fixture'),
      publishedLine: shown.includes('פורסם 14.9.2026'),
      href: first?.querySelector('a')?.getAttribute('href'),
    }).toEqual({
      claim: true,
      provisionLabel: true,
      codeIsNotShown: false,
      handle: true,
      publishedLine: true,
      href: '/he/theses/cmu0yyflb00038861pp46alwr',
    });
  });

  it('THE PAGE IS ONLY THE CATALOGUE — no search, no filter, no count, and NO DISCLAIMER — by query, with a control', async () => {
    const container = await renderList(list);
    // THE POSITIVE CONTROL, in the same `expect()`: every selector below is run against a fragment that HAS the
    // thing, so a query blinded by a typo fails HERE instead of reporting a clean page. An absence is the
    // easiest assertion in the world to make by accident.
    const control = document.createElement('div');
    control.innerHTML = '<form><input /></form><span data-count>3</span><p>ניתוח משפטי בתום לב בעניין ציבורי. אינו קביעה שיפוטית.</p>';
    const shown = shownText(container);
    expect({
      searchBoxes: container.querySelectorAll('input, form').length,
      counts: container.querySelectorAll('[data-count]').length,
      // COMPLIANCE.md :95–:96's own phrases. The disclaimer belongs to a thesis page and a call page; a list is
      // neither, and the researcher ruled it off this page.
      disclaimer: ['קביעה שיפוטית', 'ניתוח משפטי בתום לב'].filter((phrase) => shown.includes(phrase)),
      // THE FLOOR: the page did render its rows, so "nothing found" is a fact about the chrome and not about a
      // render that failed.
      rows: container.querySelectorAll('[data-thesis-row]').length,
      controlFindsAll: [
        control.querySelectorAll('input, form').length,
        control.querySelectorAll('[data-count]').length,
        ['קביעה שיפוטית', 'ניתוח משפטי בתום לב'].filter((phrase) => (control.textContent ?? '').includes(phrase)).length,
      ],
    }).toEqual({ searchBoxes: 0, counts: 0, disclaimer: [], rows: 3, controlFindsAll: [2, 1, 2] });
  });

  it('THE EMPTY STATE IS THE APPROVED SENTENCE — a catalogue with nothing in it is a fact, not an error', async () => {
    const container = await renderList([]);
    expect({
      empty: (container.querySelector('[data-theses-empty]')?.textContent ?? '').trim(),
      rows: container.querySelectorAll('[data-thesis-row]').length,
    }).toEqual({ empty: 'עדיין לא פורסמה תזה', rows: 0 });
  });

  it('A ROW WITH NO `publishedAt` KEEPS ITS PLACE AT THE END AND DRAWS NO DATE LINE — `Byline.tsx` :22\'s pattern', async () => {
    // THE ROUTE CAN ANSWER THIS: `publishedEntries()` filters on `publishedVersionId: { not: null }` and selects
    // `publishedAt` separately, so the two can disagree. "Newest first" has no defined answer over a null, and
    // the researcher ruled it 2026-09-19: the row is NEVER dropped (that would hide a published thesis) and
    // never sorted to the head (an anomaly at the top of a public catalogue) — it sorts LAST, and it draws its
    // handle with no date, which is exactly what `Byline.tsx` :22 has done on the thesis page since UI-5.
    // Index 1 of the fixture is the NEWEST row, which makes this the strongest form of the assertion: the row
    // that would otherwise be FIRST must end up LAST, so the sort cannot pass by leaving the order alone.
    const undated = [...list].map((row, index) => (index === 1 ? { ...row, publishedAt: null } : row));
    const container = await renderList(undated);
    const rows = [...container.querySelectorAll('[data-thesis-row]')];
    const undatedRow = rows.at(-1);
    expect({
      claims: claimsOf(container),
      undatedDrawsNoDate: (undatedRow?.textContent ?? '').includes('פורסם'),
      undatedKeepsItsHandle: (undatedRow?.textContent ?? '').includes('handle-fixture'),
      // The control, so "no date line" is not read over a page that drew no dates at all.
      datedRowsStillDraw: rows.filter((row) => (row.textContent ?? '').includes('פורסם')).length,
    }).toEqual({
      claims: [NEWEST_FIRST[1], NEWEST_FIRST[2], NEWEST_FIRST[0]],
      undatedDrawsNoDate: false,
      undatedKeepsItsHandle: true,
      datedRowsStillDraw: 2,
    });
  });

  it('THE PAGE MAKES EXACTLY ONE READ AND IT IS `/api/thesis` — §8, asserted on the READ', async () => {
    await renderList(list);
    const calls = requireSubjects('reads made by /theses', apiCallsMade());
    expect({ paths: calls.map((call) => call.path), everyOneParsed: calls.every((call) => call.parsed) }).toEqual({
      paths: ['/api/thesis'],
      everyOneParsed: true,
    });
  });
});
