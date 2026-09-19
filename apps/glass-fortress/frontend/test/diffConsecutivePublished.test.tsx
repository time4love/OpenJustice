jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { fireEvent, screen } from '@testing-library/react';
import { apiCallsMade, renderPage, setAuthState, setPathname, setPublicBodies, type Locale, type PageRender } from './render';
import expected from './fixtures/thesis/text-diff-expected.json';
import published from './fixtures/thesis/published.json';
import republished from './fixtures/thesis/republished.json';
import versionPrevious from './fixtures/thesis/version-previous.json';

// ---------------------------------------------------------------------------
// diff-consecutive-published — docs/gf-ui-flows.md §17 :553–:555, §18 :583–:586, §23 :646–:647; thesis T6 :898–:901,
// A5 :1570; UI plan :390, :910. With the HISTORY's own properties (newest first, the withdrawal between the versions
// it separates, the author's handle per row) and the VERSION PAGE's chips (the researcher's ruling M4, 2026-09-16).
// ---------------------------------------------------------------------------

const LOCALE: Locale = 'he';
const thesisPage = () => import('../src/app/[locale]/theses/[id]/page');
const versionPage = () => import('../src/app/[locale]/theses/[id]/versions/[v]/page');

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

async function renderThesis(body: unknown): Promise<HTMLElement> {
  const id = (body as { thesisId: string }).thesisId;
  setPublicBodies({
    [`/api/thesis/${id}`]: { status: 200, body },
    [`/api/thesis/${id}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
  });
  const page = (await thesisPage()).default;
  return containerOf(await renderPage(page, { locale: LOCALE, id }, { locale: LOCALE }));
}

const rows = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll('[data-history-row]')] as HTMLElement[];
const rowKinds = (container: HTMLElement): string[] => rows(container).map((row) => row.dataset.historyRow ?? '');

async function openTheDiff(container: HTMLElement): Promise<HTMLElement> {
  const control = [...container.querySelectorAll('[data-what-changed]')][0];
  if (control === undefined) throw new Error('no "what changed" control between the two published versions');
  fireEvent.click(control);
  return (await screen.findByTestId('version-diff')) as HTMLElement;
}

describe('diff-consecutive-published', () => {
  it("the history's diff for two consecutive published versions equals the expected runs", async () => {
    const diff = await openTheDiff(await renderThesis(published));
    const runs = [...diff.querySelectorAll('[data-run]')].map((run) => ({
      kind: (run as HTMLElement).dataset.run,
      text: run.textContent,
    }));
    expect(runs).toEqual(expected.runs);
  });

  it('every citation whose pin moved is listed beneath it, and no other', async () => {
    const diff = await openTheDiff(await renderThesis(published));
    const moved = [...diff.querySelectorAll('[data-moved-pin]')].map((row) => (row as HTMLElement).dataset.movedPin);
    expect(moved).toEqual(expected.movedPins.map((pin) => pin.name));
  });

  it('pressing "what changed" reads the older version once, and never re-reads the current one', async () => {
    const container = await renderThesis(published);
    const before = apiCallsMade().length;
    await openTheDiff(container);
    expect(apiCallsMade().slice(before).map((call) => call.path)).toEqual([
      `/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`,
    ]);
  });

  it('the history renders newest first (§17 :553; T6 :898)', async () => {
    const container = await renderThesis(published);
    const dates = rows(container).map((row) => row.dataset.publishedAt ?? '');
    expect(dates).toEqual([...dates].sort().reverse());
    expect(dates).toHaveLength(published.history.length);
  });

  it('a withdrawal sits between the versions it separates (§17 :555; T6 :917–:918)', async () => {
    const container = await renderThesis(republished);
    expect(rowKinds(container)).toEqual(['version', 'withdrawal', 'version']);
  });

  it('no "what changed" spans a withdrawn version (A5 :1570 — it answers the notice, never its text)', async () => {
    const container = await renderThesis(republished);
    expect([...container.querySelectorAll('[data-what-changed]')]).toHaveLength(0);
  });

  it("every history row shows the body's author handle (§17 :553–:554; thesis flows :1001)", async () => {
    const container = await renderThesis(published);
    const withHandle = rows(container).filter((row) => (row.textContent ?? '').includes(published.version.author));
    expect(withHandle).toHaveLength(published.history.length);
  });

  it('on a version page, a record the current version cites at ANOTHER pin is the re-pinned chip — its own label, no marks, never chip.unresolved', async () => {
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
    });
    const page = (await versionPage()).default;
    const container = containerOf(
      await renderPage(page, { locale: LOCALE, id: published.thesisId, v: versionPrevious.versionId }, { locale: LOCALE }),
    );
    const chip = container.querySelector(`[data-chip="${published.citations[1].name}"]`);
    expect(chip?.getAttribute('data-chip-kind')).toEqual('repinned');
    expect(chip?.querySelectorAll('[data-mark]')).toHaveLength(0);
    expect(container.textContent ?? '').not.toContain('ציטוט שלא נמצא');
  });

  it('on a version page, a record the current version does not cite is the not-current chip', async () => {
    setPublicBodies({
      [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
      [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
    });
    const page = (await versionPage()).default;
    const container = containerOf(
      await renderPage(page, { locale: LOCALE, id: published.thesisId, v: versionPrevious.versionId }, { locale: LOCALE }),
    );
    const chip = container.querySelector(`[data-chip="${versionPrevious.citations[0].name}"]`);
    expect(chip?.getAttribute('data-chip-kind')).toEqual('not-current');
  });
});
