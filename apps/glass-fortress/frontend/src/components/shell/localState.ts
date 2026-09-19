'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// THE SHELL'S OWN VIEW STATE — docs/gf-ui-flows.md §39 :922 ("a per-viewer convenience — the locale, the
// `mine`/`all` switch, a collapsed VERIFY, a scroll position — written by the browser, locally"); UI plan
// §9 :1059–:1060 and :1069 (both widths, the collapsed flag and the active tab are browser-local).
//
// FIVE PIECES OF STATE, ONE READER. The two pane widths, whether the sidebar is collapsed, which tab the
// right pane shows, and the recents list the sidebar renders. They do not belong in `lib/recents.ts`, which
// §9 fixes at ONE key and no dependency; and five components each spelling its own guarded `localStorage`
// access would be one rule with five implementations, which is this repository's dominant defect shape.
//
// WHY `useSyncExternalStore` AND NOT AN EFFECT. `localStorage` is exactly what this hook exists for: an
// external store read outside React. The obvious spelling — `useState(initial)` plus an effect that reads and
// calls `setState` — renders twice on every mount and makes the browser's value arrive one paint late, which
// is why React's own lint rule refuses a synchronous `setState` inside an effect. The server snapshot is
// `null`, so the server and the first client render agree and hydration is never mismatched; the stored value
// arrives in the same commit as hydration rather than after it.
//
// THE SNAPSHOT IS THE RAW STRING, deliberately. A snapshot must be referentially stable or React re-renders
// forever; a string compares by value, a parsed object does not. Parsing happens in a `useMemo` keyed on it.
// ---------------------------------------------------------------------------

/** Writers in THIS document; the `storage` event only fires for other tabs, so same-tab writes notify here. */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  globalThis.addEventListener('storage', onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    globalThis.removeEventListener('storage', onStoreChange);
  };
}

/** The stored string, or `null` — for a private window, blocked site data, or a key never written. */
function rawOf(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The raw stored string for one key, re-read whenever anything writes it. Callers that need a shape of their
 * own — the sidebar, which reads through `lib/recents.ts` — key a `useMemo` on this.
 */
export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => rawOf(key),
    () => null,
  );
}

/** One per-viewer value, parsed, with a writer that notifies every reader in this document. */
export function useLocalState<T>(key: string, initial: T): [T, (next: T) => void] {
  const raw = useStoredString(key);

  const value = useMemo<T>(() => {
    if (raw === null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A value this browser cannot parse is a value it does not have.
      return initial;
    }
  }, [raw, initial]);

  const write = useCallback(
    (next: T) => {
      try {
        globalThis.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // The pane still moves; only the memory of it is lost, which §39 :922 allows.
      }
      notify();
    },
    [key],
  );

  return [value, write];
}

/** The keys, spelled once so no two components disagree about where a width lives. */
export const SHELL_KEYS = {
  sidebarWidth: 'gf.shell.sidebarWidth.v1',
  paneWidth: 'gf.shell.paneWidth.v1',
  sidebarCollapsed: 'gf.shell.sidebarCollapsed.v1',
  activeTab: 'gf.shell.activeTab.v1',
  /** The phone's full-screen pane layer: open or closed (§9 :1070). One flag, read by the pane and by whatever opens it. */
  paneOpenOnPhone: 'gf.shell.paneOpenOnPhone.v1',
} as const;
