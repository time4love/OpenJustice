'use client';

import { useSyncExternalStore } from 'react';

export interface MagicLinkFragment {
  accessToken: string | null;
  errorDescription: string | null;
}

const NONE: MagicLinkFragment = { accessToken: null, errorDescription: null };

let snapshot: MagicLinkFragment | undefined;

/**
 * Read once and cached: `useSyncExternalStore` may call this many times and must
 * get the same object back each time, and the fragment itself is stripped from
 * the address bar the moment the page mounts.
 */
function readFragment(): MagicLinkFragment {
  if (snapshot) return snapshot;
  const hash = window.location.hash.slice(1);
  if (!hash) {
    snapshot = NONE;
    return snapshot;
  }
  const params = new URLSearchParams(hash);
  const errorDescription = params.get('error_description');
  snapshot = {
    // A fragment carrying an error carries no usable token, whatever else is in
    // it — treating the two as independent would let a failed verification look
    // like a successful one.
    accessToken: errorDescription ? null : params.get('access_token'),
    errorDescription,
  };
  return snapshot;
}

/** Nothing changes the fragment after load — the page strips it and never restores it. */
const noSubscription = () => () => undefined;

/**
 * Supabase returns the magic-link token in the URL *fragment*, never a query
 * param, so only the browser ever sees it — and the server render cannot.
 *
 * `useSyncExternalStore` is how React reads a client-only value without a
 * hydration mismatch and without an effect writing it back into state
 * (`react-hooks/set-state-in-effect`): the server snapshot is "no fragment", the
 * client snapshot is what the URL actually held.
 */
export function useMagicLinkFragment(): MagicLinkFragment {
  return useSyncExternalStore(noSubscription, readFragment, () => NONE);
}
