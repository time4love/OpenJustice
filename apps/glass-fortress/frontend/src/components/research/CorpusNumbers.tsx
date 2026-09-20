'use client';

import { useTranslations } from 'next-intl';
import { OUTCOMES, type PageEntry } from '@/types/research';

// ---------------------------------------------------------------------------
// THE CORPUS IN NUMBERS — docs/gf-ui-flows.md §29 :903–:904: "pages surveyed · rows by outcome · stops
// pending (a fact) — and the link to `/research/corpus`"; UI plan :722–:723.
//
// ONE READ AND NO SECOND. Every number here is `list_pages`' own answer summed across its rows — the pages,
// the rows per outcome, and `stopPending`, which the backend now carries through `pendingStopOf` (A5 :1071 as
// ruled). §27 :874's older "from `get_article_rules`" would have been one extra read PER PAGE for one boolean.
//
// A PENDING STOP IS TEXT, NEVER A LINK. "a stop is pending; it is resolved in the chat" — because the
// instructions come from the chat before the URL does (MARKING :576–:578), and `no-marking-link-from-research`
// holds exactly that. The marking URL is not even read here: this region has only the count.
// ---------------------------------------------------------------------------

export function CorpusNumbers({ pages }: { pages: readonly PageEntry[] }) {
  const t = useTranslations('research.corpus');
  const outcome = useTranslations('research.outcome');
  const stop = useTranslations('research.stop');

  const rowsPerOutcome = OUTCOMES.map((name) => ({ name, count: pages.reduce((total, page) => total + page.outcomes[name], 0) }));
  const rows = rowsPerOutcome.reduce((total, entry) => total + entry.count, 0);
  const stopsPending = pages.filter((page) => page.stopPending).length;

  return (
    <>
      <p data-corpus-surveyed className="text-sm text-ink-muted">
        {t('surveyed', { count: pages.length })}
      </p>
      <p data-corpus-rows className="text-sm text-ink-muted">
        {t('rows', { count: rows })}
      </p>
      <ul className="flex flex-col gap-1">
        {rowsPerOutcome.map((entry) => (
          <li key={entry.name} data-outcome={entry.name} className="text-xs text-ink-muted">
            {outcome(entry.name)} · {entry.count}
          </li>
        ))}
      </ul>
      <p data-corpus-stops className="text-sm text-ink-muted">
        {t('stopsPending', { count: stopsPending })}
      </p>
      {stopsPending === 0 ? null : (
        <p data-stop-pending className="text-xs text-ink-muted">
          {stop('pending')}
        </p>
      )}
      {/* THE LINK TO `/research/corpus` (§29 :904) ARRIVES WITH THAT PAGE, in the next chunk. A link lands with
          its destination here: `nav-is-the-map`'s own ruling is that an entry leading nowhere is the same
          defect as a category drawn without one, and a researcher on staging would meet a 404 meanwhile. The
          approved word for it (`research.corpus.open`) is already in both catalogues, landed with the rest of
          the frozen namespace, and waits for its anchor. */}
    </>
  );
}
