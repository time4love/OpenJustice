'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { corpusPath } from '@/lib/corpusQuery';
import { OUTCOMES, type PageEntry } from '@/types/research';

// ---------------------------------------------------------------------------
// REGION 4 — THE DOOR TO THE GATED ARCHIVE. docs/gf-ui-flows.md §29 :903–:904 ("the corpus in numbers … and
// the link to `/research/corpus`"); UI plan :722–:723; BOARD ב, approved and frozen 2026-09-21.
//
// ONE CARD, NOT A REGION OF LISTS. The board draws region 4 as a DOOR: its title is where it goes, and under
// it one line of the four numbers that say whether there is anything to go for. The per-outcome breakdown
// moved to `/research/corpus`'s own page rows, where a reader is already looking at the page it describes —
// on the door it was seven lines of arithmetic in front of one link.
//
// THE TITLE IS THE LINK (Q-H: a link lands with its destination, and the destination landed at chunk 5). An
// entry leading nowhere is the defect §32 names, and this one leads to the page beside it.
//
// ONE READ AND NO SECOND. Every number here is `list_pages`' own answer summed across its rows — the pages,
// the captures acquired, the rows never fetched, and `stopPending`, which the backend carries through
// `pendingStopOf` (A5 :1071 as ruled). §27 :874's older "from `get_article_rules`" would have been one extra
// read PER PAGE for one boolean.
//
// A PENDING STOP IS A NUMBER HERE AND A SENTENCE ON THE PAGE. "a stop is pending; it is resolved in the chat"
// belongs beside the page it is pending on (MARKING :576–:578); the door says only how many there are, and
// `no-marking-link-from-research` holds that neither is ever an anchor.
// ---------------------------------------------------------------------------

/** One outcome's total across every page in scope — the read's own numbers, summed and never derived. */
function totalOf(pages: readonly PageEntry[], name: (typeof OUTCOMES)[number]): number {
  return pages.reduce((total, page) => total + page.outcomes[name], 0);
}

export function CorpusNumbers({ pages }: { pages: readonly PageEntry[] }) {
  const t = useTranslations('research.corpus');
  const stopsPending = pages.filter((page) => page.stopPending).length;

  return (
    <section data-corpus-card className="flex flex-col gap-1 rounded border border-line bg-surface p-3">
      <Link data-corpus-open href={corpusPath('all')} className="text-sm text-ink underline">
        {t('open')}
      </Link>
      {/* THE SUMMARY LINE, four approved plurals joined by „·" — the separator the corpus rows already use,
          so the door and the page it opens are punctuated the same way. */}
      <span data-corpus-summary className="text-xs text-ink-muted">
        {t('surveyed', { count: pages.length })}
        {' · '}
        {t('acquired', { count: totalOf(pages, 'ACQUIRED') })}
        {' · '}
        {t('unfetched', { count: totalOf(pages, 'UNFETCHED') })}
        {' · '}
        {t('stopsPending', { count: stopsPending })}
      </span>
    </section>
  );
}
