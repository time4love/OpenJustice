import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { displayUrl } from '@/lib/format';
import { writeCorpusQuery, type CorpusFilters } from '@/lib/corpusQuery';
import type { PagesFacetRow } from '@/types/corpus';

// ---------------------------------------------------------------------------
// REGION 1, WRITTEN FRESH — docs/gf-ui-flows.md §24 region 1 and region 2 (:748–:751); §25 :770 and :783.
//
// THE WHOLE LINE WAS DELETED AT CHUNK 2, and this is its rebirth rather than its restoration. What it carried
// then was a SCOPE LABEL and a lens control of one, and both were wrong: „דפים פתוחים" names a scope against a
// second scope this public door does not have — a reader who is not a researcher does not know the closed
// pages exist — and one lens is not a control. What makes this a LINE rather than a label is what it carries
// now: the COUNT the read returned so far, the FILTER CHIPS, and a lens control of TWO.
//
// THE LENS SET IS PAGES · CITED, and there is no third. §25 :770 removed the STREAM lens (the stream is what a
// filter RETURNS, not a doorway) and relocated CLAIMS to a single page's own view, :783: "there is no bare
// `/corpus/claims`, because a claims list with no page is the list this amendment removes".
//
// EVERY CHIP IS A QUERY PARAMETER OF THE ONE READ (§8; §24 :749–:751), and this component computes NONE of
// that rule: `writeCorpusQuery` is CALLED for every href, so the chips, the URL and the read's parameters
// cannot drift apart. A chip that built its own query string would be the second spelling this repository
// names as its dominant defect — and `lib/corpusQuery.ts` is pure precisely so that the rule can be held
// without rendering anything.
//
// A CHIP'S HREF IS THE FILTER SET WITH THAT ONE CHIP CHANGED, which is what makes a filtered view linkable:
// pressing PAGE while SINCE is set keeps SINCE. Removing a chip is the same operation with the field
// dropped, and that is how §24's region 5 shows "the filters … for removal".
// ---------------------------------------------------------------------------

/** The lenses a reader is offered: PAGES is `/corpus` bare, CITED is the one filter that is a lens (§25). */
const LENSES = [
  { id: 'pages', filters: {} as CorpusFilters },
  { id: 'cited', filters: { cited: true } as CorpusFilters },
] as const;

type LensId = (typeof LENSES)[number]['id'];

/** `/corpus` with these filters — one spelling, through the pure module, for every link this line draws. */
function href(filters: CorpusFilters): string {
  const query = writeCorpusQuery(filters).toString();
  return query === '' ? '/corpus' : `/corpus?${query}`;
}

/** One chip: its label, and the link that ADDS or REMOVES it while leaving the others alone. */
function Chip({ label, active, to }: { label: string; active: boolean; to: CorpusFilters }) {
  return (
    <Link data-chip data-chip-active={active ? 'true' : undefined} href={href(to)} className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-ink-muted">
      {label}
    </Link>
  );
}

export function CorpusContextLine({ filters, count, pages }: { filters: CorpusFilters; count: number; pages: readonly PagesFacetRow[] }) {
  const t = useTranslations('corpus');
  const active: LensId = filters.cited === true ? 'cited' : 'pages';
  const without = (field: keyof CorpusFilters): CorpusFilters => {
    const next = { ...filters };
    delete next[field];
    return next;
  };
  return (
    <div data-corpus-context className="mb-3 flex flex-col gap-2 border-b border-line pb-2">
      <span data-corpus-count className="text-xs text-ink-muted">{t('count', { count })}</span>

      {/* THE CHIPS, one horizontally scrolling row (§24 :748). The scrolling is a LAYOUT property and no case
          can hold it — jsdom computes none — so it is a browser reading; what the cases hold is that every
          chip is a query parameter and that the round trip through the URL is an identity. */}
      <div data-corpus-filters className="flex gap-2 overflow-x-auto" role="group" aria-label={t('filters.page')}>
        {pages.map((page) => (
          <Chip
            key={page.trackedUrlId}
            label={displayUrl(page.url)}
            active={filters.page === page.trackedUrlId}
            to={filters.page === page.trackedUrlId ? without('page') : { ...filters, page: page.trackedUrlId }}
          />
        ))}

        {/* EVERY FILTER IN FORCE IS DRAWN, AND THE FACET IS NOT WHAT DECIDES THAT. The chips above are the
            PICKER — one per page the read returned — and on a 400 the read returned none, so the page a
            reader actually set had no chip at all and could not be removed. A2 gives the 400 state as "the
            filters shown for removal", and the filters in force are `filters`, never the facet: a chip drawn
            only when the answer came back is a chip that is missing exactly when it is needed.

            THE LABEL IS THE CATALOGUE'S, NEVER THE ID. A page the facet did not return has no url here, and
            §4 forbids showing the `trackedUrlId`; `filters.page` („דף") is the approved word the chip group
            already uses for this parameter, so nothing new is invented and no id reaches a reader.

            SINCE and UNTIL get the same treatment and for the same reason — REMOVAL is not a picker. Chunk 5a
            drew no date control because setting a date is its own drawing problem with no approved copy, and
            that stands: these chips appear ONLY when the parameter is already in the URL, and their one act
            is to take it out. Without them a reader who reached the 400 through `?since=` could press every
            chip on the page and keep sending the value that caused it — measured on the real body, where all
            three hrefs carried `since=garbage` forward. */}
        {filters.page !== undefined && !pages.some((page) => page.trackedUrlId === filters.page) ? (
          <Chip label={t('filters.page')} active to={without('page')} />
        ) : null}
        {filters.since === undefined ? null : <Chip label={t('filters.since')} active to={without('since')} />}
        {filters.until === undefined ? null : <Chip label={t('filters.until')} active to={without('until')} />}
        <Chip label={t('kind.capture')} active={filters.kind === 'CAPTURE'} to={filters.kind === 'CAPTURE' ? without('kind') : { ...filters, kind: 'CAPTURE' }} />
        <Chip label={t('kind.diff')} active={filters.kind === 'DIFF'} to={filters.kind === 'DIFF' ? without('kind') : { ...filters, kind: 'DIFF' }} />
        <Chip label={t('filters.cited')} active={filters.cited === true} to={filters.cited === true ? without('cited') : { ...filters, cited: true }} />
      </div>

      {/* WHAT IS STILL MISSING FOR SINCE AND UNTIL IS THE CONTROL THAT SETS THEM, and only that. §24 puts them
          in this row; a DATE is a value a reader supplies, and the picker that supplies it has no approved
          copy and is its own drawing problem, so it is still reported rather than half-drawn. Both parameters
          are honoured wherever they arrive in the URL, and as of this chunk both can be REMOVED once set —
          removal needs no picker, and without it the 400 they can cause had no way out. */}

      <nav data-corpus-lenses className="flex flex-wrap gap-3 text-sm" aria-label={t('lenses')}>
        {LENSES.map((lens) =>
          lens.id === active ? (
            <span key={lens.id} data-lens={lens.id} aria-current="page" className="text-ink">
              {t(`lens.${lens.id}`)}
            </span>
          ) : (
            <Link key={lens.id} data-lens={lens.id} href={href(lens.filters)} className="text-ink-muted underline">
              {t(`lens.${lens.id}`)}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
