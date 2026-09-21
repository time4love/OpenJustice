'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ICONS } from '@/components/glyphs';
import { SHELL_KEYS, useLocalState } from './localState';

// ---------------------------------------------------------------------------
// THE RIGHT PANE — docs/gf-ui-refactor-plan.md §9 :1068–:1070; design session §1.1–§1.2; canvas page 1
// boards B and C (a record and the call page beside the public thesis; §11's state segments beside the stream).
//
// EMPTY ON EVERY ROUTE AT THIS STEP, by design. The tabs are DECLARED BY THE PAGE, and no page declares one
// until UI-5's re-brief (§10 :1124). What lands here is the mechanism and the two fixtures that exercise it.
//
// WHY A CONTEXT AND NOT A PARALLEL ROUTE. Next's own second-pane mechanism is a named slot (`@pane` plus a
// `default.tsx` per route), and it is the wrong tool here for one reason that is not aesthetic: it requires
// EVERY route under `[locale]` to gain a file, and every page under `[locale]` is KEEP this round (§9
// :1092–:1094). A page instead renders `<DeclareTabs>` — a Client Component with serialisable props, which a
// Server Component may render (next docs, server-and-client-components: passing data by props) — and it
// registers on mount and unregisters on unmount.
//
// THE PANE COLLAPSES TO NOTHING when a page declares none: no element and no splitter, not a zero-width box.
// A zero-width pane would still be in the accessibility tree and still be a tab stop, which is the difference
// a DOM assertion can see and a screenshot cannot (`test/shell.test.tsx`).
// ---------------------------------------------------------------------------

export interface PaneTab {
  id: string;
  /** What the strip shows. A page's own words; never an id (§4 :167–:178). */
  label: string;
  content: ReactNode;
}

interface TabRegistry {
  tabs: PaneTab[];
  declare: (tabs: PaneTab[]) => void;
}

const TabsContext = createContext<TabRegistry | null>(null);

/** The shell provides it around `children`, so a page rendered in the centre can reach it. */
export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<PaneTab[]>([]);
  const declare = useCallback((next: PaneTab[]) => {
    setTabs(next);
  }, []);
  const value = useMemo(() => ({ tabs, declare }), [tabs, declare]);
  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}

export function usePaneTabs(): TabRegistry {
  const registry = useContext(TabsContext);
  if (registry === null) throw new Error('usePaneTabs: the right pane is only reachable inside the shell');
  return registry;
}

/**
 * A page declares its right-pane tabs by rendering this. It draws nothing. Unmounting clears the pane, so a
 * navigation away from a page that had tabs leaves none behind.
 */
export function DeclareTabs({ tabs }: { tabs: PaneTab[] }) {
  const { declare } = usePaneTabs();
  // The tabs' identity, not the array's: a page that rebuilds its array on every render must not re-register
  // on every render. The CONTENT is a node and cannot be compared, so the key is the ids and the labels.
  const signature = tabs.map((tab) => `${tab.id}\u0000${tab.label}`).join('\u0001');

  // TWO EFFECTS, AND THE SPLIT IS A CORRECTION (UI-8 chunk 5, declared). Clearing the registry in the
  // SIGNATURE effect's cleanup put an empty pane between every two declarations: `RightPane` early-returns at
  // zero tabs, so opening a second sheet UNMOUNTED the first and remounted it a tick later — and a sheet that
  // reads its own body (§27's three) therefore re-issued that read on every neighbouring press. Measured on
  // 2026-09-21: opening the rule history re-fetched the work list and the rules, twice each.
  //
  // A page's tabs are still exactly what it last declared, and leaving a page still empties the pane — that
  // is the second effect, which runs on UNMOUNT alone. What is gone is only the empty state in between.
  useEffect(() => {
    declare(tabs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` IS the comparison; `tabs` would re-register every render.
  }, [signature, declare]);
  useEffect(
    () => () => {
      declare([]);
    },
    [declare],
  );
  return null;
}

/**
 * THE PHONE'S FULL-SCREEN LAYER, open or closed (§9 :1070, "one layer at a time"). It is browser-local
 * state, so the pane and whatever OPENS it — a dated tick, a card — read the SAME key through the shell's
 * one store and both re-render; there is no context to plumb and no page holds shell state of its own.
 */
export function usePaneLayer(): [boolean, (next: boolean) => void] {
  return useLocalState<boolean>(SHELL_KEYS.paneOpenOnPhone, false);
}

/**
 * WHICH TAB IS ACTIVE, read and written through the shell's one store — so a control OUTSIDE the pane
 * (a dated tick in the researcher's text) can open a tab without the page holding shell state or the
 * shell knowing what a tick is. Same mechanism as `usePaneLayer`, and the same reason: one key, two
 * readers, no plumbing. Exported here rather than spelled from `SHELL_KEYS` at each caller, so no two
 * components can disagree about where the active tab lives.
 */
export function usePaneSelection(): [string | null, (next: string | null) => void] {
  return useLocalState<string | null>(SHELL_KEYS.activeTab, null);
}

export function RightPane() {
  const t = useTranslations('common.chrome');
  const { tabs } = usePaneTabs();
  const [activeId, setActiveId] = usePaneSelection();
  const [openOnPhone, setOpenOnPhone] = usePaneLayer();

  // A stored tab that this page does not declare is not this page's tab: fall back to the first rather than
  // showing an empty pane, which would look like a defect and read like one.
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs.at(0);

  if (tabs.length === 0) return null;

  return (
    <aside data-shell-region="pane" data-pane-open={openOnPhone ? 'true' : undefined} className="shell-pane">
      <div role="tablist" aria-label={t('panelLabel')} className="shell-tabs">
        {/* The way OUT of the full-screen layer, and the phone's alone: at width the pane sits beside the
            centre and there is nothing to go back from. */}
        <span className="md:hidden">
          <PaneBackControl onBack={() => { setOpenOnPhone(false); }} />
        </span>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`pane-tab-${tab.id}`}
            aria-selected={tab.id === active?.id}
            aria-controls={`pane-panel-${tab.id}`}
            className="shell-tab"
            onClick={() => {
              setActiveId(tab.id);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === undefined ? null : (
        <div role="tabpanel" id={`pane-panel-${active.id}`} aria-labelledby={`pane-tab-${active.id}`} className="shell-pane-body">
          {active.content}
        </div>
      )}
    </aside>
  );
}

/** The phone's way out of a full-screen pane layer: one back control, one layer at a time (§9 :1070). */
export function PaneBackControl({ onBack }: { onBack: () => void }) {
  const t = useTranslations('common.chrome');
  return (
    <button type="button" onClick={onBack} aria-label={t('back')} className="shell-icon-button">
      <ICONS.back />
    </button>
  );
}
