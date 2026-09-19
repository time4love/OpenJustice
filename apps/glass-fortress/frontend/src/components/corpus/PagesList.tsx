import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { displayUrl, formatCaptureDate } from '@/lib/format';
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
 * At `all` every row is drawn and §27's NOT PUBLIC mark is UI-8's to add.
 */
export function rowsForScope(pages: readonly PagesFacetRow[], scope: CorpusScope): PagesFacetRow[] {
  return scope === 'public' ? pages.filter((page) => page.public) : [...pages];
}

export function PagesList({ pages, scope }: { pages: readonly PagesFacetRow[]; scope: CorpusScope }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const rows = rowsForScope(pages, scope);
  // §24 :715's public sentence. A list with no rows says why there are none — "no page is open yet" is a fact
  // about publication, not an error, and it is the one state a reader of a young corpus will meet.
  if (rows.length === 0) return <p data-corpus-empty className="text-sm text-ink-muted">{t('empty')}</p>;
  return (
    <ul data-pages-list className="flex flex-col gap-2">
      {rows.map((page) => (
        <li key={page.trackedUrlId} data-page-row className="rounded border border-line bg-surface p-3">
          {/* The row's whole target is the stream filtered to this page — `?page=` is one of the five (§24 :684). */}
          <Link href={`/corpus?page=${page.trackedUrlId}`} className="flex flex-col gap-1">
            {/* THE LABEL IS COMPOSED FROM THE URL, never the id (§4 :167–:178). The url is LTR inside a Hebrew
                document, so it is isolated — an unisolated url reorders the punctuation around it. */}
            <bdi dir="ltr" className="break-all text-sm text-ink underline">
              {displayUrl(page.url)}
            </bdi>
            <span className="text-xs text-ink-muted">
              {/* THE INTERVAL IS FORMATTED, NEVER PRINTED. The facet's `first` and `last` arrive as 14-DIGIT
                  WAYBACK TIMESTAMPS — read from the running backend, `20211223211940` — and §4 :167–:170 forbids
                  exactly that as text. `formatCaptureDate` is CALLED rather than re-spelled here; it is the same
                  function every capture date on the thesis page goes through. This was a live defect on the built
                  page and only a browser reading found it: the fixture carried ISO dates, so the suite was green
                  over a row printing the raw digits. The count and the dates are LTR inside Hebrew, isolated. */}
              <bdi dir="ltr">{t('interval', { first: formatCaptureDate(page.first, locale), last: formatCaptureDate(page.last, locale) })}</bdi>
              {' · '}
              {t('records', { count: page.entries })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
