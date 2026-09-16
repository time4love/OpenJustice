jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { fireEvent } from '@testing-library/react';
import { renderPage, setAuthState, setPathname, setPublicBodies, type PageRender } from './render';
import { requireSubjects } from './scan';
import published from './fixtures/thesis/published.json';

// ---------------------------------------------------------------------------
// THE RENDERED TREE IS WHAT THE BROWSER RE-PARSES — and a browser does not read the tree React describes, it reads
// the HTML the server sent. A BLOCK ELEMENT INSIDE A `<p>` IS NOT NESTED THERE by any parser: the paragraph is
// closed at the opening tag, the block is re-parented, and React's hydration then finds a DOM that does not match
// what it rendered. The page still shows, and the console fills with a hydration mismatch — the class of defect
// jsdom's own render will never report, because jsdom is handed the tree, not the markup.
//
// The appeals are where it bites: each field is a label and the researcher's words, and the researcher's words are
// their own block (docs/gf-ui-flows.md §16 :517–:521 — ONE component for that voice).
//
// THE SHEET COUNTS TOO. A citation chip sits INLINE inside a paragraph of the text (§17 :532–:538); the sheet it
// opens is a block over the page (§4 :157–:158), so an open sheet inside that paragraph would be the same defect
// on the reader's first tap — which is why the case opens one.
// ---------------------------------------------------------------------------

/** What a paragraph may never contain — HTML's own rule: `<p>` holds phrasing content only. */
const BLOCK = 'div, section, article, p, ul, ol, li, h1, h2, h3, h4, h5, h6, pre, blockquote, details, main, header, footer, table, figure';

const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
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

/** Every paragraph holding a block element, named by what it holds — the offenders, or none. */
function offenders(container: HTMLElement): string[] {
  const paragraphs = [...container.querySelectorAll('p')];
  requireSubjects('paragraphs of the thesis page', paragraphs);
  return paragraphs.flatMap((paragraph) =>
    [...paragraph.querySelectorAll(BLOCK)].map(
      (inside) => `<p>${(paragraph.textContent ?? '').trim().slice(0, 30)}…</p> holds <${inside.tagName.toLowerCase()}>`,
    ),
  );
}

describe('the rendered tree survives the browser that re-parses it', () => {
  it('no paragraph of the thesis page holds a block element — with the appeals rendered, and with a citation sheet open', async () => {
    setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: published } });
    const page = (await thesisPage()).default;
    const container = containerOf(await renderPage(page, { locale: 'he', id: published.thesisId }, { locale: 'he' }));

    const closed = offenders(container);

    const chip = container.querySelector('[data-chip] button');
    if (chip === null) throw new Error('the page rendered no citation chip to open');
    fireEvent.click(chip);

    expect({ closed, open: offenders(container) }).toEqual({ closed: [], open: [] });
  });
});
