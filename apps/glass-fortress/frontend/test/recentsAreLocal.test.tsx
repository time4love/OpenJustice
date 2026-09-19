jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { join, relative } from 'node:path';
import { renderWithIntl, setAuthState, setPathname, textNodes } from './render';
import { readFileSync } from 'node:fs';
import { FRONTEND, ID_SHAPES, SRC, importsOf, requireSubjects, sourceFiles, stringsIn } from './scan';
import threeKinds from './fixtures/shell/recents-three-kinds.json';
import empty from './fixtures/shell/recents-empty.json';

// ---------------------------------------------------------------------------
// recents-are-local — docs/gf-ui-refactor-plan.md §9 :1084–:1085, :1097–:1099;
// docs/gf-ui-flows.md §8 :329–:343 (one read per page; a filter is a query, never a second read),
// §39 :916–:927 (a per-viewer convenience is the browser's, and no page records that it was viewed),
// §4 :167–:178 (no hash and no id is shown as text).
//
// NO READ, NO WRITE. The shell issues no request at all: the list of what this browser has opened lives in
// `localStorage` under ONE key, and `lib/recents.ts` imports NOTHING — a pure module never gains a dependency
// (the researcher, 2026-09-11). That is what makes "the sidebar costs no query" a property of one module
// rather than a habit of its callers.
//
// AND NEVER AN ID. The LABEL is STORED, never derived from the href, so the sidebar renders text it was given:
// a thesis by its claim's first words, a page by its domain and path, a record by „צילום · <date>”. If the
// label were computed at render, every caller would have to be trusted separately.
//
// WHAT THIS STEP DOES NOT DELIVER, and the case that says so: NOTHING in `src/` writes the list at UI-4b. The
// pages that would write it are KEEP this round (§9 :1092–:1094), so on a live route both categories are
// EMPTY and UI-5's re-brief lands the writer. The fixture is the only exercise, deliberately.
// ---------------------------------------------------------------------------

const SHELL_DIR = join(SRC, 'components', 'shell');
const RECENTS = 'src/lib/recents.ts';

const recentsModule = () => import('../src/lib/recents');
const sidebarModule = () => import('../src/components/shell/Sidebar');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/about');
  window.localStorage.clear();
});
afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
  window.localStorage.clear();
});

async function renderSidebarWith(entries: unknown): Promise<HTMLElement> {
  const { RECENTS_KEY } = await recentsModule();
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(entries));
  const { Sidebar } = await sidebarModule();
  return renderWithIntl(<Sidebar />).container;
}

describe('recents-are-local', () => {
  it('lib/recents.ts imports NOTHING — a pure module never gains a dependency', () => {
    expect(importsOf(join(FRONTEND, RECENTS))).toEqual([]);
  });

  it('nothing under components/shell or lib/recents.ts fetches, or names a route', () => {
    const subjects = [...sourceFiles(SHELL_DIR, ['.ts', '.tsx']), join(FRONTEND, RECENTS)];
    const offenders = requireSubjects('the shell and lib/recents.ts', subjects).flatMap((file) => {
      const named = stringsIn(file)
        .filter((found) => found.text.startsWith('/api/'))
        .map((found) => `${relative(FRONTEND, file)}:${String(found.line)} names ${found.text}`);
      const fetches = importsOf(file)
        .filter((found) => found.module === 'src/lib/api.ts')
        .map(() => `${relative(FRONTEND, file)} imports lib/api.ts`);
      return [...named, ...fetches];
    });
    expect(offenders).toEqual([]);
  });

  it('the list lives under ONE key, and a malformed value answers an EMPTY list rather than throwing', async () => {
    const { RECENTS_KEY, readRecents } = await recentsModule();
    window.localStorage.setItem(RECENTS_KEY, 'not json at all');
    expect(readRecents()).toEqual([]);
    window.localStorage.setItem(RECENTS_KEY, '{"not":"an array"}');
    expect(readRecents()).toEqual([]);
    expect(window.localStorage.length).toBe(1);
  });

  it('entries come back NEWEST WATCHED FIRST, and a second visit moves one up rather than duplicating it', async () => {
    const { noteRecent, readRecents } = await recentsModule();
    noteRecent({ kind: 'thesis', href: '/theses/a', label: 'the first claim', at: 1 });
    noteRecent({ kind: 'page', href: '/corpus?page=b', label: 'corona.health.gov.il/x/', at: 2 });
    noteRecent({ kind: 'thesis', href: '/theses/a', label: 'the first claim', at: 3 });
    expect(readRecents().map((entry) => [entry.href, entry.at])).toEqual([
      ['/theses/a', 3],
      ['/corpus?page=b', 2],
    ]);
  });

  it('the list is capped PER KIND, so one busy kind cannot push another out', async () => {
    const { noteRecent, readRecents, RECENTS_PER_KIND } = await recentsModule();
    for (let n = 0; n <= RECENTS_PER_KIND + 2; n++) {
      noteRecent({ kind: 'page', href: `/corpus?page=${String(n)}`, label: `example.gov.il/${String(n)}/`, at: n });
    }
    noteRecent({ kind: 'thesis', href: '/theses/kept', label: 'the claim that must survive', at: 0 });
    const kinds = readRecents().map((entry) => entry.kind);
    expect({
      pages: kinds.filter((kind) => kind === 'page').length,
      theses: kinds.filter((kind) => kind === 'thesis').length,
    }).toEqual({ pages: RECENTS_PER_KIND, theses: 1 });
  });

  it('the sidebar renders the three kinds as a person recognises them — the claim, the domain and path, „צילום · <date>”', async () => {
    const container = await renderSidebarWith(threeKinds);
    const text = textNodes(container).map((node) => node.data.trim());
    expect({
      thesis: text.some((line) => line.startsWith('בין הצילום מ-28.6.2022')),
      page: text.includes('corona.health.gov.il/vaccine-for-covid/'),
      record: text.includes('צילום · 5.8.2022'),
    }).toEqual({ thesis: true, page: true, record: true });
  });

  it('NO id is a text node in the sidebar: no 64-hex, no cuid, no 14-digit stamp, though the fixture\'s hrefs carry all three', async () => {
    const container = await renderSidebarWith(threeKinds);
    const offenders = textNodes(container)
      .filter((node) => ID_SHAPES.some((shape) => shape.pattern.test(node.data)))
      .map((node) => node.data.trim().slice(0, 48));
    expect(offenders).toEqual([]);
  });

  it('an EMPTY list renders both categories and no item — the state every live route is in at this step', async () => {
    const container = await renderSidebarWith(empty);
    const text = textNodes(container).map((node) => node.data.trim());
    expect({
      theses: text.includes('תזות'),
      archive: text.includes('הארכיון'),
      items: container.querySelectorAll('[data-recent-kind]').length,
    }).toEqual({ theses: true, archive: true, items: 0 });
  });

  it('ONE WRITER MODULE AND ONE READER, and the three public pages are what render the writer', () => {
    // INVERTED AT UI-5 (§9 :1084–:1085). At UI-4b `lib/recents.ts` shipped a READER AND NO CALLER and
    // this case said exactly that; the re-brief lands the writer, so the same property is stated the
    // other way round.
    //
    // MY STEP-1 SPELLING OF THIS CASE WAS ARCHITECTURALLY WRONG AND THE CODE IS WHAT CORRECTED IT: it
    // asserted that each of the three PAGES imports `lib/recents` and calls `noteRecent`. The three
    // public pages are SERVER components and `localStorage` is the browser's, so a page cannot write
    // the list during its own render. The write is a CLIENT COMPONENT the page renders — the shape
    // `<DeclareTabs>` already uses to take a declaration from a server page. The property is unchanged;
    // where it is satisfied is not.
    //
    // THE LIST IS EXACT IN BOTH DIRECTIONS. An importer missing from it is a writer nobody declared; a
    // page missing from the renderers is a category that silently stays empty.
    const WRITER = 'src/components/thesis/NoteRecent.tsx';
    const READER = 'src/components/shell/Sidebar.tsx';
    const PAGES = [
      'src/app/[locale]/theses/[id]/page.tsx',
      'src/app/[locale]/theses/[id]/versions/[v]/page.tsx',
      'src/app/[locale]/call/[thesisId]/page.tsx',
    ];
    const importers = requireSubjects('source files under src/', sourceFiles(SRC, ['.ts', '.tsx']))
      .map((file) => relative(FRONTEND, file))
      .filter((file) => file !== RECENTS)
      .filter((file) => importsOf(join(FRONTEND, file)).some((found) => found.module === RECENTS))
      .sort();
    const renderers = PAGES.filter((page) => readFileSync(join(FRONTEND, page), 'utf8').includes('<NoteRecent'));
    expect({ importers, renderers }).toEqual({ importers: [WRITER, READER].sort(), renderers: PAGES });
  });

  it('the THESIS kind is the one UI-5 writes — `page` and `record` wait for the pages that render them', () => {
    // Stated rather than left to be noticed. `lib/recents.ts` holds three kinds; UI-5 lands the pages
    // that render a THESIS, and `/pages/[id]/captures/[capture]` and `/records/[hash]` are UI-7's
    // (A1 :972–:979). So two of the sidebar's three categories stay empty on a live route after this
    // step, exactly as both stayed empty after UI-4b — and this case is what says so out loud.
    const written = [...new Set(
      ['src/components/thesis/NoteRecent.tsx', ...[
        'src/app/[locale]/theses/[id]/page.tsx',
        'src/app/[locale]/theses/[id]/versions/[v]/page.tsx',
        'src/app/[locale]/call/[thesisId]/page.tsx',
      ]].flatMap((file) => [...readFileSync(join(FRONTEND, file), 'utf8').matchAll(/kind="(thesis|page|record)"/g)].map((m) => m[1])),
    )];
    expect(written).toEqual(['thesis']);
  });
});
