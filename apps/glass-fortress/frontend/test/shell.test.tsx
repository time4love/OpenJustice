jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { join, relative } from 'node:path';
import { fireEvent } from '@testing-library/react';
import { renderWithIntl, setAuthState, setPathname } from './render';
import { FRONTEND, SRC, importsOf, requireSubjects, sourceFiles } from './scan';
import { DeclareTabs, TabsProvider } from '@/components/shell/RightPane';

// ---------------------------------------------------------------------------
// shell-mounted-once and two-centres-by-url — docs/gf-ui-refactor-plan.md §9 :1058–:1061, :1071–:1072,
// :1103; docs/gf-ui-design-session-2026-09-16.md §1.1–§1.2.
//
// "The shell chooses NOTHING; the route's page IS the centre." Two centres exist and the URL decides which —
// never the identity. The instrument that makes that a measurement rather than a promise is a SOURCE scan:
// nothing under `components/shell` may read `AuthContext` except the sidebar, whose identity level is the
// nav's existing read and the one thing in the shell that is allowed to differ per reader.
//
// And the shell is mounted ONCE, by the locale layout: a page that mounted its own would be a second chrome,
// which is the defect UI-4 removed from fifteen pages and which this step must not reintroduce.
// ---------------------------------------------------------------------------

const SHELL_DIR = join(SRC, 'components', 'shell');
const LOCALE_LAYOUT = 'src/app/[locale]/layout.tsx';
const SIDEBAR = 'src/components/shell/Sidebar.tsx';
const AUTH = 'src/context/AuthContext.tsx';
const SHELL = 'src/components/shell/Shell.tsx';

const shellModule = () => import('../src/components/shell/Shell');
const twoTabsPage = () => import('./fixtures/shell/page-two-tabs');
const noTabsPage = () => import('./fixtures/shell/page-no-tabs');

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/about');
});
afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
  window.localStorage.clear();
});

function shellFiles(): string[] {
  return sourceFiles(SHELL_DIR, ['.ts', '.tsx']).map((file) => relative(FRONTEND, file));
}

describe('two-centres-by-url', () => {
  it('nothing under components/shell imports AuthContext EXCEPT the sidebar, whose level is the nav\'s existing read', () => {
    const readers = requireSubjects('source files under components/shell', shellFiles())
      .filter((file) => importsOf(join(FRONTEND, file)).some((found) => found.module === AUTH))
      .sort();
    expect(readers).toEqual([SIDEBAR]);
  });

  it('nothing under components/shell reads a route or issues a request — the shell is not a client of the API', () => {
    const offenders = requireSubjects('source files under components/shell', shellFiles()).flatMap((file) =>
      importsOf(join(FRONTEND, file))
        .filter((found) => found.module === 'src/lib/api.ts' || found.specifier === 'next/headers')
        .map((found) => `${file} imports ${found.specifier}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe('the right pane is only reachable inside the shell', () => {
  // S5-1. `usePaneTabs` THROWS outside `TabsProvider` on purpose (`RightPane.tsx` :53), so a page cannot
  // declare right-pane tabs into nothing. Until UI-5 nothing exercised it — and then UI-5 made it worse
  // rather than better: `test/render.tsx` now mounts the registry around every page render (D14,
  // correctly, because `app/[locale]/layout.tsx` mounts the shell once and Next never renders a page
  // bare), which removed the ONLY thing that had ever hit the throw — a 31-case cascade that was the
  // throw doing its job. After that, making the context optional would have broken nothing.
  //
  // THAT IS THE EXACT SHAPE THIS SUITE EXISTS TO CATCH: a guard whose absence no case would notice. So
  // the throw gets a case of its own, rendered deliberately OUTSIDE the provider.
  it('a tab-declaring subject rendered OUTSIDE the provider throws, naming the shell', () => {
    // Rendered bare, which is the one thing `renderPage` no longer does.
    expect(() => renderWithIntl(<DeclareTabs tabs={[{ id: 'x', label: 'x', content: null }]} />)).toThrow(
      'usePaneTabs: the right pane is only reachable inside the shell',
    );
  });

  it('and INSIDE the provider the same subject renders without throwing — the control', () => {
    expect(() =>
      renderWithIntl(
        <TabsProvider>
          <DeclareTabs tabs={[{ id: 'x', label: 'x', content: null }]} />
        </TabsProvider>,
      ),
    ).not.toThrow();
  });
});

describe('shell-mounted-once', () => {
  it('app/[locale]/layout.tsx imports the shell', () => {
    const mounted = importsOf(join(FRONTEND, LOCALE_LAYOUT)).map((found) => found.module);
    expect(mounted).toContain(SHELL);
  });

  it('no OTHER file under src/app imports the shell — a page that mounted its own chrome is the UI-4 defect returning', () => {
    const importers = requireSubjects('source files under src/app', sourceFiles(join(SRC, 'app'), ['.ts', '.tsx']))
      .filter((file) => relative(FRONTEND, file) !== LOCALE_LAYOUT)
      .filter((file) => importsOf(file).some((found) => found.module === SHELL))
      .map((file) => relative(FRONTEND, file));
    expect(importers).toEqual([]);
  });

  it('the shell renders exactly ONE sidebar and ONE centre, whatever the page inside it is', async () => {
    const { Shell } = await shellModule();
    const { default: Page } = await noTabsPage();
    const { container } = renderWithIntl(
      <Shell>
        <Page />
      </Shell>,
    );
    expect({
      sidebars: container.querySelectorAll('[data-shell-region="sidebar"]').length,
      centres: container.querySelectorAll('[data-shell-region="centre"]').length,
      navs: container.querySelectorAll('nav').length,
    }).toEqual({ sidebars: 1, centres: 1, navs: 1 });
  });

  it('a page declaring NO tab collapses the pane to NOTHING — no pane element and no splitter beside it', async () => {
    const { Shell } = await shellModule();
    const { default: Page } = await noTabsPage();
    const { container } = renderWithIntl(
      <Shell>
        <Page />
      </Shell>,
    );
    expect({
      panes: container.querySelectorAll('[data-shell-region="pane"]').length,
      paneSplitters: container.querySelectorAll('[data-shell-splitter="pane"]').length,
    }).toEqual({ panes: 0, paneSplitters: 0 });
  });

  it('a page declaring TWO tabs opens the pane with both, the first active, and a splitter beside it', async () => {
    const { Shell } = await shellModule();
    const { default: Page } = await twoTabsPage();
    const { container } = renderWithIntl(
      <Shell>
        <Page />
      </Shell>,
    );
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect({
      panes: container.querySelectorAll('[data-shell-region="pane"]').length,
      paneSplitters: container.querySelectorAll('[data-shell-splitter="pane"]').length,
      labels: tabs.map((tab) => (tab.textContent ?? '').trim()),
      selected: tabs.map((tab) => tab.getAttribute('aria-selected')),
    }).toEqual({
      panes: 1,
      paneSplitters: 1,
      labels: ['corona.health.gov.il · 5.8.2022', 'פניות לציבור'],
      selected: ['true', 'false'],
    });
  });

  it('COLLAPSED, the sidebar still renders the control that expands it, as a DIRECT child, and drops the nav', async () => {
    // THE DEFECT THIS EXISTS FOR, found in the local run and not by any case: collapsing the sidebar to zero
    // width left the 44 px expand control inside a 24 px box, so `elementFromPoint` at the control's own
    // centre returned the page behind it — the shell could be collapsed and never re-opened. jsdom has no
    // layout and cannot measure that. What it CAN hold is the structure the clipping came from: when the rail
    // is collapsed the control must be the rail's own child rather than a thing positioned over a region that
    // is no longer there, and the nav must be gone with the rest of the sidebar.
    const { SHELL_KEYS } = await import('../src/components/shell/localState');
    window.localStorage.setItem(SHELL_KEYS.sidebarCollapsed, 'true');
    const { Shell } = await shellModule();
    const { default: Page } = await noTabsPage();
    const { container } = renderWithIntl(
      <Shell>
        <Page />
      </Shell>,
    );
    const rail = container.querySelector('[data-shell-region="sidebar"]');
    const control = container.querySelector('[data-shell-collapse-control]');
    expect({
      collapsed: rail?.getAttribute('data-shell-collapsed'),
      controlIsADirectChild: control?.parentElement === rail,
      controlName: control?.getAttribute('aria-label'),
      navs: container.querySelectorAll('nav').length,
      sidebarEdges: container.querySelectorAll('[data-shell-splitter="sidebar"]').length,
    }).toEqual({
      collapsed: 'true',
      controlIsADirectChild: true,
      controlName: 'הרחבת התפריט',
      navs: 0,
      sidebarEdges: 0,
    });
  });

  it('EXPANDED, the same control offers to collapse it — one control, two names, never two controls', async () => {
    const { Shell } = await shellModule();
    const { default: Page } = await noTabsPage();
    const { container } = renderWithIntl(
      <Shell>
        <Page />
      </Shell>,
    );
    const controls = [...container.querySelectorAll('[data-shell-collapse-control]')];
    expect({ count: controls.length, name: controls.at(0)?.getAttribute('aria-label') }).toEqual({
      count: 1,
      name: 'קיפול התפריט',
    });
  });

  it('the centre holds the page\'s own <main>, and the shell adds no second one', async () => {
    const { Shell } = await shellModule();
    const { default: Page } = await twoTabsPage();
    const { container } = renderWithIntl(
      <Shell>
        <Page />
      </Shell>,
    );
    const centre = container.querySelector('[data-shell-region="centre"]');
    expect({
      mainsInTheDocument: container.querySelectorAll('main').length,
      mainIsInTheCentre: centre?.querySelector('main') !== null && centre?.querySelector('main') !== undefined,
    }).toEqual({ mainsInTheDocument: 1, mainIsInTheCentre: true });
  });
});

describe('the phone drawer closes when a link inside it is followed', () => {
  // THE DEFECT, found by the researcher on a phone against the deployed page (2026-09-18): the drawer had
  // three ways out — Escape, the scrim and the toggle — and following a LINK INSIDE IT was not one of them.
  // A reader who opened a thesis from the drawer arrived at that thesis with the drawer still over it, the
  // body still locked to `overflow: hidden`, and the toggle underneath the drawer itself: "I cannot close
  // the menu".
  //
  // AND IT IS THE SAME-ROUTE TAP THAT MATTERS, which is why a route effect was written first and removed:
  // the drawer lists what was opened IN THIS BROWSER, so the entry a reader chooses is very often the page
  // they are already on. `pathname` does not change, so nothing keyed on it can fire. This shell also READS
  // NO ROUTE by contract — the case above says so in its title, and a `usePathname` here would have passed
  // it while making that title false.
  //
  // THE ORDER OF THE TWO HALVES IS LOAD-BEARING, and the first draft had it wrong: the negative control
  // clicks a BUTTON inside the same element, and the first button there is the COLLAPSE control, which
  // sets `collapsed` and unmounts the whole `Sidebar` — links included. Asserting the link half afterwards
  // read an empty subject set and `requireSubjects` refused it, correctly. The link half runs FIRST, on an
  // untouched drawer.
  it('a link inside the drawer closes it', async () => {
    const { Shell } = await shellModule();
    const page = (await noTabsPage()).default;
    const rendered = renderWithIntl(<Shell>{page()}</Shell>, { locale: 'he' });

    const toggle = rendered.container.querySelector<HTMLElement>('[aria-expanded]');
    if (toggle === null) throw new Error('the shell rendered no drawer toggle');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toEqual('true');

    const links = requireSubjects(
      'links inside the drawer',
      [...rendered.container.querySelectorAll<HTMLElement>('aside[data-shell-region="sidebar"] a[href]')],
    );
    const first = links[0];
    if (first === undefined) throw new Error('the drawer rendered no link');
    fireEvent.click(first);

    expect(toggle.getAttribute('aria-expanded')).toEqual('false');
  });

  it('a BUTTON inside the drawer does NOT close it — the handler is scoped to links', async () => {
    const { Shell } = await shellModule();
    const page = (await noTabsPage()).default;
    const rendered = renderWithIntl(<Shell>{page()}</Shell>, { locale: 'he' });

    const toggle = rendered.container.querySelector<HTMLElement>('[aria-expanded]');
    if (toggle === null) throw new Error('the shell rendered no drawer toggle');
    fireEvent.click(toggle);

    const buttons = requireSubjects(
      'buttons inside the drawer',
      [...rendered.container.querySelectorAll<HTMLElement>('aside[data-shell-region="sidebar"] button')],
    );
    const inside = buttons[0];
    if (inside === undefined) throw new Error('the drawer rendered no button');
    fireEvent.click(inside);

    // It may change the sidebar (the first control there is the collapse one) — it may not close the drawer.
    expect(toggle.getAttribute('aria-expanded')).toEqual('true');
  });
});
