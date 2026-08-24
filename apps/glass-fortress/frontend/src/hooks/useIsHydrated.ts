'use client';

import { useSyncExternalStore } from 'react';

/** Nothing ever changes this value, so there is nothing to subscribe to. */
const noSubscription = () => () => undefined;

/**
 * `false` on the server and through hydration, `true` once the client has taken
 * over — for the handful of things that genuinely cannot render until then
 * (portals need a real `document.body`).
 *
 * `useSyncExternalStore` rather than the usual `useState(false)` + an effect
 * that sets it to `true`: React does the server/client switch itself, so the
 * flag never has to be written back into state from inside an effect
 * (`react-hooks/set-state-in-effect`).
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(noSubscription, () => true, () => false);
}
