'use client';

import { useTranslations } from 'next-intl';
import { useLocalState } from '@/components/shell/localState';

// ---------------------------------------------------------------------------
// THE `mine` / `all` SWITCH — docs/gf-ui-flows.md §29 :907–:908 ("one control … it is navigation, not an
// act"), §39 :1061 (a per-viewer convenience, the browser's, never the backend's); UI plan :724–:726.
//
// IT IS A VIEW, NOT A READ. The routes answer `all` and fix the scope themselves (`researchRoutes.ts`
// :26–:27); every entry carries `mine`, and `mine` is the page KEEPING the entries whose `mine` is true.
// Nothing is re-fetched when it moves — which is the whole of :725's "a view over a field the body carries,
// not a derivation", and it is why this control cannot be confused with a filter that queries.
//
// THE KEY IS SPELLED ONCE, HERE. It is not one of `SHELL_KEYS`: those are the shell's own five (the widths,
// the collapsed flag, the active tab, the phone's pane layer) and this belongs to the read view. `useLocalState`
// is CALLED for the storage, so there is still one guarded `localStorage` access in the app, not two.
// ---------------------------------------------------------------------------

export type Scope = 'mine' | 'all';

/** The per-viewer memory of the switch (§39). A browser that cannot store it still renders, on `mine`. */
export const SCOPE_KEY = 'gf.research.scope.v1';

export function useScope(): [Scope, (next: Scope) => void] {
  const [scope, write] = useLocalState<Scope>(SCOPE_KEY, 'mine');
  // A STORED VALUE THIS BUILD DOES NOT KNOW READS AS `mine` — the default the page opens on (§7.1 :328),
  // never a third state.
  return [scope === 'all' ? 'all' : 'mine', write];
}

/** Keep what the switch asks for. At `mine`, the entries the body marks as the caller's; at `all`, every one. */
export function atScope<T extends { mine: boolean }>(entries: readonly T[], scope: Scope): T[] {
  return scope === 'all' ? [...entries] : entries.filter((entry) => entry.mine);
}

export function ScopeSwitch({ scope, onChange }: { scope: Scope; onChange: (next: Scope) => void }) {
  const t = useTranslations('research.scope');
  return (
    <div data-scope-switch className="flex items-center gap-2 text-xs">
      <span className="text-ink-muted">{t('label')}</span>
      {(['mine', 'all'] as const).map((option) => (
        <button
          key={option}
          type="button"
          data-scope-option={option}
          aria-pressed={scope === option}
          onClick={() => {
            onChange(option);
          }}
          className={`rounded border px-2 py-0.5 ${scope === option ? 'border-ink text-ink' : 'border-line text-ink-muted'}`}
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
