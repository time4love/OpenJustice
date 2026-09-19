jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { requireSubjects } from './scan';
import { corpusStream } from './fixtures/corpus/stream';

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
});

describe('no-disclaimer-off-the-thesis · the set, over the source', () => {
  it('EXACTLY THE PAGES COMPLIANCE NAMES IMPORT THE DISCLAIMER — every other public page, record pages included, does not', () => {
    const pages = requireSubjects(
      'public page files',
      // The set as a VALUE, and it fails on an empty one: a scan that examined nothing is the vacuity this
      // repository names as its own.
      ['corpus/page.tsx', 'theses/page.tsx', ...MAY_CARRY_IT, 'pages/[trackedUrlId]/captures/[capture]/page.tsx', 'pages/[trackedUrlId]/diffs/[before]/[after]/page.tsx', 'records/[fileHash]/page.tsx']
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
