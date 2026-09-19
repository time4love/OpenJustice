jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

// THE PARTIAL MOCK, in `render.tsx`'s own documented shape: the REAL module spread, ONE function replaced.
// `RecordSheetTab` therefore still declares real tabs and every other behaviour of the module is untouched;
// only `useOpenRecord` is observed. A case that forgets to arm the spy reads an empty log and fails on the
// floor below rather than inheriting the last case's.
jest.mock('../src/components/corpus/RecordSheet', () => {
  const real = jest.requireActual<typeof import('../src/components/corpus/RecordSheet')>('../src/components/corpus/RecordSheet');
  return { ...real, useOpenRecord: () => (entry: unknown) => opened.push(entry) };
});

import { renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import { requireSubjects } from './scan';
import { readCorpusFilters, toReadParameters, writeReadQuery } from '../src/lib/corpusQuery';
import { recordIdOf } from '../src/components/corpus/RecordSheet';
import { corpusStream } from './fixtures/corpus/stream';
import type { CorpusEntry } from '../src/types/corpus';

// ---------------------------------------------------------------------------
// row-tap-opens-its-own-record — docs/gf-ui-flows.md §24 region 4 ("a row tap opens THE RECORD"), §26.
//
// THE REGION A DECOY FOUND, AND THE HARNESS ALREADY HAD THE REMEDY. Making every row open the FIRST record
// reddened NOTHING at 307 / 307: the row's `data-open-record` attribute was right, and the HANDLER'S ARGUMENT
// — the thing that decides which record actually opens — was held by no case at all. The two are computed
// from the same `entry` today and nothing said they must be.
//
// WHY THE ATTRIBUTE WAS NOT ENOUGH, stated because it is the lesson rather than the fix: an attribute is what
// the row SAYS and the argument is what the tap DOES, and a case that reads only the first passes a component
// that labels every row correctly and opens the wrong one. The previous report called this a seam that no
// case in this harness could close. That was wrong: `test/render.tsx` mounts `TabsProvider` for every
// `renderPage`, and `useOpenRecord` is a module boundary, so the argument is observable by spying on it — no
// harness change and no pane rendered. The seam was in the reading, not in the harness.
// ---------------------------------------------------------------------------

const opened: unknown[] = [];
const LOCALE: Locale = 'he';

beforeEach(() => {
  opened.length = 0;
  setAuthState('anonymous');
  setPathname('/he/corpus');
});
afterEach(() => {
  setPublicBodies(undefined);
  setAuthState(undefined);
  setPathname(undefined);
});

function containerOf(rendered: PageRender): HTMLElement {
  if (rendered.notFound) throw new Error('/corpus answered the one 404, not a body');
  return rendered.container;
}

async function renderStream(searchParams: Record<string, string>): Promise<HTMLElement> {
  const wire = writeReadQuery(toReadParameters(readCorpusFilters(new URLSearchParams(searchParams)), 'public')).toString();
  setPublicBodies({ [`/api/corpus${wire === '' ? '' : `?${wire}`}`]: { status: 200, body: corpusStream } });
  return containerOf(await renderPage((await import('../src/app/[locale]/corpus/page')).default, { locale: LOCALE }, { locale: LOCALE, searchParams }));
}

describe('row-tap-opens-its-own-record', () => {
  it('EACH ROW HANDS ITS OWN ENTRY TO `useOpenRecord` — not the first, and not a neighbour', async () => {
    const container = await renderStream({ page: 'page-one' });
    const taps = requireSubjects('row taps', [...container.querySelectorAll('[data-open-record]')]);
    for (const tap of taps) (tap as HTMLButtonElement).click();
    const got = requireSubjects('records opened', opened) as CorpusEntry[];
    expect({
      // One tap, one record, in the order the rows are drawn.
      openedCount: got.length,
      tapCount: taps.length,
      // THE ASSERTION: what the handler RECEIVED is the record its own row NAMES. A component that opened the
      // first record from every row has the right attributes and the wrong arguments, and this is the arm
      // that separates them.
      matchesItsOwnRow: got.map(recordIdOf),
      attributes: taps.map((tap) => tap.getAttribute('data-open-record') ?? ''),
      // TWO-SIDED, so "they are all equal" cannot be satisfied by all-the-same: the set is as large as the rows.
      distinct: new Set(got.map(recordIdOf)).size,
    }).toEqual({
      openedCount: 5,
      tapCount: 5,
      matchesItsOwnRow: taps.map((tap) => tap.getAttribute('data-open-record') ?? ''),
      attributes: taps.map((tap) => tap.getAttribute('data-open-record') ?? ''),
      distinct: 5,
    });
  });

  it('BOTH ROW WEIGHTS OPEN THEIR OWN — a capture and a diff, because the two are separate components', async () => {
    const container = await renderStream({ page: 'page-one' });
    const capture = container.querySelector('[data-capture-row] [data-open-record]');
    const diff = container.querySelector('[data-diff-card] [data-open-record]');
    (capture as HTMLButtonElement).click();
    (diff as HTMLButtonElement).click();
    const got = requireSubjects('records opened', opened) as CorpusEntry[];
    expect({
      kinds: got.map((entry) => entry.kind),
      ids: got.map(recordIdOf),
      expected: [capture?.getAttribute('data-open-record'), diff?.getAttribute('data-open-record')],
    }).toEqual({
      kinds: ['CAPTURE', 'DIFF'],
      ids: [capture?.getAttribute('data-open-record'), diff?.getAttribute('data-open-record')],
      expected: [capture?.getAttribute('data-open-record'), diff?.getAttribute('data-open-record')],
    });
  });
});
