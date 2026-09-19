jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import republished from './fixtures/thesis/republished.json';
import versionNamedByWithdrawal from './fixtures/thesis/version-named-by-withdrawal.json';
import withdrawn from './fixtures/thesis/withdrawn.json';

// ---------------------------------------------------------------------------
// notice-only — docs/gf-ui-flows.md §19 :590–:593, §23 :643; thesis T6 :915–:918, A5 :1570; §8 :336.
//
// "The page shows: the disclaimer · withdrawn by its author on <date> · nothing else — not the text, not the
// reason, not the claim." So the notice's text nodes are exactly two, no anchor is drawn inside `<main>`, the
// CALL page of a withdrawn thesis is the notice alone (the researcher's ruling q12, and it reads no call route),
// and a version a Withdrawal names answers the notice even after the thesis was published again (A5 :1570).
// ---------------------------------------------------------------------------

const DISCLAIMER_HE = 'כל הטענות המוצגות מבוססות על ראיות מתועדות ומהוות ניתוח משפטי בתום לב בעניין ציבורי. אין בהן קביעה שיפוטית. הפלטפורמה מציגה חומר לצורך חקירה ציבורית בלבד.';
const LOCALES: readonly Locale[] = ['he', 'en'];

const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const callPage = () => import('../src/app/[locale]/call/[thesisId]/page');
const versionPage = () => import('../src/app/[locale]/theses/[id]/versions/[v]/page');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function mainOf(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('the page answered the one 404, not the notice — a withdrawal is 200 (§8 :336)');
  const main = rendered.container.querySelector('main');
  if (main === null) throw new Error('the notice rendered no <main>');
  return main as HTMLElement;
}

const texts = (main: HTMLElement): string[] => textNodes(main).map((node) => node.data.replace(/\s+/g, ' ').trim());

describe('notice-only', () => {
  it('a withdrawn thesis renders the disclaimer and the date — and no other text node, in either locale', async () => {
    for (const locale of LOCALES) {
      setPublicBodies({ [`/api/thesis/${withdrawn.thesisId}`]: { status: 200, body: withdrawn } });
      const page = (await thesisPage()).default;
      const found = texts(mainOf(await renderPage(page, { locale, id: withdrawn.thesisId }, { locale })));
      expect([locale, found.length]).toEqual([locale, 2]);
      if (locale === 'he') expect(found[0]).toEqual(DISCLAIMER_HE);
      expect(found[1]).toMatch(/12/);
    }
  });

  it('the call page of a withdrawn thesis is the notice alone, and it reads no call route (the researcher’s ruling q12)', async () => {
    setPublicBodies({ [`/api/thesis/${withdrawn.thesisId}`]: { status: 200, body: withdrawn } });
    const page = (await callPage()).default;
    const found = texts(mainOf(await renderPage(page, { locale: 'he', thesisId: withdrawn.thesisId }, { locale: 'he' })));
    expect({ texts: found.length, read: apiCallsMade().map((call) => call.path) }).toEqual({
      texts: 2,
      read: [`/api/thesis/${withdrawn.thesisId}`],
    });
  });

  it('a version a Withdrawal names answers the notice even after the thesis was published again (A5 :1570)', async () => {
    setPublicBodies({
      [`/api/thesis/${republished.thesisId}`]: { status: 200, body: republished },
      [`/api/thesis/${republished.thesisId}/versions/${republished.history[0].versionId}`]: {
        status: 200,
        body: versionNamedByWithdrawal,
      },
    });
    const page = (await versionPage()).default;
    const main = mainOf(
      await renderPage(page, { locale: 'he', id: republished.thesisId, v: republished.history[0].versionId }, { locale: 'he' }),
    );
    const found = texts(main);
    expect(found.length).toEqual(2);
    expect(found.join(' ')).not.toContain(republished.claim);
  });

  it('the notice draws no anchor inside <main> — "nothing else" includes a link (§19 :592–:593)', async () => {
    setPublicBodies({ [`/api/thesis/${withdrawn.thesisId}`]: { status: 200, body: withdrawn } });
    const page = (await thesisPage()).default;
    const main = mainOf(await renderPage(page, { locale: 'he', id: withdrawn.thesisId }, { locale: 'he' }));
    expect([...main.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'))).toEqual([]);
  });

  it("the notice's share metadata is the site name only — nothing from the body (the researcher’s ruling q11)", async () => {
    setPublicBodies({ [`/api/thesis/${withdrawn.thesisId}`]: { status: 200, body: withdrawn } });
    const module_ = await thesisPage();
    const generate = (module_ as { generateMetadata?: unknown }).generateMetadata;
    if (typeof generate !== 'function') throw new Error('generateMetadata is not exported by app/[locale]/theses/[id]/page.tsx');
    // Next hands `generateMetadata` the RESOLVING PARENT as its second argument (next docs,
    // generate-metadata.md :60): the site's share image is inherited through it, so the case supplies one — a
    // call without it would exercise a signature the framework never uses.
    const parent = Promise.resolve({ openGraph: { images: ['/he/opengraph-image'] } });
    const metadata = (await (
      generate as (props: { params: Promise<Record<string, string>> }, parent: unknown) => Promise<Record<string, unknown>>
    )({ params: Promise.resolve({ locale: 'he', id: withdrawn.thesisId }) }, parent)) as Record<string, unknown>;
    expect([metadata.title, JSON.stringify(metadata).includes(withdrawn.withdrawnAt)]).toEqual(['צדק לעם - תיק הקורונה', false]);
  });
});
