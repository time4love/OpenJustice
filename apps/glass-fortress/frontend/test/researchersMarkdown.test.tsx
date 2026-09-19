jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { declarationsOf, requireSubjects } from './scan';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import published from './fixtures/thesis/published.json';
import publishedMarkdown from './fixtures/thesis/published-markdown.json';
import callLive from './fixtures/thesis/call-live.json';

// ---------------------------------------------------------------------------
// researchers-markdown — THE RESEARCHER'S VOICE RENDERS THEIR MARKDOWN WHEREVER IT APPEARS.
//
// docs/gf-ui-flows.md §16 :521 as amended 2026-09-18 (the researcher): *"the researcher's VOICE renders THEIR
// MARKDOWN wherever it appears — the public-interest statement, the publication rationale, the intake line and
// every appeal field — through the ONE renderer §17 :538 names, because the text is drafted with a model in
// claude.ai and a capability dropped is a sentence the researcher wrote and no reader sees."*
//
// ONE RULE, NO EXCEPTIONS (the researcher's option (ג), 2026-09-18). Until this chunk `markdownToReact` had ONE
// caller — `ThesisText.tsx` :36 — so the published TEXT rendered every capability and the other ten fields of the
// same voice rendered none. A researcher who writes two paragraphs in the rationale got one run-on block.
//
// WHY 176 GREEN CASES NEVER SAW IT, AND WHY THE FLOOR BELOW EXISTS. Every fixture's prose field was a single
// short sentence — `published.json`'s rationale was ONE 70-character line with no newline at all — while the
// LIVE rationale is 2,632 characters over 6 newlines and 3 blank-line breaks (measured on the real body through
// `localhost:3011`, 2026-09-18). A case asserting "the paragraphs render" is satisfied by a fixture with no
// paragraphs in it, so the subject's SHAPE is asserted before the rendering is.
//
// WHAT IS EXCLUDED, AND IT IS THE RESEARCHER'S OWN LINE (§16 :521): a corpus record's captured text, a diff
// chunk and a trajectory's claim text are THE ARCHIVE'S BYTES and are never parsed — a `#` or a `*` standing in
// a captured page would re-interpret what the record says, which is an evidence change wearing a display
// change's clothes.
//
// THE FILTER BELOW IS NOW BELT AND BRACES, and it is kept deliberately. It was written when `RecordPane`
// still rendered those three values through `ResearcherWords`, so the ARCHIVE wore the researcher's-voice
// marker and took its serif from it — measured on the real body as a third `[data-researcher-words]` block
// of 4,539 characters. RULED 2026-09-18 (the researcher, §16 :521): the archive leaves the voice, and
// `.record-captured` DECLARES the same face instead of inheriting it. The exclusion stays because a subject
// set should not depend on the absence of a marker elsewhere, and the case below holds that absence directly
// — so if the marker ever returns, an instrument says so by name rather than this filter hiding it.
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';

const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const callPage = () => import('../src/app/[locale]/call/[thesisId]/page');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
  window.localStorage.clear();
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

/**
 * The thesis page. `withPane` MOUNTS THE RIGHT PANE, and without it a record pane is DECLARED and never
 * rendered — `test/render.tsx` :153–:157's "green over an unexercised property" shape. The archive case
 * below needs the record actually in the tree to prove it was not parsed.
 */
async function renderThesis(body: unknown, withPane = false): Promise<HTMLElement> {
  const { thesisId } = body as { thesisId: string };
  setPublicBodies({ [`/api/thesis/${thesisId}`]: { status: 200, body } });
  const page = (await thesisPage()).default;
  return containerOf(
    await renderPage(page, { locale: LOCALE, id: thesisId }, {
      locale: LOCALE,
      ...(withPane
        ? {
            wrapper: ({ children }: { children: React.ReactNode }) => (
              <TabsProvider>
                {children}
                <RightPane />
              </TabsProvider>
            ),
          }
        : {}),
    }),
  );
}

async function renderCall(): Promise<HTMLElement> {
  setPublicBodies({
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
  });
  const page = (await callPage()).default;
  return containerOf(await renderPage(page, { locale: LOCALE, thesisId: published.thesisId }, { locale: LOCALE }));
}

/**
 * The researcher's PROSE blocks of a rendered page — every `[data-researcher-words]` that is NOT the archive's.
 * `requireSubjects` is the vacuity guard: a page that rendered none throws rather than passing.
 */
function proseBlocks(container: HTMLElement, what: string): HTMLElement[] {
  const all = [...container.querySelectorAll<HTMLElement>('[data-researcher-words]')];
  return [...requireSubjects(what, all.filter((element) => element.closest('[data-record]') === null))];
}

/** The block elements a rendered prose field holds — what a paragraph break must have become. */
const BLOCKS = 'p, ul, ol, blockquote, h2, h3, h4, table, pre, hr';

/** How many paragraphs a source string states, by its blank-line breaks. */
const paragraphsIn = (source: string): number => source.split(/\n[ \t]*\n/).filter((run) => run.trim() !== '').length;

// ---------------------------------------------------------------------------
// THE FLOOR, AND IT IS TWO-SIDED. The defect was one-sided — a fixture too SIMPLE to exercise the renderer —
// so a floor that only demanded "at least one paragraph" would be met by the very fixture that hid the bug.
// Each subject states the number of paragraphs its source carries AND that the number is greater than one,
// and the whole set is printed, so a fixture edited back to one line fails HERE, by name, before any rendering
// is asserted at all.
// ---------------------------------------------------------------------------
const PROSE_SOURCES: readonly { site: string; source: string }[] = [
  { site: 'TheCase.tsx :15 — the rationale', source: published.rationale },
  { site: 'Appeals.tsx :172 — whatIsNeeded', source: callLive.call[0]?.whatIsNeeded ?? '' },
  { site: 'Appeals.tsx :99 — authority', source: callLive.requests[0]?.authority ?? '' },
  { site: 'PrefaceFold.tsx :57 — the statement', source: publishedMarkdown.publicInterestStatement },
];

describe('researchers-markdown · the fixture carries the live shape', () => {
  it('EVERY prose fixture field states more than one paragraph — the floor, printed', () => {
    const measured = requireSubjects('prose fixture fields', PROSE_SOURCES).map(({ site, source }) => ({
      site,
      paragraphs: paragraphsIn(source),
      blankLineBreaks: (source.match(/\n[ \t]*\n/g) ?? []).length,
    }));
    expect(measured.every((one) => one.paragraphs > 1 && one.blankLineBreaks >= 1)).toEqual(true);
    expect(measured.length).toEqual(4);
  });
});

describe('researchers-markdown · the researcher’s voice renders their Markdown', () => {
  it('EVERY prose block of the thesis page renders BLOCKS, not one run-on text node', async () => {
    const container = await renderThesis(published);
    const blocks = proseBlocks(container, 'the thesis page’s researcher-prose blocks');
    const measured = blocks.map((element) => ({
      holds: element.querySelectorAll(BLOCKS).length,
      // A prose field that never went through the renderer has its whole string as ONE direct text node.
      rawTextChildren: [...element.childNodes].filter((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '').length,
    }));
    expect(measured.every((one) => one.holds >= 1 && one.rawTextChildren === 0)).toEqual(true);
  });

  it('EVERY prose block of the CALL page renders BLOCKS — the six appeal fields and the intake line', async () => {
    const container = await renderCall();
    const blocks = proseBlocks(container, 'the call page’s researcher-prose blocks');
    const measured = blocks.map((element) => ({
      holds: element.querySelectorAll(BLOCKS).length,
      rawTextChildren: [...element.childNodes].filter((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '').length,
    }));
    expect(measured.every((one) => one.holds >= 1 && one.rawTextChildren === 0)).toEqual(true);
  });

  it('the RATIONALE renders one <p> per paragraph the researcher wrote, and its emphasis becomes <strong>/<em>', async () => {
    const container = await renderThesis(published);
    const rationale = proseBlocks(container, 'the thesis page’s researcher-prose blocks').find(
      (element) => (element.textContent ?? '').includes(published.rationale.slice(0, 24)),
    );
    if (rationale === undefined) throw new Error('the page rendered no block carrying the rationale');
    expect({
      paragraphs: rationale.querySelectorAll('p').length,
      strong: rationale.querySelectorAll('strong').length,
      em: rationale.querySelectorAll('em').length,
    }).toEqual({ paragraphs: paragraphsIn(published.rationale), strong: 1, em: 1 });
  });

  it('an APPEAL FIELD renders its paragraphs — the field is a block, and its label stays beside it', async () => {
    // ON THE CALL PAGE, because region 4 is GONE from the read (R56; §10 :1122–:1123) and the appeals live
    // there alone. Reading this on the thesis page would assert a region's absence, which is another clause.
    const container = await renderCall();
    const needed = callLive.call[0]?.whatIsNeeded ?? '';
    const field = [...container.querySelectorAll<HTMLElement>('.appeal-field')].find((one) =>
      (one.textContent ?? '').includes(needed.slice(0, 20)),
    );
    if (field === undefined) throw new Error('the call page rendered no field carrying whatIsNeeded');
    expect({
      paragraphs: field.querySelectorAll('p').length,
      labelled: field.querySelector('.appeal-field-label') !== null,
    }).toEqual({ paragraphs: paragraphsIn(needed), labelled: true });
  });
});

describe('researchers-markdown · a citation token in a prose field', () => {
  it('a token in the RATIONALE reaches the reader as NEITHER a chip NOR its `0x…` name', async () => {
    // THE RULING THIS HOLDS, which until now was documented in `ResearcherProse` and asserted NOWHERE —
    // *"a ruling with no case is a surprise waiting"* was this round's own phrase for exactly that.
    //
    // §17 :538 gives chips to THE TEXT, which resolves a token against the body's mentions. The nine prose
    // fields carry no resolved citations, so a token there could only reach a reader as its own `0x…`
    // name — an id shown as text, which §4 :167 forbids outright. `ResearcherProse` therefore renders it
    // as NOTHING, on the precedent of `ThesisText.tsx` :38–:40's `#doc_` branch and for the same reason.
    //
    // THE TOKEN PLANTED IS A RESOLVABLE ONE — `citations[0]`'s own name — so the case proves the renderer
    // declines to chip a token it COULD have chipped, rather than proving it cannot resolve one.
    const token = `#ev_${published.citations[0]?.name ?? ''}`;
    // THE FLOOR, and it is what makes this case worth running: a fixture with no token in a prose field
    // satisfies "no id is rendered" trivially. The subject is asserted to EXIST before its rendering is.
    requireSubjects('prose fields carrying a citation token', [published.rationale].filter((field) => field.includes(token)));

    const container = await renderThesis(published);
    const rationale = proseBlocks(container, 'the thesis page’s researcher-prose blocks').find(
      (element) => (element.textContent ?? '').includes(published.rationale.slice(0, 24)),
    );
    if (rationale === undefined) throw new Error('the page rendered no block carrying the rationale');
    const name = published.citations[0]?.name ?? '';
    expect({
      chips: rationale.querySelectorAll('[data-chip]').length,
      nameAsText: (rationale.textContent ?? '').includes(name),
      tokenAsText: (rationale.textContent ?? '').includes(token),
      // The sentence around it is untouched: the token goes, the researcher's words stay.
      paragraphs: rationale.querySelectorAll('p').length,
    }).toEqual({ chips: 0, nameAsText: false, tokenAsText: false, paragraphs: paragraphsIn(published.rationale) });
  });
});

describe('researchers-markdown · THE ARCHIVE IS NEVER PARSED (§16 :521)', () => {
  it("a captured record's text keeps its Markdown characters AS CHARACTERS and becomes no blocks", async () => {
    const container = await renderThesis(published, true);
    const records = [...container.querySelectorAll<HTMLElement>('[data-record] .record-captured')];
    const measured = requireSubjects('captured record texts', records).map((element) => ({
      // The archive's bytes arrive as ONE text node: not parsed, not re-shaped, not emphasised.
      blocks: element.querySelectorAll(BLOCKS).length,
      strong: element.querySelectorAll('strong').length,
      rawTextChildren: [...element.childNodes].filter((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '').length,
    }));
    expect(measured.every((one) => one.blocks === 0 && one.strong === 0 && one.rawTextChildren >= 1)).toEqual(true);
  });
});

describe('researchers-markdown · THE ARCHIVE IS NOT THE RESEARCHER’S VOICE (§16 :521)', () => {
  it('a captured record carries NO `data-researcher-words` — the voice marker is not worn by the ministry’s text', async () => {
    // RULED 2026-09-18 (the researcher), and until this case it was held by a comment. `[data-researcher-words]`
    // MEANS "the researcher wrote this": §16 :517–:521's two voices, and the selector that applies their serif.
    // `RecordPane` wore it on a corpus record's captured text, a diff chunk and a trajectory's claim text — the
    // ARCHIVE'S BYTES, which §16 :521 says are never the researcher's. The face is unchanged and now DECLARED on
    // `.record-captured` itself, so what a reader sees is a stated decision rather than an inherited accident.
    const container = await renderThesis(published, true);
    const captured = requireSubjects(
      'captured record blocks',
      [...container.querySelectorAll<HTMLElement>('[data-record] .record-captured')],
    );
    expect({
      archiveBlocks: captured.length,
      wearingTheVoiceMarker: container.querySelectorAll('[data-record] [data-researcher-words]').length,
      // The block itself is untouched otherwise: the class that carries board 3A's nine properties stays.
      keepsItsClass: captured.every((element) => element.classList.contains('record-captured')),
    }).toEqual({ archiveBlocks: captured.length, wearingTheVoiceMarker: 0, keepsItsClass: true });
  });
});

describe('researchers-markdown · the folded preface', () => {
  it('the TRIGGER holds the rendered blocks and NO INTERACTIVE DESCENDANT — an autolink renders as its own text', async () => {
    const container = await renderThesis(publishedMarkdown);
    const trigger = container.querySelector<HTMLElement>('.preface-trigger');
    if (trigger === null) throw new Error('the page rendered no preface trigger');
    expect({
      blocks: trigger.querySelectorAll(BLOCKS).length >= 1,
      // A `<button>` may hold no interactive descendant: two elements claiming one click is broken however
      // it parses. `<https://…>` is a CommonMark AUTOLINK the researcher wrote, so it arrives as a link
      // token — and inside the trigger it must reach the reader as the text it is (§16 :521).
      interactive: trigger.querySelectorAll('a, button, input, select, textarea').length,
      // The autolink's own characters are still on the page: nothing was dropped to satisfy the line above.
      keepsTheUrl: (trigger.textContent ?? '').includes('https://'),
    }).toEqual({ blocks: true, interactive: 0, keepsTheUrl: true });
  });

  it('the CLAMP is a multi-line paragraph, not one ellipsised line — the VALUE, not the property name', () => {
    // THE VALUE, NOT THE PROPERTY NAME (R59 · chunk 3's correction of `built-as-drawn`): a case that held
    // only "a clamp is declared" is satisfied by `white-space: nowrap`, which is the very thing the
    // researcher ruled out — „when collapsed I prefer block, that they see a short paragraph and not
    // inline of one line only" (2026-09-18; §16 :521, "a short clamped PARAGRAPH and not one ellipsised
    // line"). The line count is DECLARED here rather than drawn from a board: the canvas fixes no clamp
    // for the prefold — `build2.mjs` :21 draws the one ellipsised line this ruling supersedes — and its
    // only clamp precedent, `.claimq` at `build3.mjs` :27, is 2 lines on a different element.
    const declared = declarationsOf('.preface-clamped');
    requireSubjects('declarations of .preface-clamped', [...declared.keys()]);
    expect({
      display: declared.get('display'),
      lineClamp: declared.get('-webkit-line-clamp'),
      boxOrient: declared.get('-webkit-box-orient'),
      overflow: declared.get('overflow'),
      // The one-line spelling is GONE, both halves of it: either left behind would re-impose the line.
      whiteSpace: declared.get('white-space'),
      textOverflow: declared.get('text-overflow'),
    }).toEqual({
      display: '-webkit-box',
      lineClamp: '3',
      boxOrient: 'vertical',
      overflow: 'hidden',
      whiteSpace: undefined,
      textOverflow: undefined,
    });
  });
});

describe('researchers-markdown · the intake marker', () => {
  it('`data-intake` marks the BLOCK CONTAINER, so the blocks are not nested inside a <span>', async () => {
    const container = await renderCall();
    const marked = [...container.querySelectorAll<HTMLElement>('[data-intake]')];
    expect(marked).toHaveLength(1);
    const line = marked[0];
    if (line === undefined) throw new Error('the call page rendered no intake line');
    expect({
      tag: line.tagName.toLowerCase(),
      insideASpan: line.closest('span') !== null,
      text: (line.textContent ?? '').trim(),
    }).toEqual({ tag: 'div', insideASpan: false, text: callLive.intake });
  });
});

describe('researchers-markdown · THE PARAGRAPHS ARE SEPARATED, not merely present', () => {
  // THE DEFECT THIS EXISTS TO STOP WAS GREEN UNDER EVERY OTHER CASE IN THIS FILE, and the researcher
  // found it on a phone against the deployed page: the rationale rendered FOUR `<p>` elements with a
  // gap of ZERO between them and reached the reader as one run-on block. Every case above counts
  // blocks; counting blocks is the PARSER's question, and separation is CSS's.
  //
  // WHY THERE IS NOTHING TO SEPARATE THEM BY DEFAULT, measured rather than assumed: a `<p>` inside a
  // bare iframe computes a 16px margin top and bottom, and inside this app it computes 0 — the reset
  // takes the browser's own spacing away. So rendered Markdown has NO separation unless a rule gives
  // it some, and that rule had been written as a utility at ONE call site (`ThesisText`'s
  // `space-y-3`), which the nine prose fields never passed through.
  //
  // IT IS A SOURCE SCAN AND NOT A RENDER ONE, deliberately: jsdom computes no cascade, so a rendered
  // gap is 0 there whether the rule exists or not. What can be held here is that the rule EXISTS with
  // a non-zero value, and that every prose block actually carries the class that invokes it. The
  // pixel itself is held by the browser reading in the step's dated doc — the seam §6 names.
  it('`.md-prose > * + *` declares a NON-ZERO margin — the value, not the property name', () => {
    const declared = declarationsOf('.md-prose > * + *');
    requireSubjects('declarations of `.md-prose > * + *`', [...declared.keys()]);
    const margin = declared.get('margin-top');
    expect({
      declaresMarginTop: margin !== undefined,
      // A rule that declares `0` would satisfy "the rule exists" and change nothing a reader sees.
      isNonZero: margin !== undefined && !/^0(?:[a-z%]*)?$/.test(margin.trim()),
      value: margin,
    }).toEqual({ declaresMarginTop: true, isNonZero: true, value: margin });
  });

  it('EVERY prose block of both pages carries `md-prose`, so the rule reaches all of them', async () => {
    const thesis = proseBlocks(await renderThesis(published), 'the thesis page’s prose blocks');
    const call = proseBlocks(await renderCall(), 'the call page’s prose blocks');
    const without = [...thesis, ...call].filter((element) => !element.classList.contains('md-prose'));
    expect({ prose: thesis.length + call.length, missingTheRule: without.map((e) => e.className) }).toEqual({
      prose: thesis.length + call.length,
      missingTheRule: [],
    });
  });

  it('the ARCHIVE does NOT carry it — the rule is the prose’s, and the archive is not prose', async () => {
    const container = await renderThesis(published, true);
    const captured = requireSubjects(
      'captured record blocks',
      [...container.querySelectorAll<HTMLElement>('[data-record] .record-captured')],
    );
    expect(captured.map((element) => element.classList.contains('md-prose'))).toEqual(captured.map(() => false));
  });
});
