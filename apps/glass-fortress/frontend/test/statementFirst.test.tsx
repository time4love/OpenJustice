jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { requireSubjects, SRC } from './scan';
import published from './fixtures/thesis/published.json';
import publishedNoStatement from './fixtures/thesis/published-no-statement.json';
import withdrawn from './fixtures/thesis/withdrawn.json';
import versionPrevious from './fixtures/thesis/version-previous.json';
import callLive from './fixtures/thesis/call-live.json';

// ---------------------------------------------------------------------------
// statement-and-disclaimer-first — docs/gf-ui-flows.md §23 :638–:640, §17 :526–:528, §20 :607;
// COMPLIANCE.md rule 5 :82–:84 and the disclaimer :95–:99; docs/gf-ui-refactor-plan.md UI-5 :385–:386, :444–:446.
//
// THE FIRST TWO CONTENT ELEMENTS OF `<main>`, in document order: the public-interest statement, then the
// LEGAL DISCLAIMER VERBATIM. The chrome is outside `<main>` by construction (UI-4), so a page's own `<main>`
// is the whole subject — the reading the UI plan session put to the researcher (its state file :13).
//
// The disclaimer's two texts are LITERAL here, copied from COMPLIANCE.md :95–:99: a case that read them from
// `messages/` would pass a paraphrase that both files carried.
// ---------------------------------------------------------------------------

const DISCLAIMER: Record<Locale, string> = {
  he: 'כל הטענות המוצגות מבוססות על ראיות מתועדות ומהוות ניתוח משפטי בתום לב בעניין ציבורי. אין בהן קביעה שיפוטית. הפלטפורמה מציגה חומר לצורך חקירה ציבורית בלבד.',
  en: 'All claims presented are based on documented evidence and constitute good-faith legal analysis on a matter of public interest. They do not constitute a judicial finding. This platform presents material for purposes of public investigation only.',
};
const LOCALES: readonly Locale[] = ['he', 'en'];

const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const callPage = () => import('../src/app/[locale]/call/[thesisId]/page');
const versionPage = () => import('../src/app/[locale]/theses/[id]/versions/[v]/page');

const thesisBodies = (body: unknown) => ({ [`/api/thesis/${(body as { thesisId: string }).thesisId}`]: { status: 200 as const, body } });

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
});

afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

/**
 * `<main>`'s whole text, whitespace-normalised, in DOCUMENT ORDER.
 *
 * RE-POINTED AT UI-5 (the researcher's ruling of 2026-09-17, „אפשרות ב”; §10 :1126, "`statement-and-
 * disclaimer-first` holds document order, NOT the fold"; §23 :638–:640). The preface is now ONE
 * element that grows, so the statement and the disclaimer are no longer `<main>`'s first two
 * CHILDREN — they are the first two things in its TEXT, which is what the contract actually says.
 *
 * IT IS STRICTLY STRONGER THAN THE OLD SPELLING, and the two properties it gains are the point:
 *   · the old `textOf(children[0])` could not see text inserted INSIDE children[0] BEFORE the
 *     statement; reading every text node in order can.
 *   · the old spelling never asserted the statement was WHOLE — `textOf(children[0])` equalled
 *     whatever children[0] said, so a `.slice()` or a paraphrase passed. The full string is compared.
 * It gives up only the claim that the two are two ELEMENTS, which is exactly what §10 :1126 releases.
 */
function mainText(rendered: PageRender): string {
  if (rendered.notFound) throw new Error('the page answered the one 404, not a body');
  const main = rendered.container.querySelector('main');
  if (main === null) throw new Error('the page rendered no <main> — the chrome is the layout’s, the page renders its own');
  // THE EXTRACTION METHOD IS PART OF THE ASSERTION, and it has to be said or the expected string is a
  // guess. `main.textContent` concatenates adjacent block elements with NO separator — measured: the
  // statement's final „.” sits directly against the disclaimer's first „כ” — so an expected string
  // built with a joining space could never match it, while one built without a space would match two
  // runs that a reader sees as one word. The runs are therefore read as TEXT NODES and joined by a
  // single space: stable whether the statement and the disclaimer sit in one element or in two, which
  // is exactly what the fold ("one element that grows") requires of this case.
  return textNodes(main)
    .map((node) => node.data.trim())
    .filter((run) => run !== '')
    .join(' ');
}

/**
 * The opening of `<main>`'s text, measured against the string it is compared to.
 *
 * THE EXPECTED STRING IS BUILT FIRST AND THE SLICE TAKES **ITS** LENGTH. Computing the boundary as
 * `statement.length + disclaimer.length` is off by the joining space — 587 against 588 on the fixture
 * — and can never pass. A case that measures the string it compares against cannot drift from it.
 */
function opensWith(rendered: PageRender, ...runs: string[]): { opening: string; expected: string } {
  const expected = runs.join(' ');
  return { opening: mainText(rendered).slice(0, expected.length), expected };
}

/** `<main>`'s own child elements, in document order — still the subject of the LAST-element case. */
function contentElements(rendered: PageRender): Element[] {
  if (rendered.notFound) throw new Error('the page answered the one 404, not a body');
  const main = rendered.container.querySelector('main');
  if (main === null) throw new Error('the page rendered no <main> — the chrome is the layout’s, the page renders its own');
  return [...main.children];
}

const textOf = (element: Element | undefined): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function renderThesis(body: unknown, locale: Locale): Promise<PageRender> {
  setPublicBodies(thesisBodies(body));
  const page = (await thesisPage()).default;
  return renderPage(page, { locale, id: (body as { thesisId: string }).thesisId }, { locale });
}

describe('statement-and-disclaimer-first', () => {
  it("/theses/[id] — <main>'s text BEGINS with the statement verbatim, immediately followed by the disclaimer verbatim, in both locales", async () => {
    for (const locale of LOCALES) {
      const { opening, expected } = opensWith(
        await renderThesis(published, locale),
        published.publicInterestStatement,
        DISCLAIMER[locale],
      );
      expect([locale, opening]).toEqual([locale, expected]);
    }
  });

  it('/call/[thesisId] — the same two runs, opening <main>, in both locales', async () => {
    for (const locale of LOCALES) {
      setPublicBodies({
        [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
        [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
      });
      const page = (await callPage()).default;
      const { opening, expected } = opensWith(
        await renderPage(page, { locale, thesisId: published.thesisId }, { locale }),
        published.publicInterestStatement,
        DISCLAIMER[locale],
      );
      expect([locale, opening]).toEqual([locale, expected]);
    }
  });

  it('a thesis with no statement renders the disclaimer first and nothing above it (§23 :639–:640)', async () => {
    const elements = contentElements(await renderThesis(publishedNoStatement, 'he'));
    expect(textOf(elements[0])).toEqual(DISCLAIMER.he);
  });

  it('the withdrawal notice renders the disclaimer first, on the thesis page and on the call page', async () => {
    const thesis = contentElements(await renderThesis(withdrawn, 'he'));
    setPublicBodies({ [`/api/thesis/${withdrawn.thesisId}`]: { status: 200, body: withdrawn } });
    const call = (await callPage()).default;
    const onCall = contentElements(await renderPage(call, { locale: 'he', thesisId: withdrawn.thesisId }, { locale: 'he' }));
    expect([textOf(thesis[0]), textOf(onCall[0])]).toEqual([DISCLAIMER.he, DISCLAIMER.he]);
  });

  it('the version page opens with the statement and the disclaimer, THEN the banner (the researcher’s ruling q3, 2026-09-16)', async () => {
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
    });
    const page = (await versionPage()).default;
    const rendered = await renderPage(page, { locale: 'he', id: published.thesisId, v: versionPrevious.versionId }, { locale: 'he' });
    // Re-spelled with the other two, and for the same reason: the preface is now ONE element holding
    // both runs, so `children[0]`/`[1]` no longer name them. The PROPERTY is unchanged — the statement,
    // then the disclaimer, THEN the banner (the researcher's ruling q3, 2026-09-16) — and it is now
    // asserted over document order, which is what §10 :1126 says this instrument holds.
    const { opening, expected } = opensWith(rendered, published.publicInterestStatement, DISCLAIMER.he);
    expect(opening).toEqual(expected);
    expect(mainText(rendered).slice(expected.length)).toMatch(/^ ?זו גרסה קודמת שפורסמה/);
  });

  it("the short disclaimer is <main>'s LAST element on the thesis page and the call page (§17.8, §20.6; the footer carries none — R54)", async () => {
    const SHORT = 'ניתוח משפטי בתום לב בעניין ציבורי, המבוסס על ראיות מתועדות. אינו קביעה שיפוטית.';
    const thesis = contentElements(await renderThesis(published, 'he'));
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    });
    const call = (await callPage()).default;
    const onCall = contentElements(await renderPage(call, { locale: 'he', thesisId: published.thesisId }, { locale: 'he' }));
    expect([textOf(thesis.at(-1)), textOf(onCall.at(-1))]).toEqual([SHORT, SHORT]);
  });

  it('no loading.tsx in the three public thesis segments — the one 404 is a real 404 status (the researcher’s ruling q1 A; next docs loading.md :105–:120)', () => {
    const segments = [
      join(SRC, 'app', '[locale]', 'theses', '[id]'),
      join(SRC, 'app', '[locale]', 'theses', '[id]', 'versions', '[v]'),
      join(SRC, 'app', '[locale]', 'call', '[thesisId]'),
    ];
    // THE SUBJECTS ARE THE SEGMENTS THEMSELVES. Filtering to the ones that exist would pass over a segment that is
    // not there — and "no loading.tsx" is only a property of a page that EXISTS (the vacuity rule, plan §4 :876).
    const found = [...requireSubjects('the three public thesis segments', segments)].flatMap((dir) =>
      readdirSync(dir)
        .filter((entry) => entry.startsWith('loading.'))
        .map((entry) => join(dir, entry)),
    );
    expect(found).toEqual([]);
  });
});
