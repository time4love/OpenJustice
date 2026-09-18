jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { renderPage, setAuthState, setPathname, setPublicBodies, type Locale } from './render';
import { requireSubjects } from './scan';
import fixture from './fixtures/thesis/published-markdown.json';

// ---------------------------------------------------------------------------
// every-markdown-capability — THE TEXT RENDERS EVERY CAPABILITY THE RESEARCHER'S DRAFTING PRODUCES.
//
// docs/gf-ui-flows.md §17 :538 as amended 2026-09-18 (the researcher): *"the text renders EVERY Markdown
// capability the researcher's drafting produces — emphasis, strikethrough, lists, quotes and TABLES —
// because the text is written with a model in claude.ai and A CAPABILITY SILENTLY DROPPED IS A SENTENCE THE
// RESEARCHER WROTE AND NO READER SEES."*
//
// THE DEFECT THIS EXISTS TO STOP IS SILENT BY CONSTRUCTION. `markdownToReact` mapped `strong_open`,
// `em_open` and `s_open` to an empty `break` — the parser emitted them, the map dropped them, and the words
// still rendered, unemphasised. Nothing failed, nothing logged, and the only way to see it was to know what
// the researcher had typed. A renderer's SILENCE is exactly what an instrument is for.
//
// WHAT IS RULED OUT, AND IT HAS A CASE OF ITS OWN (the researcher, 2026-09-18): TASK LISTS (`- [ ]`) and
// FOOTNOTES (`[^1]`) are NOT part of a thesis — both need an npm plugin, and a thesis is an ARGUMENT, not a
// working document. They render as the text they are. **A ruling with no case is a surprise waiting**, so
// the last case below holds them as text rather than leaving their absence to be rediscovered.
//
// AND TWO LIMITS THAT ARE SECURITY, NOT CAPABILITY (§17 :538): `html: false` stays — "every capability"
// never means raw markup — and `linkify` stays off, so a bare URL remains isolated text rather than a link
// nobody chose. `<https://…>` is a CommonMark AUTOLINK and is not HTML; it is a link the researcher wrote.
// ---------------------------------------------------------------------------

const LOCALES: readonly Locale[] = ['he', 'en'];

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

async function theText(locale: Locale): Promise<HTMLElement> {
  setPublicBodies({ [`/api/thesis/${fixture.thesisId}`]: { status: 200, body: fixture } });
  const page = (await import('../src/app/[locale]/theses/[id]/page')).default;
  const rendered = await renderPage(page, { locale, id: fixture.thesisId }, { locale });
  if (rendered.notFound) throw new Error('the thesis page answered the one 404, not a body');
  const text = rendered.container.querySelector('[data-thesis-text]');
  if (text === null) throw new Error('the thesis page rendered no [data-thesis-text] block');
  return text as HTMLElement;
}

/** Every capability §17 :538 names, and the element each must become. */
const CAPABILITIES: readonly { capability: string; selector: string; least: number }[] = [
  { capability: 'headings, three levels', selector: 'h2, h3, h4', least: 3 },
  { capability: 'emphasis — bold', selector: 'strong', least: 1 },
  { capability: 'emphasis — italic', selector: 'em', least: 1 },
  { capability: 'strikethrough', selector: 's', least: 1 },
  { capability: 'a bullet list', selector: 'ul', least: 1 },
  { capability: 'an ordered list', selector: 'ol', least: 1 },
  { capability: 'a nested list', selector: 'ul ul, ul ol, ol ul, ol ol', least: 1 },
  { capability: 'a quote', selector: 'blockquote', least: 1 },
  { capability: 'inline code', selector: 'code', least: 1 },
  { capability: 'a fenced code block', selector: 'pre code', least: 1 },
  { capability: 'a rule', selector: 'hr', least: 1 },
  { capability: 'a link, and an autolink', selector: 'a[href]', least: 2 },
  { capability: 'a table', selector: 'table', least: 1 },
  { capability: 'a table head', selector: 'thead th', least: 3 },
  { capability: 'a table body', selector: 'tbody td', least: 3 },
];

describe('every-markdown-capability', () => {
  it('EVERY capability the researcher writes renders as its own element — §17 :538 as amended', async () => {
    for (const locale of LOCALES) {
      const text = await theText(locale);
      // THE FLOOR: a capability list that examined nothing is not a pass, and a fixture that stopped
      // carrying the text would make every `least` trivially unmet rather than silently met.
      requireSubjects('capabilities asserted', CAPABILITIES);
      const found = CAPABILITIES.map((row) => ({ ...row, count: text.querySelectorAll(row.selector).length }));
      if (locale === 'he') {
        console.log(
          `every-markdown-capability: ${String(found.length)} capabilities — ` +
            found.map((row) => `${row.capability}=${String(row.count)}`).join(' · '),
        );
      }
      expect({ locale, missing: found.filter((row) => row.count < row.least).map((row) => row.capability) }).toEqual({
        locale,
        missing: [],
      });
    }
  });

  it('NO LOCAL TYPOGRAPHY UTILITY on a block the region already styles — the region owns face, size and weight', async () => {
    // FOUND ON THE REAL BODY, through the local dev server, one round after the rule landed: the
    // researcher's heading computed **weight 600** where `[data-thesis-text] h2` says 700, because the
    // renderer wrote Tailwind's `font-semibold` onto the element. The rule was right and the page was
    // wrong, and chunk 3's case — which reads the RULE — was green over it.
    //
    // THE THIRD TIME THIS EXACT SHAPE HAS BEEN PAID FOR: `leading-relaxed` on a paragraph (R58's local
    // run), `leading-relaxed` on the disclaimer (R59 · T4), and now `font-semibold` on a heading. So the
    // class list is held rather than remembered: a block inside the read carries no local size, weight,
    // leading or family utility at all.
    const text = await theText('he');
    const blocks = [...text.querySelectorAll('h2, h3, h4, p, li, blockquote, td, th')];
    requireSubjects('blocks inside the read', blocks);
    const LOCAL_TYPOGRAPHY = /(^|\s)(text-(xs|sm|base|lg|xl|\dxl)|font-(thin|light|normal|medium|semibold|bold|extrabold|black|serif|sans)|leading-\S+)(\s|$)/;
    const offenders = blocks
      .filter((block) => LOCAL_TYPOGRAPHY.test(block.className))
      .map((block) => `${block.tagName.toLowerCase()}: ${block.className}`);
    expect(offenders).toEqual([]);
  });

  it("a table keeps the reading measure — it scrolls inside its own box and never widens the page (§17 :538; §6 :963)", async () => {
    const text = await theText('he');
    const table = text.querySelector('table');
    if (table === null) throw new Error('no table rendered — the capability case above says why that matters');
    // jsdom has no layout, so the SCROLLPORT is what can be held here: the table's own wrapper declares the
    // overflow, and the page is measured at 375 in a browser and recorded in the step's dated doc.
    const wrapper = table.parentElement;
    expect({
      wrapped: wrapper !== null && wrapper !== text,
      scrolls: wrapper?.hasAttribute('data-table-scroll'),
    }).toEqual({ wrapped: true, scrolls: true });
  });

  it("a table cell's alignment is the researcher's, and no parsed string reaches a style attribute", async () => {
    // markdown-it emits alignment as `style="text-align:left|right|center"` on `th`/`td`. The three values
    // are the parser's own and can never be the researcher's text — but a parsed string written into a
    // `style` attribute is a habit worth not having, so the three known values map to a CLASS and the
    // attribute is never passed through. The alignment is honoured; the mechanism is not.
    const text = await theText('he');
    const cells = [...text.querySelectorAll('th, td')];
    requireSubjects('table cells', cells);
    expect({
      styled: cells.filter((cell) => cell.hasAttribute('style')).length,
      aligned: cells.filter((cell) => /md-align-(left|right|center)/.test(cell.className)).length >= 3,
    }).toEqual({ styled: 0, aligned: true });
  });

  it('BIDI survives the new blocks: a date inside a table cell is still isolated left-to-right', async () => {
    const text = await theText('he');
    const cells = [...text.querySelectorAll('td')];
    requireSubjects('table body cells', cells);
    const dated = cells.filter((cell) => /\d{1,2}\.\d{1,2}\.\d{4}/.test(cell.textContent ?? ''));
    requireSubjects('table cells carrying a date', dated);
    const bare = dated
      .filter((cell) => cell.querySelectorAll('bdi[dir="ltr"]').length === 0)
      .map((cell) => (cell.textContent ?? '').trim().slice(0, 24));
    expect(bare).toEqual([]);
  });

  it('THE SECURITY BOUNDARY: raw HTML in the researcher`s text renders as the TEXT it is — `html: false` (§17 :538)', async () => {
    // "EVERY CAPABILITY" NEVER MEANS MARKUP, and §17 :538 says so in the same sentence that opens the rest
    // up. This clause had no case: nothing in the suite would have failed if `html` were flipped to true,
    // and a boundary nothing holds is the same shape as a ruling nothing holds — the very defect the
    // ruled-out case below exists to prevent, on the security side instead of the feature side.
    const text = await theText('he');
    expect({
      renderedAsText: (text.textContent ?? '').includes('<b>תגית גולמית</b>'),
      boldElementsFromTheRawTag: [...text.querySelectorAll('b')].length,
    }).toEqual({ renderedAsText: true, boldElementsFromTheRawTag: 0 });
  });

  it('`linkify: false`: a BARE url stays isolated text — a link nobody chose is not a capability (§17 :538)', async () => {
    const text = await theText('he');
    const bare = 'https://example.gov.il/covid/archive';
    const linked = [...text.querySelectorAll('a[href]')].map((anchor) => anchor.getAttribute('href') ?? '');
    const isolatedRun = [...text.querySelectorAll('bdi[dir="ltr"]')].some((run) => (run.textContent ?? '').includes(bare));
    expect({ present: (text.textContent ?? '').includes(bare), linked: linked.includes(bare), isolatedRun }).toEqual({
      present: true,
      linked: false,
      isolatedRun: true,
    });
  });

  it('RULED OUT, and held as text: a task list and a footnote are NOT part of a thesis (the researcher, 2026-09-18)', async () => {
    // Neither is a gap. Both need an npm plugin, and a thesis is an argument rather than a working
    // document — so the marks stay in the text exactly as written. Without this case their absence looks
    // like an oversight to the next reader, and someone adds a plugin.
    const text = await theText('he');
    const rendered = text.textContent ?? '';
    expect({
      taskListMarkStaysText: rendered.includes('- [ ]') || rendered.includes('[ ]'),
      footnoteMarkStaysText: rendered.includes('[^1]'),
      noCheckbox: text.querySelectorAll('input[type="checkbox"]').length,
    }).toEqual({ taskListMarkStaysText: true, footnoteMarkStaysText: true, noCheckbox: 0 });
  });
});
