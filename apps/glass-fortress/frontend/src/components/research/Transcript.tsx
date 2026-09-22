'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { ThreadStep, Turn } from '@/types/research';
import { TurnRow } from './TurnRow';

// ---------------------------------------------------------------------------
// THE TRANSCRIPT — docs/gf-ui-flows.md §11 :431–:433 (region 4); §14 :486 (the pane's first tab);
// docs/gf-thesis-flows.md §9 :974 and A4 :1476. Approved board ג3, the layer with „תמליל" open.
//
// OLDEST FIRST, GROUPED UNDER ONE HEADING PER THREAD (§11 :431 as ruled 2026-09-20, R66 „Q1 transcript
// approved"): a framing · a version · a debate on a record · an analysis · a gap · a publication attempt · a
// withdrawal · a note. The ORDER is the body's own — `at`, then the thread, then the row's turn order, then id
// (A4 :1476) — and this component does not re-sort it. A heading opens where a turn's `thread.id` differs from
// the one before it, so a thread returned to later opens a second heading, which is what board ג3 draws: פער
// and גרסה and ניתוח each appear more than once down the layer.
//
// IT OPENS AT THE END, AS A CHAT DOES — RULED 2026-09-21 (the researcher, R68 „אופציה ב”; §11 :432). The
// control is therefore „לקפוץ להתחלה" and NOT a „jump to now": the reader is already at now. That inversion is
// the whole of the ruling, and the plan's :738 still carries the superseded wording.
//
// THE HEADINGS' WORDS ARE CALLED, NEVER RE-SPELLED. Three of the eight are CALL rows in the copy freeze
// (`R63-approved-copy-5bc.md` :145, :150–:151): FRAMING calls `research.tab.framing`, ANALYSIS calls
// `research.tab.analysis`, NOTE calls `theses.provenance.events.NOTE`. The other five have their own rows
// under `research.thread.*`. No new string is added for any of them.
// ---------------------------------------------------------------------------

/**
 * A THREAD'S HEADING WORD, by the freeze's own routing — five own rows and three CALLS.
 *
 * It is a TABLE rather than a template because three of the eight live in another namespace; a computed
 * `research.thread.${step}` would silently answer a missing key for exactly those three, which is the failure
 * `messages-parity` cannot see (a key absent from BOTH catalogues is absent consistently).
 */
const THREAD_KEY: Record<ThreadStep, string> = {
  FRAMING: 'research.tab.framing',
  VERSION: 'research.thread.VERSION',
  DEBATE: 'research.thread.DEBATE',
  ANALYSIS: 'research.tab.analysis',
  GAP: 'research.thread.GAP',
  PUBLICATION: 'research.thread.PUBLICATION',
  WITHDRAWAL: 'research.thread.WITHDRAWAL',
  NOTE: 'theses.provenance.events.NOTE',
};

export function Transcript({ turns, locale }: { turns: readonly Turn[]; locale: string }) {
  const t = useTranslations();
  const research = useTranslations('research');
  const endRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);

  // OPENED SCROLLED TO THE END (§11 :432). `block: 'end'` on the tail marker rather than a computed
  // `scrollTop`, so the pane's own box does the arithmetic and a resize does not strand the reader mid-way.
  // jsdom implements no scrolling and defines no `scrollIntoView`, so the call is guarded: a missing method
  // must never take the page down with it — `Shell.tsx` :160–:163's own lesson, one component over.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [turns]);

  return (
    <section data-transcript={turns.length} className="flex flex-col">
      <div ref={startRef} data-transcript-start />
      <ul className="flex flex-col">
        {turns.map((turn, index) => {
          const previous = turns.at(index - 1);
          // A heading opens for the FIRST turn and wherever the thread changes. `index - 1` is `-1` on the
          // first, and `.at(-1)` answers the LAST element — so the comparison is made explicit rather than
          // left to that wrap-around, which would hide the first heading whenever the last thread matched it.
          const opensThread = index === 0 || previous === undefined || previous.thread.id !== turn.thread.id;
          return (
            <li key={turn.id} className="contents">
              {opensThread ? (
                <h3 data-thread={turn.thread.step} className="mt-3 text-xs font-semibold text-ink-muted">
                  {t(THREAD_KEY[turn.thread.step])}
                </h3>
              ) : null}
              <ul className="contents">
                <TurnRow turn={turn} locale={locale} />
              </ul>
            </li>
          );
        })}
      </ul>
      <div ref={endRef} data-transcript-end />
      {/* THE CONTROL IS „לקפוץ להתחלה" BECAUSE THE PANE OPENS AT NOW (§11 :432). The thread headings are the
          anchors; this is the one that returns to the top of the thread. */}
      <button
        type="button"
        data-jump-to-start
        onClick={() => {
          startRef.current?.scrollIntoView?.({ block: 'start' });
        }}
        className="self-start py-2 text-xs text-ink-muted underline"
      >
        {research('thesis.jumpToStart')}
      </button>
    </section>
  );
}
