jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { ancestorsOf, renderClaimsWithSheet, renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { ID_SHAPES, requireSubjects } from './scan';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedCaptureRecord } from './fixtures/corpus/record';
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
    [CAPTURE_PATH]: { status: 200, body: captureRead },
    [PAIR_PATH]: { status: 200, body: diffInput },
    [`/api/records/${resolvedCaptureRecord.fileHash}`]: { status: 200, body: resolvedCaptureRecord },
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
    // UI-7 chunk (c): the capture page puts a URL, a date and THREE hashes inside Hebrew on one screen —
    // the archive line, the VERIFY rows and the raw address — so it is the densest subject this scan has.
    {
      name: '/pages/[trackedUrlId]/captures/[capture]',
      container: containerOf(
        '/pages/[trackedUrlId]/captures/[capture]',
        await renderPage((await capturePage()).default, { locale, trackedUrlId: TRACKED, capture: CAPTURE }, { locale }),
      ),
    },
    {
      name: '/pages/[trackedUrlId]/diffs/[before]/[after]',
      container: containerOf(
        '/pages/[trackedUrlId]/diffs/[before]/[after]',
        await renderPage((await diffPage()).default, { locale, trackedUrlId: TRACKED, before: CAPTURE, after: AFTER }, { locale }),
      ),
    },
    {
      name: '/records/[fileHash]',
      container: containerOf(
        '/records/[fileHash]',
        await renderPage((await recordsPage()).default, { locale, fileHash: resolvedCaptureRecord.fileHash }, { locale }),
      ),
    },
    // UI-7 chunk 6: the CLAIMS view puts the ARCHIVE'S OWN HEBREW SENTENCE beside a url, and its SHEET
    // composes an interval and two hrefs per flip — so a Hebrew row carrying an unisolated date is likelier
    // here than anywhere this scan already looked.
    //
    // IT IS EXAMINED WITH ITS SHEET OPEN, and that is not a convenience. The LIST alone carries no date and
    // no url text node at all — the row is the claim's words, the page's label and two words — so the
    // vacuity guard refused it, correctly. The dates and the composed links live in the sheet, which is
    // half of this view rather than a separate page, and a reader reaches it in one tap.
    { name: '/corpus/claims', container: await renderClaimsWithSheet(locale) },
  ];
}

/** An element that isolates its content from the surrounding direction. */
function isolated(node: Text): boolean {
  return ancestorsOf(node).some((element) => element.tagName === 'BDI' || element.hasAttribute('dir'));
}

const TRACKED = 'page-one';
const CAPTURE = '20211223211940';
const CAPTURE_PATH = `/api/pages/${TRACKED}/captures/${CAPTURE}`;
const capturePage = async () => import('@/app/[locale]/pages/[trackedUrlId]/captures/[capture]/page');
const diffPage = async () => import('@/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page');
const recordsPage = async () => import('@/app/[locale]/records/[fileHash]/page');
const AFTER = '20220105090000';
const PAIR_PATH = `/api/pages/${TRACKED}/diffs/${CAPTURE}/${AFTER}`;

/**
 * THE PAGES THAT CARRY THE RESEARCHER'S OWN WORDS — a POSITIVE set, with the floor below.
 *
 * A RECORD PAGE CARRIES NONE, and that is the point of it: what it shows is the ARCHIVE's bytes, which
 * `.record-captured` already renders under `dir="auto"` and which the first two cases of this file check.
 * Requiring a `[data-researcher-words]` block of it would fail the PAGE for having no researcher text,
 * which is not the property either case states.
 */
const RESEARCHER_PAGES = ['/theses/[id]', '/call/[thesisId]', '/theses/[id]/versions/[v]'] as const;

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
    const examined: string[] = [];
    for (const { name, container } of await allPages('he')) {
      if (!RESEARCHER_PAGES.some((page) => page === name)) continue;
      examined.push(name);
      const blocks = [...container.querySelectorAll('[data-researcher-words]')];
      requireSubjects(`the researcher's blocks on ${name}`, blocks);
      problems.push(...blocks.filter((block) => block.getAttribute('dir') !== 'auto').map((block) => `${name}: ${block.outerHTML.slice(0, 60)}`));
    }
    expect(problems).toEqual([]);
    // THE FLOOR: the positive set above really matched, in this order, or the case passed over nothing.
    expect(examined).toEqual([...RESEARCHER_PAGES]);
  });

  it("a chip's DATE or INTERVAL is isolated left-to-right — and a trajectory's words correctly are not", async () => {
    // RE-POINTED AT UI-5, because the chip's subject changed under §10 :1121: the DOMAIN moved out of
    // every chip and up to the TICK LINE, which heads the page with it once instead of repeating it at
    // each citation. What is left in an evidence chip is a date or an interval, which must still be
    // isolated; what is left in a TRAJECTORY chip is the claim's first words (§17 :535–:536 asks for
    // exactly that and for no domain), which are Hebrew and must NOT be forced left-to-right.
    // The old title said "date and domain" because every chip carried both. Splitting the two is not a
    // weakening: the domain is now asserted on the tick line, in the case below, and the trajectory's
    // own url is still in its record.
    const [thesis] = await allPages('he');
    const chips = [...(thesis?.container.querySelectorAll('[data-chip]') ?? [])];
    requireSubjects('chips on /theses/[id]', chips);
    const dated = chips.filter((chip) => /\d/.test(chip.textContent ?? ''));
    requireSubjects('chips carrying a date or an interval', dated);
    const problems = dated
      .filter((chip) => chip.querySelectorAll('bdi[dir="ltr"], [dir="ltr"]').length === 0)
      .map((chip) => (chip.textContent ?? '').slice(0, 40));
    expect(problems).toEqual([]);
  });

  it("the TICK LINE's domain is isolated left-to-right — the half the re-point above would otherwise lose", async () => {
    const [thesis] = await allPages('he');
    const lines = [...(thesis?.container.querySelectorAll('[data-tick-line]') ?? [])];
    requireSubjects('tick lines on /theses/[id]', lines);
    const problems = lines
      .filter((line) => (line.querySelector('bdi[dir="ltr"]')?.textContent ?? '') === '')
      .map((line) => (line.textContent ?? '').slice(0, 40));
    expect(problems).toEqual([]);
  });

  it('under en, the Hebrew body text is isolated from the English page', async () => {
    const problems: string[] = [];
    const examined: string[] = [];
    for (const { name, container } of await allPages('en')) {
      if (!RESEARCHER_PAGES.some((page) => page === name)) continue;
      examined.push(name);
      const blocks = [...container.querySelectorAll('[data-researcher-words]')];
      requireSubjects(`the researcher's blocks on ${name} (en)`, blocks);
      problems.push(
        ...blocks
          .filter((block) => HEBREW.test(block.textContent ?? '') && block.getAttribute('dir') !== 'auto')
          .map((block) => `${name}: ${(block.textContent ?? '').slice(0, 40)}`),
      );
    }
    expect(problems).toEqual([]);
    expect(examined).toEqual([...RESEARCHER_PAGES]);
  });
});
