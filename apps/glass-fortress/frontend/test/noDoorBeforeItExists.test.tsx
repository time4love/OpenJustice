jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { join } from 'node:path';
import { renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { FRONTEND, jsxTagsIn, publicThesisModules, requireSubjects, stringsIn } from './scan';
import published from './fixtures/thesis/published.json';
import callLive from './fixtures/thesis/call-live.json';
import versionPrevious from './fixtures/thesis/version-previous.json';

// ---------------------------------------------------------------------------
// no-door-before-it-exists — docs/gf-ui-flows.md §17 :546–:548, §21 :622, §23 :644–:645;
// docs/gf-document-refactor-plan.md :506–:509 (the intake-down window); UI plan :416–:418, :909, §8 :1007–:1009.
//
// WHILE `DOORS_OPEN` IS FALSE, no public page draws an anchor to an intake or a withdrawal URL: the appeals carry
// the body's instruction AS TEXT, and the door is the document plan's step 32. The scan is two-sided — the RENDER
// (no anchor in the tree) and the SOURCE (no `<a>`/`<form>` and no `Link` whose href names one) — because a door
// behind a condition the fixture does not reach would pass the render alone.
//
// THE NON-VACUITY GUARD (M1): every page rendered here HAS anchors — the pages section, the call page's link back —
// so a render that produced nothing throws rather than passing.
// ---------------------------------------------------------------------------

const DOOR_URLS = [/^\/theses\/[^/]+\/intake$/, /^\/intake(\/|$)/, /^\/submit(\/|$)/, /^\/withdraw(\/|$)/, /^\/theses\/[^/]+\/withdraw$/, /^\/safety(\/|$)/];
const LOCALE: Locale = 'he';

const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const callPage = () => import('../src/app/[locale]/call/[thesisId]/page');
const versionPage = () => import('../src/app/[locale]/theses/[id]/versions/[v]/page');
const doors = () => import('../src/lib/doors');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

const unprefixed = (href: string): string => {
  const path = (href.split(/[?#]/)[0] ?? href).replace(/^\/(he|en)(?=\/|$)/, '');
  return path === '' ? '/' : path;
};

function anchorsOf(name: string, rendered: PageRender): string[] {
  if (rendered.notFound) throw new Error(`${name} answered the one 404, not a body`);
  const main = rendered.container.querySelector('main');
  if (main === null) throw new Error(`${name} rendered no <main>`);
  const hrefs = [...main.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '');
  // M1: a page that rendered no anchor examined nothing — a pass over an empty tree is never a pass.
  return [...requireSubjects(`anchors of ${name}`, hrefs)];
}

async function everyPublicPage(): Promise<{ name: string; hrefs: string[] }[]> {
  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
  });
  const thesis = (await thesisPage()).default;
  const call = (await callPage()).default;
  const version = (await versionPage()).default;
  return [
    { name: '/theses/[id]', hrefs: anchorsOf('/theses/[id]', await renderPage(thesis, { locale: LOCALE, id: published.thesisId }, { locale: LOCALE })) },
    { name: '/call/[thesisId]', hrefs: anchorsOf('/call/[thesisId]', await renderPage(call, { locale: LOCALE, thesisId: published.thesisId }, { locale: LOCALE })) },
    {
      name: '/theses/[id]/versions/[v]',
      hrefs: anchorsOf(
        '/theses/[id]/versions/[v]',
        await renderPage(version, { locale: LOCALE, id: published.thesisId, v: versionPrevious.versionId }, { locale: LOCALE }),
      ),
    },
  ];
}

describe('no-door-before-it-exists', () => {
  it('while DOORS_OPEN is false, no rendered public page carries an anchor to an intake or withdrawal URL', async () => {
    const { DOORS_OPEN } = await doors();
    expect(DOORS_OPEN).toBe(false);
    const offenders = (await everyPublicPage()).flatMap(({ name, hrefs }) =>
      hrefs.filter((href) => DOOR_URLS.some((pattern) => pattern.test(unprefixed(href)))).map((href) => `${name}: ${href}`),
    );
    expect(offenders).toEqual([]);
  });

  it('no source of the public thesis surface writes an <a>, a <form> or a Link naming an intake or withdrawal URL', () => {
    const offenders = publicThesisModules().flatMap((module) => {
      const file = join(FRONTEND, module);
      const tags = jsxTagsIn(file)
        .filter((tag) => (tag.tag === 'a' && DOOR_URLS.some((pattern) => pattern.test(tag.attributes.href ?? ''))) || tag.tag === 'form')
        .map((tag) => `${module}:${String(tag.line)} <${tag.tag}>`);
      const literals = stringsIn(file)
        .filter((found) => DOOR_URLS.some((pattern) => pattern.test(found.text)))
        .map((found) => `${module}:${String(found.line)} '${found.text}'`);
      return [...tags, ...literals];
    });
    expect(offenders).toEqual([]);
  });

  it("the intake line renders the body's own instruction and no anchor (§17 :546–:548)", async () => {
    setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: published } });
    const page = (await thesisPage()).default;
    const rendered = await renderPage(page, { locale: LOCALE, id: published.thesisId }, { locale: LOCALE });
    if (rendered.notFound) throw new Error('the thesis page answered the one 404');
    const line = [...rendered.container.querySelectorAll('[data-intake]')];
    expect(line).toHaveLength(1);
    expect([(line[0]?.textContent ?? '').trim(), line[0]?.querySelectorAll('a').length]).toEqual([published.appeals.intake, 0]);
  });
});
