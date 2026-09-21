jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Locale, type PageRender, renderPage, renderResearchDashboard, setAuthState, setPathname, setPublicBodies, snapshotResearchClaims, snapshotResearchCorpus, snapshotResearchThesis, textNodes } from './render';
import { requireSubjects } from './scan';
import { corpusStream } from './fixtures/corpus/stream';
import { claimsAnswer } from './fixtures/corpus/claims';
import { captureRead } from './fixtures/corpus/capture';
import { diffInput } from './fixtures/corpus/diffInput';
import { resolvedCaptureRecord } from './fixtures/corpus/record';

// ---------------------------------------------------------------------------
// no-disclaimer-off-the-thesis — `COMPLIANCE.md`'s "Required UI Elements", and docs/gf-ui-flows.md §26 as
// ruled 2026-09-19 (the researcher): *„דף רשומה הוא לא דף תזה"*, and *„יש להסיר את ההסתייגות הלא עקבית
// מ /corpus"*.
//
// THE RULE IS AN EXACT SET AND THIS FILE HOLDS IT AS ONE. COMPLIANCE names the disclaimer's homes — every
// thesis page and every `/call/[thesisId]` page — and names nothing else, so the public pages that carry it
// are exactly `/theses/[id]`, `/theses/[id]/versions/[v]` and `/call/[id]`. `/theses` lost it on 2026-09-19
// because "a list is neither"; `/corpus` is a list and a stream and kept it anyway, rendering it once in each
// of its two branches; the three record pages of §26 are neither a thesis nor a call.
//
// IT IS HELD IN BOTH DIRECTIONS, and that is the point of the file rather than a flourish. An absence is the
// easiest green in the world to write by accident: a selector with a typo, a page that failed to render, a
// phrase list that never matched anything would all report a clean page. So every case that asserts an
// ABSENCE also asserts the PRESENCE of the same sentences on a control fragment — `thesesListIsTheCatalogue`'s
// shape, a positive control inside the same `expect()`, extended here rather than re-spelled. What it is NOT
// is that file's subject: see `DISCLAIMERS` below, where extending the shape found the phrase it reads to be
// shared with the classifier's own label.
//
// WHY A SOURCE SCAN FOR THE RECORD PAGES. Two of the three do not exist yet — they are chunk 5b's — and a
// render case cannot assert about a page that has no file. The scan states the rule over the SET of public
// page files that exist, so the day a record page lands it is already governed: a new page importing the
// disclaimer fails this file without anyone remembering to come back. The allow-list is the exact set
// COMPLIANCE names, and a case holds that the allow-list is not empty and not everything.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const APP = join(__dirname, '..', 'src', 'app', '[locale]');

/**
 * THE DISCLAIMER'S OWN SENTENCES, BY VALUE FROM THE CATALOGUE — not a phrase that merely appears inside them.
 *
 * `thesesListIsTheCatalogue` reads the two phrases „קביעה שיפוטית" and „ניתוח משפטי בתום לב", and extending
 * that shape here is what FOUND the problem with it: **„קביעה שיפוטית" is not the disclaimer's alone.** The
 * classifier's label is `opinion.label` = „ניתוח AI — אינו מהווה קביעה שיפוטית", so a page carrying the third
 * voice matches the phrase while carrying no disclaimer at all. `/theses` has no opinion on it, which is why
 * that file has never been wrong; `/corpus`'s stream has eight, and the case failed on the first run against
 * a page that is correct. A phrase shared by two elements cannot hold the absence of one of them.
 *
 * So the subject is `common.disclaimer.short` and `.full` themselves, read from the catalogue rather than
 * retyped: the value the page would show if it carried one, and a value nothing else in the product holds.
 */
const CATALOGUE = JSON.parse(readFileSync(join(__dirname, '..', 'messages', 'he.json'), 'utf8')) as {
  common: { disclaimer: { short: string; full: string } };
};
const DISCLAIMERS = [CATALOGUE.common.disclaimer.short, CATALOGUE.common.disclaimer.full] as const;

/** The ONLY public pages COMPLIANCE gives the disclaimer to. Anything else naming it is a finding. */
const MAY_CARRY_IT = ['theses/[id]/page.tsx', 'theses/[id]/versions/[v]/page.tsx', 'call/[thesisId]/page.tsx'] as const;

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/corpus');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function containerOf(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('the page answered the one 404, not a body');
  return rendered.container;
}

const shownText = (container: HTMLElement): string =>
  textNodes(container)
    .map((node) => node.data)
    .join(' ');

/** A fragment that HAS the disclaimer — the positive control every absence below is measured against. */
function controlFragment(): HTMLElement {
  const control = document.createElement('div');
  control.textContent = DISCLAIMERS.join(' ');
  return control;
}

describe('no-disclaimer-off-the-thesis · the rendered pages', () => {
  it('`/corpus` AS THE PAGES LIST CARRIES NO DISCLAIMER — and the control proves the reader is not blind', async () => {
    setPublicBodies({ '/api/corpus': { status: 200, body: corpusStream } });
    const container = containerOf(await renderPage((await import('../src/app/[locale]/corpus/page')).default, { locale: LOCALE }, { locale: LOCALE, searchParams: {} }));
    const shown = shownText(container);
    const control = controlFragment();
    expect({
      found: DISCLAIMERS.filter((sentence) => shown.includes(sentence)),
      // THE FLOOR: the page really rendered its rows, so "no disclaimer" is a fact about the chrome and not
      // about a render that produced nothing.
      rows: container.querySelectorAll('[data-page-row]').length > 0,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ found: [], rows: true, controlFindsBoth: 2 });
  });

  it('`/research` CARRIES NO DISCLAIMER — the read view is neither a thesis page nor a call page (UI-8)', async () => {
    // COMPLIANCE.md :92 names every thesis page and every `/call/[thesisId]` page and nothing else, and §26
    // :820's ruling removed it from `/corpus` and `/theses` on the same reasoning: a list, a record and a
    // researcher's own working view each carry no claim's argument. This is the first GATED page in the set.
    const container = await renderResearchDashboard(LOCALE);
    const shown = shownText(container);
    const control = controlFragment();
    expect({
      found: DISCLAIMERS.filter((sentence) => shown.includes(sentence)),
      // THE FLOOR: the page really drew its four regions and its rows, so "no disclaimer" is a fact about
      // what it renders rather than about a render that produced nothing.
      regions: container.querySelectorAll('[data-region]').length,
      rows: container.querySelectorAll('[data-thesis-row]').length > 0,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ found: [], regions: 4, rows: true, controlFindsBoth: 2 });
  });

  it('THE GATED CORPUS AND ITS CLAIMS LENS CARRY NO DISCLAIMER — a corpus view is neither, at either scope (UI-8 chunk 5)', async () => {
    // The POSITIVE control is the same one this file already uses: the fragment is blind (R65's shape), so
    // the WHOLE catalogue sentence is what is looked for, and the control proves the reader finds both.
    const corpus = await snapshotResearchCorpus(LOCALE, { searchParams: { page: 'page-one' }, depth: 3 });
    const claims = await snapshotResearchClaims(LOCALE);
    const control = controlFragment();
    expect({
      onTheCorpus: DISCLAIMERS.filter((sentence) => shownText(corpus).includes(sentence)),
      onTheClaims: DISCLAIMERS.filter((sentence) => shownText(claims).includes(sentence)),
      // THE FLOOR: both pages really drew their rows, so "no disclaimer" is a fact about what they render.
      corpusRows: corpus.querySelectorAll('[data-capture-row]').length > 0,
      claimRows: claims.querySelectorAll('[data-claim-row]').length > 0,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ onTheCorpus: [], onTheClaims: [], corpusRows: true, claimRows: true, controlFindsBoth: 2 });
  });

  it('THE WORKING VIEW CARRIES NO DISCLAIMER — it draws a thesis, and COMPLIANCE.md :92 names the PUBLIC ones (UI-8 chunk 7a)', async () => {
    // THIS IS THE CLOSEST CALL IN THE SET, which is why it is asserted rather than assumed: the page's centre
    // IS a thesis, and a reader of the rule by its subject alone would put the disclaimer here. :92 names
    // „every thesis page · every /call/[thesisId] page" — the pages whose reader is the PUBLIC. A gated
    // working view has one reader, the researcher who wrote it, and §26 :820's ruling reaches it unchanged.
    const container = await snapshotResearchThesis(LOCALE);
    const control = controlFragment();
    expect({
      found: DISCLAIMERS.filter((sentence) => shownText(container).includes(sentence)),
      // THE FLOOR: the page really drew its two regions and the owed entries — so "no disclaimer" is a fact
      // about a rendered thesis and not about a tree that produced nothing.
      regions: container.querySelectorAll('[data-region]').length,
      owed: container.querySelectorAll('[data-owed-entry]').length > 0,
      claim: (container.querySelector('h1[data-claim]')?.textContent ?? '').length > 0,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ found: [], regions: 2, owed: true, claim: true, controlFindsBoth: 2 });
  });

  it('THE CLAIMS VIEW CARRIES NO DISCLAIMER — a corpus view is neither a thesis page nor a call page', async () => {
    setPublicBodies({ '/api/corpus/claims?page=page-one': { status: 200, body: claimsAnswer } });
    const container = containerOf(
      await renderPage((await import('../src/app/[locale]/corpus/claims/page')).default, { locale: LOCALE }, { locale: LOCALE, searchParams: { page: 'page-one' } }),
    );
    const shown = shownText(container);
    const control = controlFragment();
    expect({
      found: DISCLAIMERS.filter((sentence) => shown.includes(sentence)),
      // THE FLOOR: the view really drew its rows, so the absence is a fact about the chrome rather than
      // about a render that produced nothing — the shape a rendered-case absence fails by default.
      rows: container.querySelectorAll('[data-claim-row]').length > 0,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ found: [], rows: true, controlFindsBoth: 2 });
  });

  it('`/corpus` AS THE STREAM CARRIES NO DISCLAIMER EITHER — it rendered one in EACH branch, so both are held', async () => {
    setPublicBodies({ '/api/corpus?kind=DIFF': { status: 200, body: corpusStream } });
    const container = containerOf(await renderPage((await import('../src/app/[locale]/corpus/page')).default, { locale: LOCALE }, { locale: LOCALE, searchParams: { kind: 'DIFF' } }));
    const shown = shownText(container);
    const control = controlFragment();
    expect({
      found: DISCLAIMERS.filter((sentence) => shown.includes(sentence)),
      rows: container.querySelectorAll('[data-entry]').length > 0,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ found: [], rows: true, controlFindsBoth: 2 });
  });

  // THE CAPTURE PAGE, RENDERED (UI-7 chunk (c) · 2a). The source scan below covers all three record pages
  // as a SET and is kept; this case covers the one that now exists as a RENDER, which is the only way to
  // catch a sentence that reaches a reader through a component the page imports rather than through its own
  // source — the half a source scan cannot see. „דף רשומה הוא לא דף תזה".
  it('THE CAPTURE PAGE CARRIES NO DISCLAIMER — a record page is not a thesis page, held on the render', async () => {
    setPublicBodies({ '/api/pages/page-one/captures/20211223211940': { status: 200, body: captureRead } });
    const container = containerOf(
      await renderPage(
        (await import('@/app/[locale]/pages/[trackedUrlId]/captures/[capture]/page')).default,
        { locale: LOCALE, trackedUrlId: 'page-one', capture: '20211223211940' },
        { locale: LOCALE },
      ),
    );
    const shown = shownText(container);
    const control = controlFragment();
    expect({
      found: DISCLAIMERS.filter((sentence) => shown.includes(sentence)),
      // THE FLOOR: the record's BYTES rendered, so "no disclaimer" is a fact about this page's chrome and
      // not about a render that produced nothing to read.
      bytes: (container.querySelector('[data-record-body="CAPTURE"]')?.textContent ?? '') === captureRead.text,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ found: [], bytes: true, controlFindsBoth: 2 });
  });

  it('THE DIFF PAGE CARRIES NO DISCLAIMER EITHER — and neither does its 409 state, which is a page of its own', async () => {
    const page = (await import('@/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page')).default;
    const PAIR = '/api/pages/page-one/diffs/20211223211940/20220105090000';
    const args = { locale: LOCALE, trackedUrlId: 'page-one', before: '20211223211940', after: '20220105090000' };

    setPublicBodies({ [PAIR]: { status: 200, body: diffInput } });
    const shown = containerOf(await renderPage(page, args, { locale: LOCALE }));
    // THE 409 IS A SEPARATE RETURN with its own chrome, so a disclaimer could live in one branch and not the
    // other — which is exactly how `/corpus` carried one in each of its two branches.
    setPublicBodies({ [PAIR]: { status: 409 } });
    const awaiting = containerOf(await renderPage(page, args, { locale: LOCALE }));
    const control = controlFragment();
    expect({
      foundShown: DISCLAIMERS.filter((sentence) => shownText(shown).includes(sentence)),
      foundAwaiting: DISCLAIMERS.filter((sentence) => shownText(awaiting).includes(sentence)),
      chunks: shown.querySelectorAll('[data-chunk-side]').length > 0,
      awaitingRendered: awaiting.querySelector('[data-awaiting]') !== null,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ foundShown: [], foundAwaiting: [], chunks: true, awaitingRendered: true, controlFindsBoth: 2 });
  });

  it('THE RECORDS PAGE CARRIES NO DISCLAIMER — the page a stranger holding a citation lands on first', async () => {
    // THE ONE MOST TEMPTING TO GIVE IT. This page is where an outsider arrives from a published thesis, so
    // it is exactly where a disclaimer "feels" due — and §26 :820 rules it out in the researcher's own
    // words, „דף רשומה הוא לא דף תזה". COMPLIANCE.md :92 names a thesis page and a call page and no other.
    setPublicBodies({ [`/api/records/${resolvedCaptureRecord.fileHash}`]: { status: 200, body: resolvedCaptureRecord } });
    const page = (await import('@/app/[locale]/records/[fileHash]/page')).default;
    const container = containerOf(await renderPage(page, { locale: LOCALE, fileHash: resolvedCaptureRecord.fileHash }, { locale: LOCALE }));
    const control = controlFragment();
    expect({
      found: DISCLAIMERS.filter((sentence) => shownText(container).includes(sentence)),
      // THE FLOOR: the record really resolved and its link onward drew, so "no disclaimer" is a fact about
      // this page's chrome and not about a render that produced nothing.
      linkOnward: container.querySelectorAll('a').length === 1,
      controlFindsBoth: DISCLAIMERS.filter((sentence) => (control.textContent ?? '').includes(sentence)).length,
    }).toEqual({ found: [], linkOnward: true, controlFindsBoth: 2 });
  });
});

describe('no-disclaimer-off-the-thesis · the set, over the source', () => {
  it('EXACTLY THE PAGES COMPLIANCE NAMES IMPORT THE DISCLAIMER — every other public page, record pages included, does not', () => {
    const pages = requireSubjects(
      'public page files',
      // The set as a VALUE, and it fails on an empty one: a scan that examined nothing is the vacuity this
      // repository names as its own.
      ['corpus/page.tsx', 'corpus/claims/page.tsx', 'theses/page.tsx', ...MAY_CARRY_IT, 'pages/[trackedUrlId]/captures/[capture]/page.tsx', 'pages/[trackedUrlId]/diffs/[before]/[after]/page.tsx', 'records/[fileHash]/page.tsx']
        .map((rel) => ({ rel, source: sourceOf(rel) }))
        .filter(({ source }) => source !== undefined),
    );
    const carriers = pages.filter(({ source }) => (source ?? '').includes('LegalDisclaimer')).map(({ rel }) => rel);
    const allowed = MAY_CARRY_IT.filter((rel) => sourceOf(rel) !== undefined);
    expect({
      // A page outside the allowed set that names the component is the finding.
      unexpected: carriers.filter((rel) => !MAY_CARRY_IT.includes(rel as (typeof MAY_CARRY_IT)[number])),
      // And the allow-list must still OFFEND — every page on it really does carry it. An allow-list whose
      // entries no longer need it is an allow-list nobody is maintaining.
      allowedThatCarryIt: allowed.filter((rel) => (sourceOf(rel) ?? '').includes('LegalDisclaimer')).length,
      allowedTotal: allowed.length,
      // TWO-SIDED: the set is neither empty nor everything.
      examined: pages.length >= 5,
    }).toEqual({ unexpected: [], allowedThatCarryIt: allowed.length, allowedTotal: 3, examined: true });
  });
});

/** A public page's source, or `undefined` where the page is not built yet — the record pages, at this chunk. */
function sourceOf(rel: string): string | undefined {
  try {
    return readFileSync(join(APP, rel), 'utf8');
  } catch {
    return undefined;
  }
}
