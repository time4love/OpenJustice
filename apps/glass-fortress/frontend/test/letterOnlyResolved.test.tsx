jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent } from '@testing-library/react';
import { renderPage, setAuthState, setPathname, setPublicBodies, textNodes, type Locale, type PageRender } from './render';
import { FRONTEND, requireSubjects } from './scan';
import published from './fixtures/thesis/published.json';
import publishedWithAnalysis from './fixtures/thesis/published-with-analysis.json';
import callLive from './fixtures/thesis/call-live.json';

// ---------------------------------------------------------------------------
// letter-only-resolved — R56's F3, fixed BY CONSTRUCTION by the re-briefed UI-5;
// docs/gf-ui-refactor-plan.md §10 :1123–:1124; docs/gf-ui-design-session-2026-09-16.md §1.6, §6.
//
// A REQUEST'S TEXT IS OPAQUE TO THE PLATFORM. Thesis A2 :1325–:1326 defines the decision's `request`
// as `{ text, authority, legalBasis, addresses, restsOn }` and says nothing whatever about the text's
// shape; T4 :672 puts the researcher between the drafter and publication — "reads it, amends it with
// Claude, approves it". So a published request MAY carry `{{REQUESTER_NAME}}` and `{{DATE}}`, and MAY
// NOT: the tokens are the drafter's habit, not the contract's guarantee. NO DESIGN AND NO PLAN NAMES
// THEM — the only mentions anywhere in `docs/` are three dated findings docs, which corroborate and
// never decide.
//
// THE FIXTURE SET THEREFORE CARRIES BOTH SHAPES, which is what plan §4 :880–:883 means by writing a
// fixture from the appendix: the appendix states a RANGE, so the fixtures state the range.
//   · TEMPLATED — `published.json`, `call-live.json`: the drafter's normal output, published as drawn,
//     which is what run B actually published.
//   · AMENDED — `published-with-analysis.json`, `published-no-statement.json`, `republished.json`:
//     the researcher amended the placeholders away before publishing.
// A set asserting the tokens are ALWAYS there asserts what the contract does not promise. A set
// asserting they are NEVER there is the `gapId` defect again — five fixtures agreeing with each other
// and with nothing real.
//
// AND THE PROPERTY IS THE SAME FOR BOTH: neither shape may reach a rendered text node or a COPY
// control's value on a public page. The templated one must be resolved inside the letter dialog and
// nowhere else; the amended one has nothing to resolve and must still show no token.
//
// THE CLIPBOARD HALF IS AS IMPORTANT AS THE VISIBLE HALF, and it is the one a text-only predicate
// misses: a COPY control whose value is the raw template hands the reader an unusable letter, and
// `no-id-as-text` never looks at it because `{{…}}` is not an id shape.
// ---------------------------------------------------------------------------

const LOCALES: readonly Locale[] = ['he', 'en'];
/** A template token as a drafter emits it — `{{REQUESTER_NAME}}`, `{{DATE}}`. */
const TEMPLATE_TOKEN = /\{\{[A-Z_]+\}\}/;

/** Every fixture that carries a published request, and which shape each is written in. */
const REQUEST_FIXTURES: readonly string[] = [
  'test/fixtures/thesis/published.json',
  'test/fixtures/thesis/call-live.json',
  'test/fixtures/thesis/published-with-analysis.json',
  'test/fixtures/thesis/published-no-statement.json',
  'test/fixtures/thesis/republished.json',
];

const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const callPage = () => import('../src/app/[locale]/call/[thesisId]/page');

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

/**
 * Both request shapes, each on the page that publishes it.
 *
 * EACH RENDER IS STAGED ON ITS OWN, and that is not tidiness. `published.json` and
 * `published-with-analysis.json` carry THE SAME `thesisId` — every fixture but `republished` and
 * `withdrawn` does — so staging them in one object literal silently drops the first: the later key
 * wins, and both renders serve the same body. Measured while writing this file: the templated thesis
 * page was never exercised and the case went green over a body it had not rendered. One body per
 * `setPublicBodies` call makes the collision impossible instead of remembered.
 */
async function everyShape(locale: Locale): Promise<{ name: string; container: HTMLElement }[]> {
  const thesis = (await thesisPage()).default;
  const call = (await callPage()).default;
  const rendered: { name: string; container: HTMLElement }[] = [];

  setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: published } });
  rendered.push({
    name: 'thesis/templated',
    container: containerOf('thesis templated', await renderPage(thesis, { locale, id: published.thesisId }, { locale })),
  });

  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
  });
  rendered.push({
    name: 'call/templated',
    container: containerOf('call templated', await renderPage(call, { locale, thesisId: published.thesisId }, { locale })),
  });

  setPublicBodies({ [`/api/thesis/${publishedWithAnalysis.thesisId}`]: { status: 200, body: publishedWithAnalysis } });
  rendered.push({
    name: 'thesis/amended',
    container: containerOf('thesis amended', await renderPage(thesis, { locale, id: publishedWithAnalysis.thesisId }, { locale })),
  });

  return rendered;
}

/** How many of the set's requests carry a token BEFORE anything renders — read from the fixtures on disk. */
function templatedFixtures(): string[] {
  return requireSubjects('fixtures carrying a published request', REQUEST_FIXTURES).filter((file) =>
    TEMPLATE_TOKEN.test(readFileSync(join(FRONTEND, file), 'utf8')),
  );
}

describe('letter-only-resolved', () => {
  it('THE DIALOG ITSELF, OPENED: neither its text nor its COPY value carries a token — the region a page render never reaches', async () => {
    // A decoy found this: swapping the dialog's COPY value for the RAW request text reddened NOTHING,
    // because `<Sheet>` renders null while closed and the two cases below only ever read a closed page.
    // The letter's own contents — the one place a token is resolved — were exercised by no case at all.
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    });
    const page = (await callPage()).default;
    const rendered = await renderPage(page, { locale: 'he', thesisId: published.thesisId }, { locale: 'he' });
    if (rendered.notFound) throw new Error('the call page answered the one 404');
    const opener = rendered.container.querySelector('button.appeal-button');
    if (opener === null) throw new Error('the request card renders no control that opens the letter');
    fireEvent.click(opener);

    const dialog = document.querySelector('[role="dialog"]');
    if (dialog === null) throw new Error('the letter did not open');
    const letter = dialog.querySelector('[data-letter]');
    requireSubjects('text nodes of the opened letter', textNodes(dialog));
    const copyValues = [...dialog.querySelectorAll('[data-copy-value]')].map((node) => node.getAttribute('data-copy-value') ?? '');
    requireSubjects('COPY controls inside the letter', copyValues);
    expect({
      tokensInTheLetter: TEMPLATE_TOKEN.test(letter?.textContent ?? ''),
      tokensInAnyCopyValue: copyValues.some((value) => TEMPLATE_TOKEN.test(value)),
      // And the resolution is VISIBLE: both cues ride on the filled runs (the researcher's Q5).
      filledRunsMarked: dialog.querySelectorAll('[data-letter-filled]').length,
    }).toEqual({ tokensInTheLetter: false, tokensInAnyCopyValue: false, filledRunsMarked: 4 });
  });

  it('THE FLOOR: at least one request in the fixture set carries a token BEFORE rendering', () => {
    // REQUIRED, not decorative. "No token reaches a rendered node" is satisfied by a fixture set
    // carrying no tokens at all — R57's P0, a property satisfied by zero — and that is exactly the
    // vacuity the `gapId` round was paid for. The floor is asserted, and the set is PRINTED so the
    // number is checkable by a later reader rather than taken on this file's word.
    const templated = templatedFixtures();
    console.log(
      `letter-only-resolved: ${String(templated.length)} of ${String(REQUEST_FIXTURES.length)} request fixtures are TEMPLATED — ${templated
        .map((file) => file.split('/').at(-1) ?? file)
        .join(', ')}`,
    );
    expect({ templated: templated.length >= 1 ? '>= 1' : 0 }).toEqual({ templated: '>= 1' });
  });

  it('THE RANGE: the set carries the AMENDED shape too — a request the researcher stripped before publishing', () => {
    // The other half of the range (thesis A2 :1325–:1326, the text is opaque; T4 :672, the researcher
    // amends). Without this the set would assert that a published request ALWAYS carries the tokens,
    // which the contract nowhere promises.
    const amended = REQUEST_FIXTURES.filter((file) => !templatedFixtures().includes(file));
    expect({ amended: amended.length >= 1 ? '>= 1' : 0 }).toEqual({ amended: '>= 1' });
  });

  it('no rendered TEXT NODE on a public page carries a template token — both shapes, both locales', async () => {
    const offenders: string[] = [];
    for (const locale of LOCALES) {
      for (const { name, container } of await everyShape(locale)) {
        offenders.push(
          ...requireSubjects(`text nodes of the ${name} page (${locale})`, textNodes(container))
            .filter((node) => TEMPLATE_TOKEN.test(node.data))
            .map((node) => `${locale}/${name}: ${(TEMPLATE_TOKEN.exec(node.data) ?? [''])[0]}`),
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no COPY control on a public page carries a template token in its value — the half a text-only predicate misses', async () => {
    const offenders: string[] = [];
    for (const locale of LOCALES) {
      for (const { name, container } of await everyShape(locale)) {
        offenders.push(
          ...[...container.querySelectorAll('[data-copy-value]')]
            .map((element) => element.getAttribute('data-copy-value') ?? '')
            .filter((value) => TEMPLATE_TOKEN.test(value))
            .map((value) => `${locale}/${name}: ${(TEMPLATE_TOKEN.exec(value) ?? [''])[0]}`),
        );
      }
    }
    expect(offenders).toEqual([]);
  });
});
