'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ICONS } from '@/components/glyphs';
import { SHELL_KEYS, useLocalState } from './localState';
import { PHONE_QUERY, decideSwipe, pansHorizontally, type SwipePoint } from './paneSwipe';
import { RightPane, TabsProvider, usePaneLayer, usePaneTabs } from './RightPane';
import { Sidebar } from './Sidebar';
import { Splitter } from './Splitter';

// ---------------------------------------------------------------------------
// THE SHELL — docs/gf-ui-refactor-plan.md §9 :1058–:1072; design session §1.1–§1.2; canvas page 1.
//
// Mounted ONCE, by `app/[locale]/layout.tsx`. A LEFT SIDEBAR that is the nav, a CENTRE that is whatever the
// route's page renders, and a RIGHT PANE the page declares tabs into — with a splitter between the last two
// and a drag edge on the first.
//
// TWO CENTRES BY URL, NONE BY IDENTITY. The shell chooses NOTHING: it does not read who is looking and does
// not vary what it renders by it. The route's page IS the centre, and the only identity read anywhere under
// `components/shell` is the sidebar's level, which is the nav's existing one (`test/shell.test.tsx` scans for
// exactly that and fails on a second reader).
//
// THE DIRECTION TRICK (canvas `build.mjs` :42–:58, and it is the board's spelling rather than an invention):
// `.shell` is `ltr` so flex-row lays its FIRST child against the left edge, and each pane flips back to `rtl`
// for its own content. `row-reverse` would put the sidebar left too — and would reverse the pane order for a
// screen reader, which reads the DOM and not the paint.
// ---------------------------------------------------------------------------

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;
const PANE_MIN = 320;
const PANE_MAX = 760;

/** The splitter is drawn only when there is a pane to resize — §9 :1069, "collapses to nothing". */
function PaneWithSplitter({ width, onResize }: { width: number; onResize: (next: number) => void }) {
  const t = useTranslations('common.chrome');
  const { tabs } = usePaneTabs();
  if (tabs.length === 0) return null;
  return (
    <>
      <Splitter kind="pane" label={t('paneResize')} width={width} min={PANE_MIN} max={PANE_MAX} onResize={onResize} />
      <div style={{ ['--pane-width' as string]: `${String(width)}px` }} className="contents">
        <RightPane />
      </div>
    </>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const t = useTranslations('common.chrome');
  const common = useTranslations('common');
  const [sidebarWidth, setSidebarWidth] = useLocalState<number>(SHELL_KEYS.sidebarWidth, 268);
  const [paneWidth, setPaneWidth] = useLocalState<number>(SHELL_KEYS.paneWidth, 580);
  const [collapsed, setCollapsed] = useLocalState<boolean>(SHELL_KEYS.sidebarCollapsed, false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const { tabs } = usePaneTabs();
  const [paneOpen, setPaneOpen] = usePaneLayer();
  // THE FLAG THE TOUCH HANDLER READS, kept current by its own effect rather than captured in the listener's
  // closure. Two reasons, and the first is a defect the suite caught: listeners attached while the pane was
  // shut would go on believing that, so the swipe back — the researcher's "swipe left returns to the thesis"
  // — asked `decideSwipe` a question it had already answered and did nothing. The second is that the
  // listeners now attach ONCE per page rather than being torn down and rebuilt every time the pane moves.
  const paneOpenRef = useRef(paneOpen);
  useEffect(() => {
    paneOpenRef.current = paneOpen;
  }, [paneOpen]);
  // THE DRAWER IS A LAYER OVER THE PAGE AND OWNS ITS OWN TOUCHES. It is `.shell-sidebar` wearing
  // `.shell-drawer` (below), rendered INSIDE the element the listeners are attached to — so without this a
  // swipe inside an open nav drawer would reach the shell and open the pane behind it. That is the same
  // class of defect as claiming the operating system's edge: a touch acted on by something other than what
  // the reader is touching. Found by the DEV seat reading this cold, and a sixth refusal rather than a note.
  const drawerOpenRef = useRef(drawerOpen);
  useEffect(() => {
    drawerOpenRef.current = drawerOpen;
  }, [drawerOpen]);

  // The drawer is a layer over the page: Escape closes it and the body's scroll is locked while it is open,
  // the same two behaviours the Sheet primitive owns for a dialog.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    const overflowBefore = document.body.style.overflow;
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowBefore;
    };
  }, [drawerOpen]);

  // THE PHONE'S SWIPE INTO THE PANE (docs/gf-ui-flows.md §18 :564, amended 2026-09-18; the researcher): "on mobile the thesis view gives no easy
  // way to reach what the desktop shows in the right pane — today only pressing a document's date bubble
  // gets you there." A swipe right opens the pane, a swipe left returns to the read. The decision itself is
  // `paneSwipe.ts`', which is pure; this effect only supplies the two points and applies the answer.
  //
  // IT LIVES IN THE SHELL AND NOT ON THE THESIS PAGE, because the pane is the shell's and the call page has
  // one too — a page-level gesture would be one rule with two implementations. It is INERT wherever no tab
  // is declared, which is exactly the set of pages with no pane, so no page opts in and none can forget to.
  //
  // THE LISTENERS ARE PASSIVE. This gesture never calls `preventDefault` — it must not, because the same
  // finger may be scrolling the read, and a non-passive touch listener on the scroll container costs every
  // scroll in the app its fast path. The pane opens on `touchend` or not at all.
  useEffect(() => {
    const shell = shellRef.current;
    if (shell === null || tabs.length === 0) return undefined;

    let from: SwipePoint | null = null;
    let onAPanner = false;

    const onStart = (event: TouchEvent) => {
      // A second finger is a pinch, never a navigation — and it abandons any gesture already begun.
      const touch = event.touches.length === 1 ? event.touches.item(0) : null;
      if (touch === null) {
        from = null;
        return;
      }
      from = { x: touch.clientX, y: touch.clientY, t: event.timeStamp };
      onAPanner = pansHorizontally(event.target instanceof Element ? event.target : null, shell);
    };

    const onEnd = (event: TouchEvent) => {
      const start = from;
      from = null;
      if (start === null || onAPanner || drawerOpenRef.current) return;
      // Asked at the moment of the gesture, not at mount: a rotation or a resized window changes the answer,
      // and at `md` the pane is already beside the centre with nothing to open.
      //
      // A BROWSER WITHOUT `matchMedia` SIMPLY HAS NO GESTURE — it never throws inside a touch handler. This
      // is the retired context line's own lesson, which it carried in its docblock and which outlived it:
      // "a missing observer must never take the page down with it." The alternative, comparing `innerWidth`
      // to a number, would spell the breakpoint a third time.
      if (typeof globalThis.matchMedia !== 'function') return;
      if (!globalThis.matchMedia(PHONE_QUERY).matches) return;
      const touch = event.changedTouches.item(0);
      if (touch === null) return;
      const outcome = decideSwipe(start, { x: touch.clientX, y: touch.clientY, t: event.timeStamp }, globalThis.innerWidth, paneOpenRef.current);
      if (outcome !== null) setPaneOpen(outcome === 'open');
    };

    const onCancel = () => {
      from = null;
    };

    shell.addEventListener('touchstart', onStart, { passive: true });
    shell.addEventListener('touchend', onEnd, { passive: true });
    shell.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      shell.removeEventListener('touchstart', onStart);
      shell.removeEventListener('touchend', onEnd);
      shell.removeEventListener('touchcancel', onCancel);
    };
  }, [tabs.length, setPaneOpen]);

  return (
    <div ref={shellRef} className="shell" style={{ ['--sidebar-width' as string]: collapsed ? 'var(--touch-target)' : `${String(sidebarWidth)}px`, ['--pane-width' as string]: `${String(paneWidth)}px` }}>
      {/* THE PHONE'S TOP BAR: the menu control, the name as TEXT, the locale control. The name is a LINK once
          only, in the sidebar's head — a second anchor to `/` would be a second entry in the map. */}
      <div className="shell-topbar">
        <button
          type="button"
          onClick={() => {
            setDrawerOpen((was) => !was);
          }}
          aria-expanded={drawerOpen}
          aria-label={t(drawerOpen ? 'closeNav' : 'openNav')}
          className="shell-icon-button"
        >
          <ICONS.menu />
        </button>
        <span className="shell-name min-w-0 flex-1">{common('appName')}</span>
      </div>

      {/* COLLAPSED, THE SIDEBAR IS A RAIL — never zero width. Collapsing it to nothing put the 44 px expand
          control inside a 24 px box: `elementFromPoint` at the control's own centre returned the page behind
          it, so the sidebar could be collapsed and never re-opened. jsdom has no layout and cannot see that;
          the local run found it. The structural half — that the control is a DIRECT child of the rail and the
          nav is gone with it — is what `test/shell.test.tsx` holds. */}
      {/* FOLLOWING A LINK INSIDE THE DRAWER CLOSES IT (2026-09-18). Until this handler the drawer had
          three ways out — Escape, the scrim and the toggle — and following a link inside it was not one
          of them, so a reader who opened a thesis from the drawer arrived with the drawer still over it,
          the body still locked to `overflow: hidden`, and the toggle underneath the drawer itself. Found
          on a phone against the deployed page.

          WHY A CLICK HANDLER AND NOT A ROUTE EFFECT, which was written first and removed: this shell
          READS NO ROUTE by contract (`docs/gf-ui-refactor-plan.md` §9; `test/shell.test.tsx`'s
          "nothing under components/shell reads a route or issues a request"), and a `usePathname` here
          passed that case only because its assertion names two specifiers while its title names the
          property. It would also have missed the commonest tap of all: the drawer lists what was opened
          IN THIS BROWSER, so the entry a reader chooses is very often the page they are already on —
          same route, no change, no effect. Measured at 390px: `aria-expanded` still `true` after the tap.

          Scoped to `a` deliberately: the collapse control is a `<button>` inside this same element and
          must NOT close the drawer, and neither must a splitter drag. */}
      <aside
        data-shell-region="sidebar"
        data-shell-collapsed={collapsed ? 'true' : undefined}
        className={`shell-sidebar ${collapsed ? 'shell-sidebar-rail' : ''} ${drawerOpen ? 'shell-drawer !flex' : ''}`.trim()}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a') !== null) setDrawerOpen(false);
        }}
      >
        {collapsed ? null : (
          <>
            <Sidebar />
            <Splitter kind="sidebar" label={t('sidebarResize')} width={sidebarWidth} min={SIDEBAR_MIN} max={SIDEBAR_MAX} onResize={setSidebarWidth} />
          </>
        )}
        <button
          type="button"
          onClick={() => {
            setCollapsed(!collapsed);
          }}
          aria-label={t(collapsed ? 'expand' : 'collapse')}
          data-shell-collapse-control
          className={`shell-icon-button hidden md:inline-flex ${collapsed ? '' : 'absolute end-2 top-2'}`.trim()}
        >
          <ICONS.collapse />
        </button>
      </aside>

      {drawerOpen ? (
        <button
          type="button"
          aria-label={t('closeNav')}
          className="shell-scrim md:hidden"
          onClick={() => {
            setDrawerOpen(false);
          }}
        />
      ) : null}

      <div data-shell-region="centre" className="shell-centre">
        {children}
      </div>

      <PaneWithSplitter width={paneWidth} onResize={setPaneWidth} />
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  // The provider wraps the CENTRE's children too, so a page rendered there can declare its tabs into the pane
  // beside it without the layout knowing anything about that page.
  return (
    <TabsProvider>
      <ShellFrame>{children}</ShellFrame>
    </TabsProvider>
  );
}
