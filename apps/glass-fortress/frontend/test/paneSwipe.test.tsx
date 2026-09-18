jest.mock('../src/context/AuthContext', () => jest.requireActual<typeof import('./render')>('./render').authContextDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from '@testing-library/react';
import { renderWithIntl, setAuthState, setPathname } from './render';
import { FRONTEND, requireSubjects } from './scan';
import { PANE_SWIPE, PHONE_QUERY, decideSwipe, pansHorizontally, type SwipePoint } from '@/components/shell/paneSwipe';
import { SHELL_KEYS } from '@/components/shell/localState';

// ---------------------------------------------------------------------------
// pane-swipe — docs/gf-ui-flows.md §18 :564 as amended 2026-09-18; the researcher's ruling of that day: "on mobile the thesis view does not let you reach the
// information the desktop shows in the right pane in any easy way. Today only pressing a document's date
// bubble jumps the page to the right side. I want a swipe right on mobile, from the thesis page, to take the
// reader to the right side, and a swipe left to bring them back to the thesis page."
//
// WHAT IS HELD WHERE, and the split is the point. The DECISION is pure geometry (`paneSwipe.ts`) and is held
// exhaustively below, including every way a gesture must be REFUSED — the guards are the whole substance of
// this feature, because each one is a touch that belongs to something else. The WIRING is held over a real
// shell with synthetic touches: that the listeners exist, that they read the pane's own flag, and that a page
// declaring no tab has no gesture at all.
//
// WHAT jsdom CANNOT HOLD, stated rather than implied: jsdom computes no layout, so `scrollWidth` and
// `clientWidth` are 0 on every element and a real horizontally-panning table cannot be built here. The walk
// in `pansHorizontally` is therefore exercised over elements whose dimensions are DEFINED on them — which
// holds the walk and the threshold, and does NOT hold that a real `.md-table-scroll` reports a wider box.
// That last is a browser reading and belongs in the dated doc, never to a green case here.
//
// jsdom also implements no `matchMedia`, so the harness supplies one. That is a browser API the shell is
// entitled to expect, not a behaviour under test — and the case that a browser WITHOUT it simply has no
// gesture is stated separately, below, by removing it.
// ---------------------------------------------------------------------------

const twoTabsPage = () => import('./fixtures/shell/page-two-tabs');
const noTabsPage = () => import('./fixtures/shell/page-no-tabs');
const shellModule = () => import('../src/components/shell/Shell');

/** A viewport width used by every decision case; only its relation to `edgeGuard` matters. */
const VIEWPORT = 390;

beforeEach(() => {
  setAuthState('anonymous');
  setPathname('/he/theses/x');
});
afterEach(() => {
  setAuthState(undefined);
  setPathname(undefined);
  window.localStorage.clear();
  Reflect.deleteProperty(globalThis, 'matchMedia');
});

// ---------------------------------------------------------------------------
// THE DECISION
// ---------------------------------------------------------------------------

const at = (x: number, y: number, t: number): SwipePoint => ({ x, y, t });

describe('pane-swipe · the decision', () => {
  it("THE RESEARCHER'S MAPPING: right opens the pane, left returns to the read — and neither fires twice", () => {
    const rightward = [at(120, 400, 0), at(260, 404, 120)] as const;
    const leftward = [at(260, 400, 0), at(120, 404, 120)] as const;
    expect({
      rightWhileClosed: decideSwipe(rightward[0], rightward[1], VIEWPORT, false),
      leftWhileOpen: decideSwipe(leftward[0], leftward[1], VIEWPORT, true),
      rightWhileAlreadyOpen: decideSwipe(rightward[0], rightward[1], VIEWPORT, true),
      leftWhileAlreadyClosed: decideSwipe(leftward[0], leftward[1], VIEWPORT, false),
    }).toEqual({ rightWhileClosed: 'open', leftWhileOpen: 'close', rightWhileAlreadyOpen: null, leftWhileAlreadyClosed: null });
  });

  it('THE EDGE BELONGS TO THE OPERATING SYSTEM: a gesture begun within edgeGuard of either side is refused', () => {
    // Both sides, because the platforms disagree about which edge is back and which is Control Centre, and
    // an RTL page moves the question again. The page claims neither.
    const inset = PANE_SWIPE.edgeGuard;
    expect({
      leftEdge: decideSwipe(at(inset - 1, 400, 0), at(inset + 200, 404, 120), VIEWPORT, false),
      rightEdge: decideSwipe(at(VIEWPORT - inset + 1, 400, 0), at(VIEWPORT - inset - 200, 404, 120), VIEWPORT, true),
      // One pixel inside the guard on each side is the page's, so the boundary itself is held and not merely
      // the far side of it.
      justInsideLeft: decideSwipe(at(inset, 400, 0), at(inset + 200, 404, 120), VIEWPORT, false),
      justInsideRight: decideSwipe(at(VIEWPORT - inset, 400, 0), at(VIEWPORT - inset - 200, 404, 120), VIEWPORT, true),
    }).toEqual({ leftEdge: null, rightEdge: null, justInsideLeft: 'open', justInsideRight: 'close' });
  });

  it('A SCROLL IS MOSTLY VERTICAL: travel that does not beat the vertical by `dominance` is a read, not a swipe', () => {
    const dx = 120;
    // Exactly at the ratio is refused and just past it is taken — the VALUE is held, not the property.
    const atRatio = dx / PANE_SWIPE.dominance;
    expect({
      diagonal: decideSwipe(at(120, 400, 0), at(120 + dx, 400 + atRatio, 120), VIEWPORT, false),
      justPast: decideSwipe(at(120, 400, 0), at(120 + dx, 400 + atRatio - 1, 120), VIEWPORT, false),
    }).toEqual({ diagonal: null, justPast: 'open' });
  });

  it('A SHORT DRAG IS NOT A SWIPE, and a SLOW ONE is not either — both boundaries by value', () => {
    expect({
      tooShort: decideSwipe(at(120, 400, 0), at(120 + PANE_SWIPE.minDistance - 1, 400, 60), VIEWPORT, false),
      longEnough: decideSwipe(at(120, 400, 0), at(120 + PANE_SWIPE.minDistance, 400, 60), VIEWPORT, false),
      tooSlow: decideSwipe(at(120, 400, 0), at(260, 400, PANE_SWIPE.maxDuration + 1), VIEWPORT, false),
      quickEnough: decideSwipe(at(120, 400, 0), at(260, 400, PANE_SWIPE.maxDuration), VIEWPORT, false),
    }).toEqual({ tooShort: null, longEnough: 'open', tooSlow: null, quickEnough: 'open' });
  });

  it('THE BREAKPOINT IS THE STYLESHEET\'S: `PHONE_QUERY` is the media query globals.css actually declares', () => {
    // A breakpoint written twice is a breakpoint that will disagree once. `globals.css` owns the pane's
    // full-screen layer; this module must name the SAME query, character for character.
    const css = readFileSync(join(FRONTEND, 'src/app/globals.css'), 'utf8');
    const queries = requireSubjects('media queries in globals.css', [...css.matchAll(/@media\s+(\([^)]*\))/g)].map((found) => found[1] ?? ''));
    expect(queries).toContain(PHONE_QUERY);
  });
});

// ---------------------------------------------------------------------------
// THE PANNER WALK
// ---------------------------------------------------------------------------

/** jsdom computes no layout, so a box that pans is one whose dimensions are defined on it. */
function boxThatPans(element: Element, scrollWidth: number, clientWidth: number): Element {
  Object.defineProperty(element, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(element, 'clientWidth', { value: clientWidth, configurable: true });
  return element;
}

describe('pane-swipe · a wide thing pans itself', () => {
  it('a panning ancestor anywhere between the target and the shell refuses the gesture — and an ordinary one does not', () => {
    const root = document.createElement('div');
    const middle = document.createElement('div');
    const target = document.createElement('span');
    root.append(middle);
    middle.append(target);
    for (const element of [root, middle, target]) boxThatPans(element, 300, 300);

    const ordinary = pansHorizontally(target, root);
    boxThatPans(middle, 900, 300);
    const panning = pansHorizontally(target, root);
    expect({ ordinary, panning }).toEqual({ ordinary: false, panning: true });
  });

  it('a ONE-PIXEL excess is not a panner — sub-pixel layout would otherwise disable the gesture over plain text', () => {
    const root = document.createElement('div');
    const target = document.createElement('span');
    root.append(target);
    boxThatPans(root, 300, 300);
    boxThatPans(target, 301, 300);
    const subPixel = pansHorizontally(target, root);
    boxThatPans(target, 302, 300);
    expect({ subPixel, genuinelyWider: pansHorizontally(target, root) }).toEqual({ subPixel: false, genuinelyWider: true });
  });

  it('the walk STOPS at the shell: a panning ancestor ABOVE the root is not the gesture\'s business', () => {
    const outside = boxThatPans(document.createElement('div'), 900, 300);
    const root = boxThatPans(document.createElement('div'), 300, 300);
    const target = boxThatPans(document.createElement('span'), 300, 300);
    outside.append(root);
    root.append(target);
    expect(pansHorizontally(target, root)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE WIRING
// ---------------------------------------------------------------------------

interface Point {
  clientX: number;
  clientY: number;
}

function touchList(points: readonly Point[]): TouchList {
  return { length: points.length, item: (index: number) => points.at(index) ?? null } as unknown as TouchList;
}

/** A touch event jsdom will dispatch: it implements no `TouchEvent`, so the fields the shell reads are defined. */
function touch(target: Element, type: 'touchstart' | 'touchend' | 'touchcancel', points: readonly Point[], timeStamp: number): void {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'touches', { value: touchList(points) });
  Object.defineProperty(event, 'changedTouches', { value: touchList(points) });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}

function setViewport(matches: boolean): void {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: query === PHONE_QUERY ? matches : false, media: query }),
  });
}

const paneIsOpen = (): boolean => window.localStorage.getItem(SHELL_KEYS.paneOpenOnPhone) === 'true';

async function shellWith(page: 'two-tabs' | 'no-tabs'): Promise<HTMLElement> {
  const { Shell } = await shellModule();
  const Page = (page === 'two-tabs' ? await twoTabsPage() : await noTabsPage()).default;
  const { container } = renderWithIntl(
    <Shell>
      <Page />
    </Shell>,
    { locale: 'he' },
  );
  const centre = container.querySelector('[data-shell-region="centre"]');
  if (centre === null) throw new Error('the shell rendered no centre to swipe on');
  return centre as HTMLElement;
}

/**
 * One gesture, start to finish, on a descendant of the centre — the reader's own path.
 *
 * WRAPPED IN `act` because these touches are dispatched OUTSIDE React's event system: the handler's write
 * lands in the store synchronously, but the re-render that refreshes what the handler reads next is React's
 * to flush. In a browser that flush happens in the milliseconds before the reader's next gesture; here it
 * must be asked for, or a second swipe would be judged against the first one's stale world.
 */
function swipe(from: Element, dx: number): void {
  act(() => {
    touch(from, 'touchstart', [{ clientX: 140, clientY: 400 }], 0);
    touch(from, 'touchend', [{ clientX: 140 + dx, clientY: 402 }], 100);
  });
}

describe('pane-swipe · the wiring', () => {
  it('a swipe right OPENS the phone pane and a swipe left CLOSES it, through the pane\'s own flag', async () => {
    setViewport(true);
    const centre = await shellWith('two-tabs');
    swipe(centre, 160);
    const afterRight = paneIsOpen();
    swipe(centre, -160);
    expect({ afterRight, afterLeft: paneIsOpen() }).toEqual({ afterRight: true, afterLeft: false });
  });

  it('A PAGE THAT DECLARES NO TAB HAS NO GESTURE — there is no pane to open, and a flag set anyway would be a defect', async () => {
    setViewport(true);
    const centre = await shellWith('no-tabs');
    swipe(centre, 160);
    expect(paneIsOpen()).toBe(false);
  });

  it('AT `md` THERE IS NOTHING TO OPEN: the query is asked at the moment of the gesture, not at mount', async () => {
    setViewport(false);
    const centre = await shellWith('two-tabs');
    swipe(centre, 160);
    const atWidth = paneIsOpen();
    // The SAME mounted shell, the SAME gesture, only the viewport's answer changed — so this holds that the
    // query is read per gesture and not captured once.
    setViewport(true);
    swipe(centre, 160);
    expect({ atWidth, onPhone: paneIsOpen() }).toEqual({ atWidth: false, onPhone: true });
  });

  it('A BROWSER WITHOUT `matchMedia` HAS NO GESTURE AND NO ERROR — a missing browser API never takes the page down', async () => {
    const centre = await shellWith('two-tabs');
    Reflect.deleteProperty(globalThis, 'matchMedia');
    expect(() => {
      swipe(centre, 160);
    }).not.toThrow();
    expect(paneIsOpen()).toBe(false);
  });

  it('TWO FINGERS ARE A PINCH: a second touch abandons the gesture rather than completing it', async () => {
    setViewport(true);
    const centre = await shellWith('two-tabs');
    touch(centre, 'touchstart', [{ clientX: 140, clientY: 400 }, { clientX: 220, clientY: 420 }], 0);
    touch(centre, 'touchend', [{ clientX: 300, clientY: 402 }], 100);
    expect(paneIsOpen()).toBe(false);
  });

  it('THE OPEN DRAWER OWNS ITS OWN TOUCHES: a swipe inside it does not open the pane behind it', async () => {
    // The drawer is `.shell-sidebar` wearing `.shell-drawer`, rendered INSIDE the element the listeners sit
    // on — so before the sixth refusal a swipe in the open nav drawer opened the pane underneath it. The
    // drawer is opened the reader's own way, by pressing the menu control, not by writing its state.
    setViewport(true);
    const { Shell } = await shellModule();
    const Page = (await twoTabsPage()).default;
    const { container } = renderWithIntl(
      <Shell>
        <Page />
      </Shell>,
      { locale: 'he' },
    );
    const menu = container.querySelector('.shell-topbar button');
    if (menu === null) throw new Error('the shell rendered no menu control to open the drawer with');
    act(() => {
      menu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const drawer = container.querySelector('.shell-drawer');
    // Not a silent skip: a drawer that did not open would make the swipe below prove nothing.
    if (drawer === null) throw new Error('the menu control did not open the drawer');
    swipe(drawer, 160);
    expect(paneIsOpen()).toBe(false);
  });

  it('A BARE `touchend` WITH NO `touchstart` DOES NOTHING — a finger already down when the page mounted', async () => {
    // FOUND BY THE DEV SEAT READING THIS FILE COLD, and it is the gap that justifies the arrangement: the
    // guard was written, was correct, and was held by NOTHING. Initialising `from` to a real point left the
    // suite 15/15 green. The reader it costs is one whose finger was down as the page hydrated, or across a
    // re-attach when `tabs.length` changes — the gesture then completes from a start it never had.
    setViewport(true);
    const centre = await shellWith('two-tabs');
    act(() => {
      touch(centre, 'touchend', [{ clientX: 300, clientY: 402 }], 100);
    });
    expect(paneIsOpen()).toBe(false);
  });

  it('A SECOND `touchend` DOES NOT REPLAY THE FIRST GESTURE — the start is cleared when it is consumed', async () => {
    // THE SAME REGION, A DIFFERENT GUARD, and the `touchcancel` case above does not reach it: that one is
    // cleared by `onCancel` independently, so removing the reset in `onEnd` leaves it green. Without the
    // reset a completed swipe stays loaded, and the next stray `touchend` — a tap released anywhere — is
    // judged against the finished gesture's start and closes the pane the reader just opened.
    setViewport(true);
    const centre = await shellWith('two-tabs');
    swipe(centre, 160);
    const afterTheSwipe = paneIsOpen();
    act(() => {
      // Leftward of the CONSUMED start (x 140), far enough and quick enough to be judged a close if the
      // stale start were still there.
      touch(centre, 'touchend', [{ clientX: 60, clientY: 402 }], 150);
    });
    expect({ afterTheSwipe, afterTheStrayEnd: paneIsOpen() }).toEqual({ afterTheSwipe: true, afterTheStrayEnd: true });
  });

  it('A CANCELLED TOUCH LEAVES NOTHING BEHIND: the next touchend cannot complete the abandoned gesture', async () => {
    setViewport(true);
    const centre = await shellWith('two-tabs');
    touch(centre, 'touchstart', [{ clientX: 140, clientY: 400 }], 0);
    touch(centre, 'touchcancel', [{ clientX: 140, clientY: 400 }], 50);
    touch(centre, 'touchend', [{ clientX: 300, clientY: 402 }], 100);
    expect(paneIsOpen()).toBe(false);
  });

  it('A SWIPE BEGUN ON A PANNING BOX IS THAT BOX\'S: the gesture reads the target it actually started on', async () => {
    setViewport(true);
    const centre = await shellWith('two-tabs');
    const table = document.createElement('div');
    centre.append(table);
    Object.defineProperty(table, 'scrollWidth', { value: 900, configurable: true });
    Object.defineProperty(table, 'clientWidth', { value: 300, configurable: true });
    swipe(table, 160);
    expect(paneIsOpen()).toBe(false);
  });
});
