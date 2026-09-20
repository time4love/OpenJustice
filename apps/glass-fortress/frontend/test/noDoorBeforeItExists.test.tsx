jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

// THE DOOR FLAG, READABLE FROM BOTH SIDES — `DOORS_OPEN` is a landed `boolean` constant, so the only way to
// exercise the OPEN half is to stand in for the module. The stand-in DEFERS to the real constant unless a case
// overrides it, so every existing case still reads what `lib/doors.ts` actually says; the `expect(DOORS_OPEN)
// .toBe(false)` guard below reads the REAL module through `requireActual`, never this stand-in, because a guard
// that read its own mock would assert nothing. `lib/doors.ts` is KEEP and is not edited.
let mockDoorOverride: boolean | null = null;
jest.mock('../src/lib/doors', () => {
  const actual = jest.requireActual<typeof import('../src/lib/doors')>('../src/lib/doors');
  return {
    get DOORS_OPEN(): boolean {
      return mockDoorOverride ?? actual.DOORS_OPEN;
    },
  };
});

import { join } from 'node:path';
import { fireEvent } from '@testing-library/react';
import { renderClaimsWithSheet, renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { FRONTEND, jsxTagsIn, publicThesisModules, requireSubjects, stringsIn } from './scan';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import { CALL_TAB_ID } from '../src/components/thesis/PaneTabs';
import published from './fixtures/thesis/published.json';
import callLive from './fixtures/thesis/call-live.json';
import callRequestsOnly from './fixtures/thesis/call-requests-only.json';
import versionPrevious from './fixtures/thesis/version-previous.json';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedCaptureRecord } from './fixtures/corpus/record';

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
/** The REAL constant, never the stand-in above: a guard that read its own mock would assert nothing. */
const landedDoorFlag = (): boolean => jest.requireActual<typeof import('../src/lib/doors')>('../src/lib/doors').DOORS_OPEN;

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
  // The active tab is browser-local (`SHELL_KEYS.activeTab`), so a press in one case would otherwise
  // decide which panel the next case opens with.
  window.localStorage.clear();
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
  mockDoorOverride = null;
});

const TRACKED = 'page-one';
const CAPTURE = '20211223211940';
const AFTER = '20220105090000';
const capturePage = async () => import('@/app/[locale]/pages/[trackedUrlId]/captures/[capture]/page');
const diffPage = async () => import('@/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page');
const recordsPage = async () => import('@/app/[locale]/records/[fileHash]/page');

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
    [`/api/pages/${TRACKED}/captures/${CAPTURE}`]: { status: 200, body: captureRead },
    [`/api/pages/${TRACKED}/diffs/${CAPTURE}/${AFTER}`]: { status: 200, body: diffInput },
    [`/api/records/${resolvedCaptureRecord.fileHash}`]: { status: 200, body: resolvedCaptureRecord },
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
    // THE TWO RECORD PAGES (UI-7 chunk (c)). Both carry anchors — the capture page its archive link, the
    // diff page its two endpoint links — so both are real subjects of the door rule and neither was examined
    // by this scan until now. A record page that ever grew a „הגישו עדות" anchor would have been invisible.
    {
      name: '/pages/[trackedUrlId]/captures/[capture]',
      hrefs: anchorsOf(
        '/pages/[trackedUrlId]/captures/[capture]',
        await renderPage((await capturePage()).default, { locale: LOCALE, trackedUrlId: TRACKED, capture: CAPTURE }, { locale: LOCALE }),
      ),
    },
    {
      name: '/pages/[trackedUrlId]/diffs/[before]/[after]',
      hrefs: anchorsOf(
        '/pages/[trackedUrlId]/diffs/[before]/[after]',
        await renderPage((await diffPage()).default, { locale: LOCALE, trackedUrlId: TRACKED, before: CAPTURE, after: AFTER }, { locale: LOCALE }),
      ),
    },
    // THE RECORDS PAGE carries exactly ONE anchor — the link onward — so it is the page where a door would
    // be most visible and, being the outsider's landing page, the one where it would do most harm.
    {
      name: '/records/[fileHash]',
      hrefs: anchorsOf(
        '/records/[fileHash]',
        await renderPage((await recordsPage()).default, { locale: LOCALE, fileHash: resolvedCaptureRecord.fileHash }, { locale: LOCALE }),
      ),
    },
    // UI-7 chunk 6: the CLAIMS view's sheet composes TWO anchors per flip — a capture page and a diff page —
    // so it is the page in the app that mints the most hrefs from a body, and the one where a link to an
    // unbuilt route would appear first.
    //
    // IT IS SCANNED WITH ITS SHEET OPEN, through the harness's one helper, and a decoy is why: an `/intake`
    // anchor planted INSIDE the sheet reddened nothing at all while this scan rendered the list alone. The
    // half of the view that mints the hrefs was the half nobody was reading.
    { name: '/corpus/claims', hrefs: [...(await renderClaimsWithSheet(LOCALE)).querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '') },
  ];
}

/**
 * How many intake CTAs each surface draws: the call PAGE, and the call TAB the thesis page declares.
 * BOTH are read, because the control is one component with two homes and a guard on one of them would be
 * a rule with two implementations. The tab is opened by PRESSING it, which is the reader's own path.
 */
async function intakeCtaCount(): Promise<{ call: number; thesisTab: number }> {
  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
  });
  const call = await renderPage((await callPage()).default, { locale: LOCALE, thesisId: published.thesisId }, { locale: LOCALE });
  if (call.notFound) throw new Error('the call page answered the one 404');

  setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: published } });
  const thesis = await renderPage((await thesisPage()).default, { locale: LOCALE, id: published.thesisId }, {
    locale: LOCALE,
    wrapper: ({ children }) => (
      <TabsProvider>
        {children}
        <RightPane />
      </TabsProvider>
    ),
  });
  if (thesis.notFound) throw new Error('the thesis page answered the one 404');
  const tab = thesis.container.querySelector(`#pane-tab-${CALL_TAB_ID}`);
  // Not a silent zero: a thesis page that declared no call tab has not been read by this case at all.
  if (tab === null) throw new Error('the thesis page declared no call tab to press');
  fireEvent.click(tab);

  return {
    call: call.container.querySelectorAll('[data-intake-cta]').length,
    thesisTab: thesis.container.querySelectorAll('[data-intake-cta]').length,
  };
}

describe('no-door-before-it-exists', () => {
  it('while DOORS_OPEN is false, no rendered public page carries an anchor to an intake or withdrawal URL', async () => {
    expect(landedDoorFlag()).toBe(false);
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

  it("the intake line renders the body's own instruction and no anchor — ON THE CALL PAGE (§17 :546–:548, §20.5)", async () => {
    // RE-POINTED AT UI-5. The line used to be read on the THESIS page, inside region 4; region 4 is
    // GONE (§10 :1122–:1123; R56's ruling; design session §3 :73–:75) and the appeals live on the call
    // page alone. The PROPERTY is untouched — the body's own instruction, rendered as given, with no
    // anchor drawn until the document plan's step 32 — and it is now read where the appeals are.
    // Reading it on the thesis page would assert the region's absence, which is a different clause.
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    });
    const page = (await callPage()).default;
    const rendered = await renderPage(page, { locale: LOCALE, thesisId: published.thesisId }, { locale: LOCALE });
    if (rendered.notFound) throw new Error('the call page answered the one 404');
    const line = [...rendered.container.querySelectorAll('[data-intake]')];
    expect(line).toHaveLength(1);
    expect([(line[0]?.textContent ?? '').trim(), line[0]?.querySelectorAll('a').length]).toEqual([callLive.intake, 0]);
  });

  it('DECISION 5: with ZERO called items „קריאה לעדים” is drawn MUTED and is NOT an anchor', async () => {
    // The branch a decoy found unexercised: every call fixture carried a CALLED item, so the muted card
    // — the whole of the researcher's decision 5 — was rendered by nothing. `call-requests-only.json` is
    // the same body with `call: []`, which is also run B's real shape (`appeals.call` is empty there).
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callRequestsOnly },
    });
    const page = (await callPage()).default;
    const rendered = await renderPage(page, { locale: LOCALE, thesisId: published.thesisId }, { locale: LOCALE });
    if (rendered.notFound) throw new Error('the call page answered the one 404');
    const muted = rendered.container.querySelector('[data-call-muted]');
    expect({
      drawn: muted !== null,
      anchors: muted?.querySelectorAll('a').length,
      intake: (muted?.querySelector('[data-intake]')?.textContent ?? '').trim(),
    }).toEqual({ drawn: true, anchors: 0, intake: callRequestsOnly.intake });
  });

  it('REGION 4 IS GONE FROM THE READ: the thesis page’s <main> renders no appeals section and no intake line (§10 :1122–:1123)', async () => {
    // The other half of the same ruling, and it has to be its own case: the re-point above moved where
    // the line is READ, and something must still hold that it is not on the thesis page — otherwise the
    // region could return and no instrument would notice.
    //
    // THE SUBJECT IS `<main>`, NOT THE CONTAINER, AND THE TITLE SAYS SO (R59 · M2). From §10 :1124 the
    // thesis page DECLARES the call as a right-pane tab, so the appeals ARE reachable from this page —
    // beside the read, in the pane, never inside it. Read over the whole container this case would have
    // said something the contract contradicts, and it was green only because the default wrapper mounts
    // `TabsProvider` and never `<RightPane/>` (`test/render.tsx` :153–:157) — the "green over an
    // unexercised property" shape that file's own :148–:151 names in as many words. `<main>` is the read,
    // and the read is what region 4 left.
    setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: published } });
    const page = (await thesisPage()).default;
    const rendered = await renderPage(page, { locale: LOCALE, id: published.thesisId }, { locale: LOCALE });
    if (rendered.notFound) throw new Error('the thesis page answered the one 404');
    const main = rendered.container.querySelector('main');
    if (main === null) throw new Error('the thesis page rendered no <main>');
    expect({
      intakeLines: main.querySelectorAll('[data-intake]').length,
      restsOnBlocks: main.querySelectorAll('[data-rests-on]').length,
    }).toEqual({ intakeLines: 0, restsOnBlocks: 0 });
  });

  // -------------------------------------------------------------------------
  // THE CALL TO ACTION — WRITTEN, NOT DRAWN (§20 :611 as amended 2026-09-17; §10 :1127's call amendment;
  // §17 :546–:548; §21 :622; document plan :506–:509 and step 32 :229–:231, where the intake DIALOG lands).
  //
  // TWO ARMS, AND BOTH ARE REQUIRED. A case that only holds "the control is absent while the door is shut"
  // is satisfied by the control never having been written at all — which is exactly what this instrument is
  // for, and exactly the shape REVIEW's own decoy exposed. The second arm holds that the control EXISTS and
  // appears the moment `DOORS_OPEN` flips, so step 32 changes one constant and nothing else.
  //
  // IT IS A BUTTON AND NOT AN ANCHOR, deliberately: what step 32 opens is a DIALOG (document plan :229–:231),
  // so there is no URL to name — and naming one would redden the source case above, correctly.
  // -------------------------------------------------------------------------

  it('the intake CTA is NOT in the DOM while DOORS_OPEN is false — on the call page and in the thesis page’s call tab', async () => {
    expect(landedDoorFlag()).toBe(false);
    expect(await intakeCtaCount()).toEqual({ call: 0, thesisTab: 0 });
  });

  it('the intake CTA IS in the DOM when DOORS_OPEN is true — the control is WRITTEN, and step 32 flips one constant', async () => {
    mockDoorOverride = true;
    expect(await intakeCtaCount()).toEqual({ call: 1, thesisTab: 1 });
  });
});
