'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fetchJson } from '@/lib/api';
import { parseChainAnswer } from '@/lib/corpusBody';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { ChainAnswer } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CHAIN CHECK, ON THE READER'S PRESS — docs/gf-ui-flows.md §26 :829–:832: "a CHAIN CHECK on demand — one
// button whose moment is defined by the reader's doubt"; UI plan :640, "Nothing is fetched from the chain on
// render."
//
// NOTHING IS FETCHED UNTIL THE PRESS, and that is structural rather than remembered: `useAsyncData` fetches
// when it is handed a fetcher and is IDLE when handed `null`, so the null-until-pressed state cannot issue a
// request. A `useEffect` that checked a flag would be one edit away from firing on mount, which at the
// archive's rate (UI plan :678) is a request per reader per page rather than per doubt.
//
// THE 503 IS AN ANSWER AND NOT A FAILURE (the researcher's ruling, 2026-09-19): `fetchJson`'s `answers` opt-in
// hands the BODY back for the statuses the caller names, and `parseChainAnswer` narrows CHAIN_UNAVAILABLE into
// the union. Thrown instead, the body would be lost and this component would have to INVENT the refusal from a
// status — and a reader would be shown a failed RECORD where only the CHECK failed (evidence A4 :1115).
//
// IT RE-VERIFIES NOTHING (§21 :629). Every value here is a field of the route's answer; the page computes no
// hash, compares nothing itself, and holds no verdict of its own.
//
// THE PAGE RECORDS NOTHING ABOUT THE PRESS (UI plan :678) — no count, no beacon, no state that outlives the
// render. The press rate is read from the BACKEND's log, where it already is.
// ---------------------------------------------------------------------------

export function CaptureChainCheck({ trackedUrlId, capture }: { trackedUrlId: string; capture: string }) {
  const t = useTranslations('record.chain');
  const anchor = useTranslations('corpus.anchor');
  const record = useTranslations('record');
  const verify = useTranslations('record.verify');
  const [pressed, setPressed] = useState(false);

  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<ChainAnswer> =>
      parseChainAnswer(
        await fetchJson<unknown>(`/api/pages/${trackedUrlId}/captures/${capture}/chain`, {
          signal,
          // THE ONE STATUS THIS READ NAMES. Every other failure stays a failure.
          answers: [503],
          offline: t('unavailable'),
        }),
      ),
    [trackedUrlId, capture, t],
  );

  const { state } = useAsyncData<ChainAnswer>(pressed ? fetcher : null);

  return (
    <div data-chain-check className="space-y-2">
      {pressed ? null : (
        <button type="button" data-chain-press onClick={() => { setPressed(true); }} className="underline">
          {t('press')}
        </button>
      )}

      {/* NO TEXT WHILE IT RUNS — a sentence here would be copy, and copy lands approved or not at all. */}
      {state.status === 'loading' ? <div data-chain-loading aria-hidden="true" className="h-4 w-1/2 animate-pulse rounded bg-paper-deep" /> : null}

      {/* A STATEMENT ABOUT THE CHECK, never about the record (A4 :1115), AND IT IS THIS COMPONENT'S OWN
          APPROVED SENTENCE — never `state.error.message`. For any status the caller did not name,
          `fetchJson` throws `body.message ?? \`Error ${status}\``: the backend's own English, or a bare
          code. Rendering that would put unapproved words in front of a reader through the one path nobody
          reviews, and „Error 500" is not a statement about anything a reader can act on. The thrown message
          is still what the hook holds and what a developer reads; it is not copy. */}
      {state.status === 'error' ? <p data-chain-unavailable className="record-meta">{t('unavailable')}</p> : null}

      {state.status === 'ok' && !state.data.available ? (
        <p data-chain-unavailable className="record-meta">{t('unavailable')}</p>
      ) : null}

      {state.status === 'ok' && state.data.available
        ? state.data.captures
            .filter((row) => row.capture === capture)
            .map((row) => (
              <ul key={row.capture} data-chain-result className="record-meta space-y-1">
                <li>{row.isRegistered ? t('registered') : t('notRegistered')}</li>
                <li>{row.attributed ? anchor('attributed') : anchor('notYet')}</li>
                <li>{row.anchoredHashMatchesDocumentHash ? record('hashMatches') : t('differs')}</li>
                <li>
                  {row.storedVerdict === null
                    ? t('neverChecked')
                    : t('stored', { verdict: row.storedVerdict.verdict, version: row.storedVerdict.verifierVersion })}
                </li>
                {/* THE REGISTRY INDEX HAS NO SOURCE UNTIL THIS ANSWER — `get_capture`'s row does not carry it,
                    so the VERIFY disclosure shows nothing for it on render and it arrives here. */}
                {row.registryIndex === null ? null : (
                  <li>
                    {verify('registryIndex')} · <bdi dir="ltr">{String(row.registryIndex)}</bdi>
                  </li>
                )}
              </ul>
            ))
        : null}
    </div>
  );
}
