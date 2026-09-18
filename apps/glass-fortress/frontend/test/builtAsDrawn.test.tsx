jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { FRONTEND, requireSubjects } from './scan';
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

/**
 * The PROPERTIES one CSS rule declares, by selector, from `globals.css`.
 *
 * COMMENTS ARE STRIPPED BEFORE THE DECLARATIONS ARE SPLIT, and that is not tidiness: a rule in this file
 * carries its reasoning inside itself, and a parser that split the raw text on `;` would read a sentence
 * as a declaration and a declaration as part of a sentence. Measured while writing this: it reported
 * `white-space` missing and "collapsing them would edit the" present, on a rule that declares the first
 * and not the second.
 */
function declarationsOf(selector: string): string[] {
  const css = readFileSync(join(FRONTEND, 'src/app/globals.css'), 'utf8');
  const at = css.indexOf(`${selector} {`);
  if (at === -1) throw new Error(`globals.css declares no \`${selector}\` rule at all — which is F1 itself`);
  const close = css.indexOf('}', at);
  if (close === -1) throw new Error(`globals.css's \`${selector}\` rule is not closed`);
  return css
    .slice(at + selector.length + 2, close)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((line) => line.split(':')[0]?.trim() ?? '')
    .filter((property) => property !== '');
}

describe('built-as-drawn', () => {
  it('F1 · `.record-captured` HAS a rule and it CLAMPS — board 3A draws `.captured` at max-height 420, overflow hidden', () => {
    // A SOURCE SCAN AND NOT A COMPUTED STYLE, deliberately (see the docblock): jsdom loads no stylesheet, so
    // the only honest thing a case here can hold is that the rule EXISTS and carries the properties the board
    // fixes. That it actually clips is the browser's reading, in the step's dated doc.
    //
    // THE CLAMP IS THE WHOLE POINT. `theses.sheet.andMore` („…ועוד {count}") is the COMPARISON REGISTER's
    // overflow catch, per the approved copy freeze — board 3A resolves a CAPTURE's length with
    // `max-height` + `overflow: hidden` and no counted tail. This case holds the board's answer, not a
    // second one invented here.
    const declared = requireSubjects('declarations of .record-captured', declarationsOf('.record-captured'));
    console.log(`built-as-drawn: .record-captured declares ${String(declared.length)} properties — ${declared.join(', ')}`);
    expect({
      clamps: declared.includes('max-height') && declared.includes('overflow'),
      readable: declared.includes('font-size') && declared.includes('line-height'),
      boxed: declared.includes('padding') && declared.includes('background') && declared.includes('border'),
      keepsTheLineBreaks: declared.includes('white-space'),
    }).toEqual({ clamps: true, readable: true, boxed: true, keepsTheLineBreaks: true });
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
