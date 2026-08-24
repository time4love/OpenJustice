'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A fetcher receives an `AbortSignal` tied to the run that started it. When the
 * component unmounts, or the fetcher's identity changes, that signal aborts and
 * the result is discarded — so a slow first request can never overwrite a
 * faster second one.
 */
export type AsyncFetcher<T> = (signal: AbortSignal) => Promise<T>;

/**
 * Exactly one answer at a time. `idle` ("nothing to fetch yet") is deliberately
 * distinct from `loading` and from an `ok` result that happens to be empty:
 * "you haven't chosen anything" and "there is nothing" are different statements.
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'error'; error: Error };

export type Settled<T> = { status: 'ok'; data: T } | { status: 'error'; error: Error };

export interface AsyncData<T> {
  state: AsyncState<T>;
  /**
   * Re-run the fetcher — after a mutation, or as a retry. The previous result
   * stays visible until the new one lands, so a refresh never blanks the view.
   *
   * It never rejects: a failure is an `error` result, the same one the hook puts
   * into `state`. That is what makes `void reload()` safe in an onClick, and it
   * keeps callers that DO care about the outcome (a poller deciding whether to
   * keep polling) reading the same value the UI is rendering.
   */
  reload: () => Promise<Settled<T>>;
}

const IDLE = { status: 'idle' } as const;
const LOADING = { status: 'loading' } as const;

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * The one fetch-on-mount shape in this app.
 *
 * Hand it a memoised fetcher; it runs whenever that fetcher's identity changes
 * and reports `idle | loading | ok | error`. Pass `null` when there is nothing
 * to fetch yet (no access token, nothing selected) — that is `idle`.
 *
 * `fetcher` MUST be memoised with `useCallback`: its identity is the cache key,
 * so a fresh closure every render would refetch every render. `exhaustive-deps`
 * on that `useCallback` is what keeps the key honest.
 *
 * Why a hook rather than an effect that calls `setState` at each call site: the
 * loading transition here is *derived during render* from whether the settled
 * result still belongs to the current fetcher. Nothing has to write `loading`
 * back into state, so switching fetchers renders `loading` in the same pass
 * instead of showing one stale frame and then cascading a second render — which
 * is what `react-hooks/set-state-in-effect` is warning about.
 */
export function useAsyncData<T>(fetcher: AsyncFetcher<T> | null): AsyncData<T> {
  const [cache, setCache] = useState<{ key: AsyncFetcher<T>; settled: Settled<T> } | null>(null);

  // Reloads are started by event handlers, not by the effect below, so they get
  // their own controller — aborted on unmount so an in-flight refresh dies with
  // the component like the mount fetch does.
  const reloadRun = useRef<AbortController | null>(null);
  useEffect(() => () => reloadRun.current?.abort(), []);

  useEffect(() => {
    if (!fetcher) return;
    const run = new AbortController();
    void (async () => {
      try {
        const data = await fetcher(run.signal);
        if (run.signal.aborted) return;
        setCache({ key: fetcher, settled: { status: 'ok', data } });
      } catch (err) {
        if (run.signal.aborted) return;
        setCache({ key: fetcher, settled: { status: 'error', error: asError(err) } });
      }
    })();
    return () => { run.abort(); };
  }, [fetcher]);

  const reload = useCallback(async (): Promise<Settled<T>> => {
    if (!fetcher) return { status: 'error', error: new Error('useAsyncData: reload() while idle') };
    reloadRun.current?.abort();
    const run = new AbortController();
    reloadRun.current = run;
    let settled: Settled<T>;
    try {
      settled = { status: 'ok', data: await fetcher(run.signal) };
    } catch (err) {
      settled = { status: 'error', error: asError(err) };
    }
    if (!run.signal.aborted) setCache({ key: fetcher, settled });
    return settled;
  }, [fetcher]);

  // A settled result belongs to the fetcher that produced it. The moment the
  // fetcher changes, that result is stale and the answer is `loading` again —
  // no effect, no extra render.
  const state: AsyncState<T> =
    cache && cache.key === fetcher ? cache.settled : fetcher ? LOADING : IDLE;

  return { state, reload };
}
