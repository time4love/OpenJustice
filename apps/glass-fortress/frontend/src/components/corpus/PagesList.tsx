import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PlatformMark } from '@/components/thesis/PlatformMark';
import { formatCaptureDate } from '@/lib/format';
import { corpusPath } from '@/lib/corpusQuery';
import { heldInterval } from '@/lib/pageInterval';
import { PageUrl } from './PageUrl';
import type { CorpusScope, PagesFacetRow } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE PAGES LIST — docs/gf-ui-flows.md §24 :676–:682 (region 0, the default), §28 :792 (the facet), §27 (the
// gated twin), §4 :167–:178 (no id as text; a page is shown by its domain and path).
//
// ONE ROW PER PAGE URL — the url, the interval, the record count — AND NOTHING ELSE. No time strip on a row:
// a strip is ONE page's shape over time and therefore reads as a heading, and it has that home already at
// region 3. No search and no count over the list, by §33's reasoning for the door — few by design, added slowly.
//
// ONE COMPONENT, TWO SCOPES, and `scope` is a PARAMETER rather than two components. At `public` (here) every row
// is an opened page; at `all` (§27, UI-8's `/research/corpus`) the same list carries the NOT PUBLIC mark on rows
// no published thesis has cited yet. Writing it twice at UI-8 is the defect this repository names as its own.
//
// THE DISCLOSURE RULE IS UPSTREAM OF THIS COMPONENT, AND IT IS ALSO HELD HERE. Its only legal source is the
// `pages` facet at `scope: 'public'` — never `list_pages`, never the facet at `all` — because a public list of
// SURVEYED pages tells a stranger what is under investigation before it is published (§28; architecture §9.5).
// The page performs that read; this component additionally REFUSES to draw a row whose `public` is false while
// the scope is `public`, so a facet that arrived wrong cannot become a leak on the way to the screen. That is
// deliberate belt-and-braces: the read is the rule, and a renderer that trusted its input would publish whatever
// a future refactor handed it.
// ---------------------------------------------------------------------------

/**
 * Rows the scope permits. At `public`, a row that is not `public` is DROPPED — not rendered dimmed, not marked.
 * At `all` every row is drawn and the one that is not public carries the NOT PUBLIC mark (landed at UI-8 chunk 5).
 */
export function rowsForScope(pages: readonly PagesFacetRow[], scope: CorpusScope): PagesFacetRow[] {
  return scope === 'public' ? pages.filter((page) => page.public) : [...pages];
}

/**
 * §27's PAGE FACET, AS A SLOT THIS COMPONENT DOES NOT FILL — the same shape, and the same reason, as the
 * stream's extraction slot.
 *
 * §27 :873 puts the rows-per-outcome and the pending stop on this list at `all`, and both come from
 * `list_pages` — a GATED read whose copy lives in the `research` namespace. A public component that fetched
 * it, or that read those words, would put the gated door inside `/corpus`'s own bundle and inside every scan
 * that follows its imports. So the gated page supplies the facts per row and this places them.
 */
export function PagesList({ pages, scope, facts }: { pages: readonly PagesFacetRow[]; scope: CorpusScope; facts?: (page: PagesFacetRow) => ReactNode }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const rows = rowsForScope(pages, scope);
  // §24 :715's public sentence. A list with no rows says why there are none — "no page is open yet" is a fact
  // about publication, not an error, and it is the one state a reader of a young corpus will meet.
  if (rows.length === 0) return <p data-corpus-empty className="text-sm text-ink-muted">{t('empty')}</p>;
  return (
    <ul data-pages-list className="flex flex-col gap-2">
      {rows.map((page) => {
        // THE INTERVAL IS ASKED FOR ONCE, by the one function both regions share — see `lib/pageInterval.ts`.
        const interval = heldInterval(page);
        return (
          <li key={page.trackedUrlId} data-page-row className="rounded border border-line bg-surface p-3">
            {/* THE NOT PUBLIC MARK, AND THIS IS ITS SECOND HOME (UI plan :751, ui §24 :656 and :701, both of
                which say the pages list at `all` carries it; §27 :866 says the same of the stream's rows).
                `rowsForScope` DROPS such a row at `public`, so the mark is drawn exactly where the row survives
                — and it is `PlatformMark`'s own member, never a second mark component (§21 :626). It sits
                OUTSIDE the `Link`, because a mark inside a tappable row is the nesting `valid-nesting` refuses. */}
            {page.public ? null : <PlatformMark kind="notPublic" />}
            {/* The row's whole target is the stream filtered to this page — `?page=` is one of the five (§24 :684)
                — under the door this scope names, never a base composed here. */}
            <Link href={`${corpusPath(scope)}?page=${page.trackedUrlId}`} className="flex flex-col gap-1">
              {/* THE LABEL IS COMPOSED FROM THE URL, never the id (§4 :167–:178) — `PageUrl`, CALLED, which owns
                  the isolation and the break as of chunk 6. It is the row's TAP, so it carries the underline. */}
              <PageUrl url={page.url} weight="subject" underline />
              <span className="text-xs text-ink-muted">
                {/* THE INTERVAL IS FORMATTED, NEVER PRINTED. The facet's `first` and `last` arrive as 14-DIGIT
                    WAYBACK TIMESTAMPS — read from the running backend, `20211223211940` — and §4 :167–:170 forbids
                    exactly that as text. `formatCaptureDate` is CALLED rather than re-spelled here; it is the same
                    function every capture date on the thesis page goes through. This was a live defect on the built
                    page and only a browser reading found it: the fixture carried ISO dates, so the suite was green
                    over a row printing the raw digits. The count and the dates are LTR inside Hebrew, isolated.

                    A PAGE WITH NO CAPTURES HAS NO INTERVAL, and the row still draws (chunk 6). `first` and `last`
                    are `string | null` on the wire (`corpusReads.ts` :1070–:1071, `held.at(0) ?? null`) and a
                    surveyed page whose captures are acquired by a LATER step sits in exactly that state — one
                    survey away, not a corner. The row says the url and „0 רשומות" and stops: an interval drawn
                    from nothing would be a date this page never held. */}
                {interval === null ? null : (
                  <>
                    <bdi dir="ltr">{t('interval', { first: formatCaptureDate(interval.first, locale), last: formatCaptureDate(interval.last, locale) })}</bdi>
                    {' · '}
                  </>
                )}
                {t('records', { count: page.entries })}
              </span>
            </Link>
            {/* OUTSIDE THE LINK: the facts are read, not tapped, and a block inside an anchor is the nesting
                `valid-nesting` refuses. */}
            {facts?.(page)}
          </li>
        );
      })}
    </ul>
  );
}
