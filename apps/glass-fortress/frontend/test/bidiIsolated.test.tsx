jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { ancestorsOf, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { ID_SHAPES, requireSubjects } from './scan';
import published from './fixtures/thesis/published.json';
import callLive from './fixtures/thesis/call-live.json';
import versionPrevious from './fixtures/thesis/version-previous.json';

// ---------------------------------------------------------------------------
// bidi-isolated — docs/gf-ui-flows.md §17 :533–:534 ("a URL or a date inside the text is bidi-isolated LTR"),
// §23 :648–:649, A5 :1078; UI plan :422, §5 :912.
//
// A URL, a date or a hash inside Hebrew text reverses the line when the browser lays it out right-to-left, and the
// reader sees a mangled address. Each one is therefore inside an ISOLATING element — `<bdi>`, or an element whose
// `dir` differs from what it inherits. The researcher's own words go through ONE component that sets `dir="auto"`,
// so a Hebrew paragraph on an English page reads as Hebrew.
//
// THE NON-VACUITY GUARDS (M1): the fixture's text carries a URL and a date inside Hebrew and its VERIFY holds
// hashes, so both subject sets are non-empty — a page that rendered nothing throws instead of passing.
// ---------------------------------------------------------------------------

const URL_OR_DATE = [/https?:\/\/\S+/, /\d{1,2}[./]\d{1,2}[./]\d{2,4}/, /\d{4}-\d{2}-\d{2}/];
const HEBREW = /[֐-׿]/;

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

function stage(): void {
  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
  });
}

function containerOf(name: string, rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error(`${name} answered the one 404, not a body`);
  return rendered.container;
}

async function allPages(locale: Locale): Promise<{ name: string; container: HTMLElement }[]> {
  stage();
  const thesis = (await thesisPage()).default;
  const call = (await callPage()).default;
  const version = (await versionPage()).default;
  return [
    { name: '/theses/[id]', container: containerOf('/theses/[id]', await renderPage(thesis, { locale, id: published.thesisId }, { locale })) },
    { name: '/call/[thesisId]', container: containerOf('/call/[thesisId]', await renderPage(call, { locale, thesisId: published.thesisId }, { locale })) },
    {
      name: '/theses/[id]/versions/[v]',
      container: containerOf(
        '/theses/[id]/versions/[v]',
        await renderPage(version, { locale, id: published.thesisId, v: versionPrevious.versionId }, { locale }),
      ),
    },
  ];
}

/** An element that isolates its content from the surrounding direction. */
function isolated(node: Text): boolean {
  return ancestorsOf(node).some((element) => element.tagName === 'BDI' || element.hasAttribute('dir'));
}

describe('bidi-isolated', () => {
  it('every URL, date and hash rendered inside Hebrew text is inside an isolating element', async () => {
    const problems: string[] = [];
    for (const { name, container } of await allPages('he')) {
      const nodes = textNodes(container);
      const hebrew = nodes.filter((node) => HEBREW.test(node.data));
      requireSubjects(`Hebrew text nodes of ${name}`, hebrew);
      const matching = nodes.filter((node) =>
        [...URL_OR_DATE, ...ID_SHAPES.map((shape) => shape.pattern)].some((pattern) => pattern.test(node.data)),
      );
      requireSubjects(`URL, date and hash matches in ${name}`, matching);
      problems.push(...matching.filter((node) => !isolated(node)).map((node) => `${name}: ${node.data.trim().slice(0, 40)}`));
    }
    expect(problems).toEqual([]);
  });

  it("the researcher's words render through one component that sets dir=\"auto\"", async () => {
    const problems: string[] = [];
    for (const { name, container } of await allPages('he')) {
      const blocks = [...container.querySelectorAll('[data-researcher-words]')];
      requireSubjects(`the researcher's blocks on ${name}`, blocks);
      problems.push(...blocks.filter((block) => block.getAttribute('dir') !== 'auto').map((block) => `${name}: ${block.outerHTML.slice(0, 60)}`));
    }
    expect(problems).toEqual([]);
  });

  it("a chip's date and domain are isolated left-to-right", async () => {
    const [thesis] = await allPages('he');
    const chips = [...(thesis?.container.querySelectorAll('[data-chip]') ?? [])];
    requireSubjects('chips on /theses/[id]', chips);
    const problems = chips
      .filter((chip) => chip.querySelectorAll('bdi[dir="ltr"], [dir="ltr"]').length === 0)
      .map((chip) => (chip.textContent ?? '').slice(0, 40));
    expect(problems).toEqual([]);
  });

  it('under en, the Hebrew body text is isolated from the English page', async () => {
    const problems: string[] = [];
    for (const { name, container } of await allPages('en')) {
      const blocks = [...container.querySelectorAll('[data-researcher-words]')];
      requireSubjects(`the researcher's blocks on ${name} (en)`, blocks);
      problems.push(
        ...blocks
          .filter((block) => HEBREW.test(block.textContent ?? '') && block.getAttribute('dir') !== 'auto')
          .map((block) => `${name}: ${(block.textContent ?? '').slice(0, 40)}`),
      );
    }
    expect(problems).toEqual([]);
  });
});
