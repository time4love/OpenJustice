jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { declarationsOf, requireSubjects } from './scan';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import published from './fixtures/thesis/published.json';

// ---------------------------------------------------------------------------
// built-as-drawn — WHERE THE BINDING IMAGE FIXES A STRUCTURE THE DOM CAN SEE, THE BUILD MATCHES IT.
//
// The design canvas is the binding image (docs/gf-ui-refactor-plan.md §6 as amended 2026-09-16: "every page
// step is designed and approved as an IMAGE before its code, and its exercise sets the built page beside the
// approved board"). A MOCKUP IS NOT THE PAGE — approving an image does not make the build match it, and the
// guard has been the staging exercise, read by a person, once per step.
//
// THE R59 EXERCISE FOUND THREE DIVERGENCES A CASE COULD HAVE HELD ALL ALONG
// (`handoffs/R59-staging-exercise-2026-09-17.md`, the researcher's items 3, 4 and 6):
//   F1 `.record-captured` had NO CSS RULE AT ALL — 4,465 characters at 13px with `max-height: none`, where
//      board 3A draws `.captured` clamped at 420px. The reader saw a wall.
//   F2 the COPY control was built as `BUTTON < SPAN < HEADER`, a SIBLING of the byline; board 3A draws
//      `.by > .copy`, INSIDE the byline row.
//   F3 the tick line's ticks were dead and the text's were live — the same pill, two behaviours.
//
// WHY ONE FILE. The three are one property read three ways: a structure the approved image fixes, that jsdom
// can see, and that no instrument was holding. Splitting them into three files would put the same citation
// and the same reason in three docblocks; grouping them says once what they have in common. Each case names
// its own board element and fails on its own.
//
// WHAT THIS FILE CANNOT HOLD, STATED SO IT IS NOT READ AS COVERING IT. jsdom has no layout engine and no
// stylesheet: it cannot see that `max-height` CLIPS, that a cursor renders as a pointer, or that anything
// scrolls. F1's case is therefore a SOURCE scan over `globals.css` — the rule exists and clamps — and not a
// computed style; the cursor and F4's scrolling are verified in a browser and recorded in the step's dated
// doc. A case that asserted either in jsdom would be "a property asserted only where it cannot fail".
// ---------------------------------------------------------------------------

const LOCALES: readonly Locale[] = ['he', 'en'];
const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');

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
  if (rendered.notFound) throw new Error('the thesis page answered the one 404, not a body');
  return rendered.container;
}

async function thesis(locale: Locale, withPane = false): Promise<HTMLElement> {
  setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: published } });
  const page = (await thesisPage()).default;
  return containerOf(
    await renderPage(page, { locale, id: published.thesisId }, {
      locale,
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


describe('built-as-drawn', () => {
  it('F1 · `.record-captured` is the board`s nine properties BY VALUE — clamped at 420px and SCROLLING inside it', () => {
    // A SOURCE SCAN AND NOT A COMPUTED STYLE, deliberately (see the docblock): jsdom loads no stylesheet, so
    // the only honest thing a case here can hold is what the rule DECLARES. That it clips and that a reader
    // can reach the rest are the browser's readings, in the step's dated doc.
    //
    // THE HEIGHT IS THE BOARD'S; THE SCROLL IS THE DESIGN'S (R59 · S-4, T3). Board 3A draws `.captured` with
    // `max-height: 420px; overflow: hidden`, and chunk 2 took both — citing the board over
    // `docs/gf-ui-flows.md` §18 :569, *"long content scrolls inside the sheet, the header stays."* A BOARD IS
    // A GROUND FOR LAYOUT AND NOTHING ELSE: the height is layout and the board governs it; SCROLLABILITY IS
    // BEHAVIOUR and §18 governs that. Measured on the deployed page, `overflow: hidden` left `clientHeight
    // 418` over `scrollHeight 4822` — 4,404px, 91% of the capture, behind a locked door. `overflow-y: auto`
    // satisfies both sentences at once.
    //
    // AND THE VALUES ARE ASSERTED, NOT THE PROPERTY NAMES. See the docblock on `declarationsOf`: the
    // name-only spelling this case used in chunk 2 was green over the very defect above.
    const declared = declarationsOf('.record-captured');
    requireSubjects('declarations of .record-captured', [...declared.keys()]);
    console.log(
      `built-as-drawn: .record-captured declares ${String(declared.size)} properties — ` +
        [...declared].map(([property, value]) => `${property}: ${value}`).join(' · '),
    );
    expect({
      // THE FACE IS THE NINTH, added 2026-09-18 with the ruling that moved it. Until this chunk the
      // captured text took its serif by INHERITANCE from `[data-researcher-words]` — the researcher's
      // voice marker, on the ministry's words. The marker is gone and the face is declared here; a decoy
      // that deleted the declaration reddened NOTHING, because this case named eight properties and not
      // this one. A face held by no case is the same shape as a property held by name and not by value.
      fontFamily: declared.get('font-family'),
      maxHeight: declared.get('max-height'),
      overflowY: declared.get('overflow-y'),
      fontSize: declared.get('font-size'),
      lineHeight: declared.get('line-height'),
      padding: declared.get('padding'),
      whiteSpace: declared.get('white-space'),
      background: declared.get('background'),
      borderRadius: declared.get('border-radius'),
    }).toEqual({
      fontFamily: 'var(--font-serif)',
      maxHeight: '420px',
      overflowY: 'auto',
      fontSize: 'var(--text-record)',
      lineHeight: 'var(--leading-record)',
      padding: '14px 16px',
      whiteSpace: 'pre-line',
      background: 'var(--paper)',
      borderRadius: 'var(--radius-md)',
    });
  });

  it("T2 · the RESEARCHER'S headings are the strongest thing in the read — board 2A draws `.words h2` at 18 / 700 / 1.4", () => {
    // THE HIERARCHY WAS INVERTED, measured on the deployed page: the researcher's `##` rendered at 17px/600,
    // the same size as the body it divides and separated from it by weight alone, while the PAGE's own three
    // region headings sat above them at 18px/600. The page's furniture was louder than the argument.
    //
    // T1 IS MOST OF THIS FIX: the three region headings become 14px fold triggers and leave the read
    // entirely. This case holds the other half — the researcher's own structure rising to the board's 18/700.
    const declared = declarationsOf('[data-thesis-text] h2');
    expect({
      fontSize: declared.get('font-size'),
      fontWeight: declared.get('font-weight'),
      lineHeight: declared.get('line-height'),
    }).toEqual({
      fontSize: 'var(--text-words-heading)',
      fontWeight: '700',
      lineHeight: 'var(--leading-words-heading)',
    });
  });

  it('T4 · the short disclaimer takes the board`s leading — `.disc` is 12 / 1.55, and `leading-relaxed` is 1.625', () => {
    // The one divergence the whole canvas comparison found. It is the same shape as R58's two local-run
    // defects — a LOCAL utility beating the REGION's token — and the same remedy: the region owns the
    // leading, so the element states the token rather than a number of its own.
    const declared = declarationsOf('.disclaimer');
    expect({
      fontSize: declared.get('font-size'),
      lineHeight: declared.get('line-height'),
    }).toEqual({ fontSize: 'var(--text-mark)', lineHeight: 'var(--leading-disclaimer)' });
  });

  it('T1 · FOUR folds in the read, every one CLOSED — §10 :1123, "the case, the history, the pages and VERIFY as folds, closed"', async () => {
    // THE ONE DOM CASE OF THIS ROUND. Measured on the deployed page: `detailsElementsInTheRead: 1` — only
    // VERIFY was a fold; the rationale, the versions and the pages were open `<h2>` sections, so a reader
    // met the whole page at once where §10 :1123 fixes four closed folds.
    //
    // THE FLOOR IS NOT OPTIONAL, and it is the reason the count is printed: a case asserting "every fold is
    // closed" is satisfied by a page with NO FOLD AT ALL — which is precisely the state this case exists to
    // reject, and precisely what the page did before this round.
    for (const locale of LOCALES) {
      const container = await thesis(locale);
      const read = container.querySelector('article.reading');
      if (read === null) throw new Error(`the thesis page (${locale}) rendered no <article class="reading">`);
      const folds = [...read.querySelectorAll('details')];
      if (locale === 'he') {
        console.log(
          `built-as-drawn: ${String(folds.length)} folds in the read — ` +
            folds.map((fold) => `"${(fold.querySelector('summary')?.textContent ?? '').trim()}" open=${String(fold.hasAttribute('open'))}`).join(' · '),
        );
      }
      expect({
        locale,
        folds: folds.length,
        open: folds.filter((fold) => fold.hasAttribute('open')).map((fold) => (fold.querySelector('summary')?.textContent ?? '').trim()),
      }).toEqual({ locale, folds: 4, open: [] });
    }
  });

  it('F2 · the COPY control sits INSIDE the byline row — board 3A draws `.by > .copy`, never a sibling of it', async () => {
    for (const locale of LOCALES) {
      const container = await thesis(locale);
      const copy = container.querySelector('[data-copy]');
      if (copy === null) throw new Error(`the thesis page (${locale}) rendered no COPY control at all`);
      // The BYLINE, by its own marker rather than by tag: `closest('p')` would be satisfied by any paragraph
      // the control were dropped into, which is the defect wearing a different parent.
      expect({ locale, insideTheByline: copy.closest('[data-byline]') !== null }).toEqual({
        locale,
        insideTheByline: true,
      });
    }
  });

  it('F3 · EVERY dated tick is inside a press control — the tick line and the text alike, one pill one behaviour', async () => {
    for (const locale of LOCALES) {
      const container = await thesis(locale, true);
      const ticks = [...container.querySelectorAll('[data-tick]')];
      const inLine = [...container.querySelectorAll('[data-tick-line] [data-tick]')];
      const inText = [...container.querySelectorAll('[data-thesis-text] [data-tick]')];
      // THE FLOOR, and it is TWO-SIDED because the defect was one-sided. A case asserting "every tick is a
      // control" is satisfied by a page with no tick in the line at all — which is how the tick line's three
      // dead pills survived every instrument. Both regions must be exercised, and the counts are printed.
      requireSubjects(`dated ticks on the thesis page (${locale})`, ticks);
      expect({ inLine: inLine.length > 0, inText: inText.length > 0 }).toEqual({ inLine: true, inText: true });
      if (locale === 'he') {
        console.log(
          `built-as-drawn: ${String(ticks.length)} dated ticks — ${String(inLine.length)} in the tick line, ` +
            `${String(inText.length)} in the text; every one must be inside a press control`,
        );
      }
      const dead = ticks
        .filter((tick) => tick.closest('button') === null)
        .map((tick) => `${locale}: ${(tick.textContent ?? '').trim().slice(0, 24)}`);
      expect(dead).toEqual([]);
    }
  });
});
