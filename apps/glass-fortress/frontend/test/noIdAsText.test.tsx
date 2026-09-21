jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import {
  type Locale,
  type PageRender,
  ancestorsOf,
  renderPage,
  snapshotResearchClaims,
  snapshotResearchCorpus,
  snapshotResearchDashboard,
  snapshotResearchThesis,
  setAuthState,
  setPathname,
  setPublicBodies,
  textNodes,
} from './render';
import { ID_SHAPES, requireSubjects } from './scan';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedCaptureRecord } from './fixtures/corpus/record';
import { claimsAnswer } from './fixtures/corpus/claims';

const TRACKED = 'page-one';
const CAPTURE = '20211223211940';
const CAPTURE_PATH = `/api/pages/${TRACKED}/captures/${CAPTURE}`;
const capturePage = async () => import('@/app/[locale]/pages/[trackedUrlId]/captures/[capture]/page');
const diffPage = async () => import('@/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page');
const recordsPage = async () => import('@/app/[locale]/records/[fileHash]/page');
const claimsPage = async () => import('@/app/[locale]/corpus/claims/page');
const AFTER = '20220105090000';
const PAIR_PATH = `/api/pages/${TRACKED}/diffs/${CAPTURE}/${AFTER}`;

/** The pages that CITE, and so must render a dated tick — this case's subject set, as a value. */
const TICKING = ['thesis', 'call', 'version'] as const;
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import published from './fixtures/thesis/published.json';
import callLive from './fixtures/thesis/call-live.json';
import versionPrevious from './fixtures/thesis/version-previous.json';
import withdrawn from './fixtures/thesis/withdrawn.json';

// ---------------------------------------------------------------------------
// no-id-as-text — docs/gf-ui-flows.md §4 :167–:178 ("No hash and no id is shown as text"), §17 :530–:531, :559–:561,
// A5 :1079; UI plan :403–:406, §5 :913.
//
// A 64-hex name, a cuid or a 14-digit Wayback timestamp is not for a reader. Each has exactly TWO homes: a COPY
// control's value, and the VERIFY disclosure. Everywhere else a thing is named by what a person recognises — a page
// by its domain, a capture by its date, a thesis by its claim.
// ---------------------------------------------------------------------------

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

function containerOf(name: string, rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error(`${name} answered the one 404, not a body`);
  return rendered.container;
}

async function everyPage(locale: Locale): Promise<{ name: string; container: HTMLElement }[]> {
  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
    [`/api/thesis/${withdrawn.thesisId}`]: { status: 200, body: withdrawn },
    [CAPTURE_PATH]: { status: 200, body: captureRead },
    [PAIR_PATH]: { status: 200, body: diffInput },
    [`/api/records/${resolvedCaptureRecord.fileHash}`]: { status: 200, body: resolvedCaptureRecord },
    '/api/corpus/claims?page=page-one': { status: 200, body: claimsAnswer },
  });
  const thesis = (await thesisPage()).default;
  const call = (await callPage()).default;
  const version = (await versionPage()).default;
  return [
    { name: 'thesis', container: containerOf('thesis', await renderPage(thesis, { locale, id: published.thesisId }, { locale })) },
    { name: 'call', container: containerOf('call', await renderPage(call, { locale, thesisId: published.thesisId }, { locale })) },
    {
      name: 'version',
      container: containerOf('version', await renderPage(version, { locale, id: published.thesisId, v: versionPrevious.versionId }, { locale })),
    },
    { name: 'notice', container: containerOf('notice', await renderPage(thesis, { locale, id: withdrawn.thesisId }, { locale })) },
    // UI-7 chunk (c): the capture page carries FOUR exact values — the document hash, the text hash, the raw
    // archive address and the citation token — and every one of them must be inside VERIFY or a COPY control.
    // It is the page with the most ids per screen in the app, so it is the one this scan most needed.
    {
      name: 'capture',
      container: containerOf('capture', await renderPage((await capturePage()).default, { locale, trackedUrlId: TRACKED, capture: CAPTURE }, { locale })),
    },
    // The DIFF page renders TWO archive timestamps in its heading — as DATES — and no hash at all, so it is
    // the page where a timestamp is likeliest to leak back in as text.
    {
      name: 'diff',
      container: containerOf('diff', await renderPage((await diffPage()).default, { locale, trackedUrlId: TRACKED, before: CAPTURE, after: AFTER }, { locale })),
    },
    // The RECORDS page renders a 0x-prefixed NAME in its URL and a citing version's whole text in its body —
    // the two places §4's three shapes are likeliest to reach a reader on a page built around an id.
    {
      name: 'records',
      container: containerOf('records', await renderPage((await recordsPage()).default, { locale, fileHash: resolvedCaptureRecord.fileHash }, { locale })),
    },
    // UI-7 chunk 6: the CLAIMS view renders a `patternHash`, a `trajectoryId` and one 14-digit instant PER
    // CAPTURE — 22 of them on the real page's busiest row — and every one of those lives in a `data-`
    // attribute or a COPY value. It is the page with the most ids per screen after the capture page.
    {
      name: 'claims',
      container: containerOf('claims', await renderPage((await claimsPage()).default, { locale }, { locale, searchParams: { page: 'page-one' } })),
    },
    // UI-8 chunk 4: `/research` is the first GATED page here, and it carries a thesis id per row — in the
    // URL of the public-page link and in nothing else. §4 :167 has no door exception: the rule is about what
    // a READER meets, and a researcher is a reader.
    { name: 'research', container: await snapshotResearchDashboard(locale) },
    // UI-8 chunk 5: the gated corpus carries a `trackedUrlId` in every row's href, a 14-digit instant on every
    // capture row and a `fileHash` in every COPY control — and the extraction sheet adds a `ruleId` and a
    // rule's whole history. It is the page with the most ids per screen in the read view.
    { name: 'research/corpus', container: await snapshotResearchCorpus(locale) },
    { name: 'research/corpus (the sheet three deep)', container: await snapshotResearchCorpus(locale, { searchParams: { page: 'page-one' }, depth: 3 }) },
    { name: 'research/corpus/claims', container: await snapshotResearchClaims(locale) },
    // UI-8 chunk 7a: the working view is the page whose whole subject is ONE thesis, named by a cuid in its
    // URL — the id has two homes here (§4 :167–:176), the URL and the COPY, and this holds that it has no third.
    { name: 'research/theses/[thesisId]', container: await snapshotResearchThesis(locale) },
  ];
}

/** The two homes an exact value may have: a COPY control's value, and the VERIFY disclosure (§4 :170–:176). */
function inAHome(node: Text): boolean {
  return ancestorsOf(node).some((element) => element.hasAttribute('data-copy-value') || element.hasAttribute('data-verify'));
}

describe('no-id-as-text', () => {
  it('no 64-hex, cuid or 14-digit timestamp is a text node outside VERIFY or a COPY value — on every public page, in both locales', async () => {
    const problems: string[] = [];
    for (const locale of LOCALES) {
      const pages = await everyPage(locale);
      // THE FLOOR, MOVED UP BY ONE AT UI-8 chunk 4, with the page NAMED — and the fixture's thesis ids are
      // CUID-SHAPED so this scan has something to catch on it: with readable ids it would examine nothing.
      expect(pages.length).toBeGreaterThanOrEqual(13);
      expect(pages.map(({ name }) => name)).toContain('research');
      expect(pages.map(({ name }) => name)).toContain('research/corpus');
      expect(pages.map(({ name }) => name)).toContain('research/corpus/claims');
      // UI-8 chunk 7a: the page whose whole subject is ONE thesis, named by a cuid in its URL and read aloud
      // in the owed commands. Deleting its line left this case green until now.
      expect(pages.map(({ name }) => name)).toContain('research/theses/[thesisId]');
      for (const { name, container } of pages) {
        const nodes = textNodes(container);
        requireSubjects(`text nodes of the ${name} page (${locale})`, nodes);
        problems.push(
          ...nodes
            .filter((node) => ID_SHAPES.some((shape) => shape.pattern.test(node.data)) && !inAHome(node))
            .map((node) => `${locale}/${name}: ${node.data.trim().slice(0, 40)}`),
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it('the thesis COPY carries "thesis <id>" as its value, labelled by what it is FOR (§4 :172–:174)', async () => {
    const [thesis] = await everyPage('he');
    const control = thesis?.container.querySelector('[data-copy-value]');
    expect(control?.getAttribute('data-copy-value')).toEqual(`thesis ${published.thesisId}`);
    expect((control?.closest('[data-copy]')?.textContent ?? '').trim()).toEqual('העתקה לשיחה חדשה');
  });

  it('VERIFY is closed by default and holds the version hash and every citation’s name and pin (§17 :559–:560; A6 :1097)', async () => {
    const [thesis] = await everyPage('he');
    const verify = thesis?.container.querySelector('details[data-verify]');
    const values = [...(verify?.querySelectorAll('[data-copy-value]') ?? [])].map((node) => node.getAttribute('data-copy-value'));
    expect(verify?.hasAttribute('open')).toBe(false);
    expect(values).toEqual([
      published.version.contentHash,
      published.citations[0].name,
      published.citations[0].pin,
      published.citations[1].name,
      published.citations[1].pin,
      published.citations[2].name,
    ]);
  });

  // -------------------------------------------------------------------------
  // THE TWO THE RE-BRIEF ADDS (docs/gf-ui-refactor-plan.md §10 :1126, "`no-id-as-text` gains the tick
  // and the tabs"). A citation in the text is now a DATED TICK, and a record, the call page and a
  // previous version open as RIGHT-PANE TABS — two new places a 64-hex, a cuid or a 14-digit stamp
  // could reach a reader, and neither existed when the four cases above were written.
  // -------------------------------------------------------------------------

  it('every dated tick renders a DATE, an interval or a claim’s words — never a stamp, a name or a cuid', async () => {
    const problems: string[] = [];
    const examined: string[] = [];
    for (const locale of LOCALES) {
      for (const { name, container } of await everyPage(locale)) {
        // THE PAGES THAT CITE, as a POSITIVE set — not a growing list of names to skip. A page with no
        // citation has no tick, and requiring one of it would fail the PAGE rather than test the property.
        // The withdrawal notice was already excepted by name; UI-7's record pages are the second such page,
        // which is the point at which a skip-list should become a set.
        if (!TICKING.some((ticking) => ticking === name)) continue;
        examined.push(`${locale}/${name}`);
        const ticks = [...container.querySelectorAll('[data-tick]')];
        requireSubjects(`dated ticks on the ${name} page (${locale})`, ticks);
        problems.push(
          ...ticks
            .flatMap((tick) => textNodes(tick))
            .filter((node) => ID_SHAPES.some((shape) => shape.pattern.test(node.data)))
            .map((node) => `${locale}/${name}: ${node.data.trim().slice(0, 40)}`),
        );
      }
    }
    expect(problems).toEqual([]);
    // THE FLOOR: every ticking page in every locale was actually rendered and read. Without it the positive
    // set above could silently match nothing and the case would pass over an unexamined app.
    expect(examined).toEqual(LOCALES.flatMap((locale) => TICKING.map((name) => `${locale}/${name}`)));
  });

  it('every right-pane tab LABEL is free of the three shapes — the label is the page’s to compose', async () => {
    const problems: string[] = [];
    for (const locale of LOCALES) {
      setPublicBodies({
        [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
        [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
      });
      const page = (await thesisPage()).default;
      // Rendered INSIDE the shell's registry with the pane beside it, so the tabs read here are the
      // ones a reader would see — the page's own declaration, through the real `DeclareTabs` path.
      const rendered = await renderPage(page, { locale, id: published.thesisId }, {
        locale,
        wrapper: ({ children }) => (
          <TabsProvider>
            {children}
            <RightPane />
          </TabsProvider>
        ),
      });
      if (rendered.notFound) throw new Error('the thesis page answered the one 404, not a body');
      const labels = [...rendered.container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent ?? '');
      requireSubjects(`right-pane tabs declared by the thesis page (${locale})`, labels);
      problems.push(
        ...labels
          .filter((label) => ID_SHAPES.some((shape) => shape.pattern.test(label)))
          .map((label) => `${locale}: ${label.trim().slice(0, 40)}`),
      );
    }
    expect(problems).toEqual([]);
  });

  it("a request's restsOn renders each record as its chip, never the name as text (§17 :541)", async () => {
    const [, call] = await everyPage('he');
    const rests = call?.container.querySelector('[data-rests-on]');
    const chips = [...(rests?.querySelectorAll('[data-chip]') ?? [])].map((chip) => chip.getAttribute('data-chip'));
    expect(chips).toEqual(callLive.requests[0].restsOn);
    expect((rests?.textContent ?? '').includes(callLive.requests[0].restsOn[0] ?? '')).toBe(false);
  });
});
