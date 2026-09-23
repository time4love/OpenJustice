import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { claimsPath, corpusPath, writeClaimsQuery, writeCorpusQuery, type CorpusFilters } from '@/lib/corpusQuery';
import type { CorpusScope } from '@/types/corpus';

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

/**
 * The lenses a reader is offered: PAGES is `/corpus` bare, CITED is the one filter that is a lens (§25), and
 * DOCUMENTS — RULED 2026-09-22 at board י3 (§24 :719) — is the THIRD, at the GATED door only: `list_documents` is a
 * researcher's read, so the public `/corpus` keeps PAGES · CITED. It is not a filter of the stream; it is its own read,
 * reached at `?lens=documents` and drawn by `ResearchDocuments`.
 */
const LENSES = [
  { id: 'pages', filters: {} as CorpusFilters, gatedOnly: false },
  { id: 'cited', filters: { cited: true } as CorpusFilters, gatedOnly: false },
  { id: 'documents', filters: {} as CorpusFilters, gatedOnly: true },
] as const;

type LensId = (typeof LENSES)[number]['id'];

/** THE ONE SPELLING of the documents lens's address — its query parameter and its value. */
export const DOCUMENTS_LENS = { key: 'lens', value: 'documents' } as const;

/**
 * WHICH VIEW THIS LINE IS SERVING — `/corpus`'s stream, or `/corpus/claims`.
 *
 * ONE LINE, TWO VIEWS, AND THE DIFFERENCE IS WHAT EACH READ TAKES. `list_corpus` takes `kind` and `cited`
 * and `list_trajectories` takes neither (§6.1 :237, :247), so a KIND chip drawn on the claims view would
 * send a parameter the route answers 400 `Unrecognized key` to — a control that breaks the page it sits on.
 * The LENSES are the same shape of mistake one level up: PAGES and CITED are `/corpus`'s two doorways, and
 * marking one of them current on a view that is neither tells a reader they are somewhere they are not.
 *
 * IT IS A PARAMETER RATHER THAN A SECOND COMPONENT because §25 :788 says "the same context line": one count,
 * one chip row, one set of rules about what a chip's href is. Two components would be two spellings of that.
 */
export type ContextView = 'stream' | 'claims' | 'documents';

/**
 * A chip's destination, and the ONE place the two views' spellings meet.
 *
 * ON THE CLAIMS VIEW A CHIP KEEPS THE READER ON THE CLAIMS VIEW — removing `since` leaves the same page's
 * claims, not the stream — EXCEPT the PAGE chip, whose removal has nowhere to stay: without a page there is
 * no claims view at all (§25 :783), so it lands on `/corpus` carrying whatever else is set.
 *
 * BOTH SERIALISERS ARE CALLED AND NEITHER IS RE-SPELLED. `writeClaimsQuery` requires a page in its TYPE, so
 * the claims branch cannot be reached without one; `writeCorpusQuery` is the stream's, and is what the PAGE
 * chip's exit uses.
 */
function href(filters: CorpusFilters, view: ContextView, scope: CorpusScope): string {
  if (view === 'documents') return `${corpusPath(scope)}?${DOCUMENTS_LENS.key}=${DOCUMENTS_LENS.value}`;
  if (view === 'claims' && filters.page !== undefined) {
    const { page, since, until } = filters;
    return `${claimsPath(scope)}?${writeClaimsQuery({ page, ...(since === undefined ? {} : { since }), ...(until === undefined ? {} : { until }) }).toString()}`;
  }
  const query = writeCorpusQuery(filters).toString();
  const base = corpusPath(scope);
  return query === '' ? base : `${base}?${query}`;
}

/**
 * One chip: its label, and the link that ADDS or REMOVES it while leaving the others alone.
 *
 * AN ACTIVE CHIP LOOKS ACTIVE, and until this round it did not: `className` was byte-identical either way and
 * the only difference was `data-chip-active`, which is a TEST HOOK that three cases read and no reader can
 * see. §24 :717 calls this row "the ACTIVE filters as chips", so a chip that cannot be told from an inactive
 * one is the control not drawn. It also answers the researcher's "I can't get back": pressing an active chip
 * has always removed its own parameter, and nothing said which was on.
 *
 * THE TOKEN IS THE LENS CONTROL'S OWN, from the same file — `text-ink` against `text-ink-muted` — because two
 * controls in one component marking "this is the current one" two different ways is one rule with two
 * implementations. `aria-current="true"` rather than the lens's `"page"`: a chip is a filter in force, not the
 * page a reader is on.
 */
function Chip({ label, active, to, view, scope }: { label: string; active: boolean; to: CorpusFilters; view: ContextView; scope: CorpusScope }) {
  return (
    <Link
      data-chip
      data-chip-active={active ? 'true' : undefined}
      aria-current={active ? 'true' : undefined}
      href={href(to, view, scope)}
      className={`whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs ${active ? 'text-ink' : 'text-ink-muted'}`}
    >
      {label}
    </Link>
  );
}

/** The two date parameters, as a list, so the chips that draw them are one expression and not two. */
const DATE_FILTERS = ['since', 'until'] as const;

export function CorpusContextLine({ filters, count, scope, view = 'stream' }: { filters: CorpusFilters; count: number; scope: CorpusScope; view?: ContextView }) {
  const t = useTranslations('corpus');
  const active: LensId = view === 'documents' ? 'documents' : filters.cited === true ? 'cited' : 'pages';
  // A SINGLE-PAGE VIEW IS A DIFFERENT VIEW, and the whole of board ט·ב is this one predicate: when a page is
  // in force the PAGE is the SUBJECT — named by the card above this row — so the row holds ROW FILTERS only,
  // and the lens control, which names `/corpus`'s two doorways, would mark one of them current on a view that
  // is neither.
  const singlePage = filters.page !== undefined;
  const without = (field: keyof CorpusFilters): CorpusFilters => {
    const next = { ...filters };
    delete next[field];
    return next;
  };
  // THE CHIPS AS A VALUE, so the row below can ask whether it holds any before it draws its own label.
  //
  // KIND AND CITED ARE `list_corpus`' PARAMETERS AND NOT `list_trajectories`' (§6.1 :237 against :247). Drawn
  // on the claims view they would offer a reader a filter whose press earns a 400 from the route — so the
  // controls are not drawn there at all, rather than drawn and disarmed.
  const chips = [
    ...DATE_FILTERS.filter((field) => filters[field] !== undefined).map((field) => (
      <Chip key={field} label={t(`filters.${field}`)} active to={without(field)} view={view} scope={scope} />
    )),
    ...(view === 'stream'
      ? [
          <Chip key="capture" label={t('kind.capture')} active={filters.kind === 'CAPTURE'} to={filters.kind === 'CAPTURE' ? without('kind') : { ...filters, kind: 'CAPTURE' }} view={view} scope={scope} />,
          <Chip key="diff" label={t('kind.diff')} active={filters.kind === 'DIFF'} to={filters.kind === 'DIFF' ? without('kind') : { ...filters, kind: 'DIFF' }} view={view} scope={scope} />,
          <Chip key="cited" label={t('filters.cited')} active={filters.cited === true} to={filters.cited === true ? without('cited') : { ...filters, cited: true }} view={view} scope={scope} />,
        ]
      : []),
  ];
  return (
    <div data-corpus-context className="mb-3 flex flex-col gap-2 border-b border-line pb-2">
      <span data-corpus-count className="text-xs text-ink-muted">{t('count', { count })}</span>

      {/* ONE HORIZONTALLY SCROLLING ROW (§24 :748). The scrolling is a LAYOUT property and no case can hold
          it — jsdom computes none — so it is a browser reading; what the cases hold is that every chip is a
          query parameter and that the round trip through the URL is an identity.

          THE ROW HOLDS ROW FILTERS ONLY (ui §24 :748 as RULED 2026-09-21): KIND · CITED · SINCE / UNTIL, under
          a visible label. THE PAGE PICKER IS GONE — a chip per page put the whole corpus in a scrolling row in
          front of one page's records, and a page is CHOSEN in region 0, which is the list built for choosing
          one. The page in force is named by the card above and removed by the one link above that.

          AND THE ROW IS DRAWN ONLY WHEN IT HOLDS A CONTROL. On the claims view with no date set it held its
          label and nothing else — measured live on `/he/research/corpus/claims?page=<corona>`, where the whole
          innerText of `data-corpus-filters` was „סינון" over zero chips — because that view draws neither KIND
          nor CITED by design. A label over nothing tells a reader a control is there and then withholds it.
          The condition is the chip list's own LENGTH rather than an enumeration of the views that have chips:
          an enumeration is a second place to keep the list of chips right. */}
      {chips.length === 0 ? null : (
        <div data-corpus-filters className="flex items-baseline gap-2 overflow-x-auto" role="group" aria-label={t('filtersLabel')}>
          <span data-filters-label className="whitespace-nowrap text-xs text-ink-muted">
            {t('filtersLabel')}
          </span>
          {chips}
        </div>
      )}

      {/* WHAT IS STILL MISSING FOR SINCE AND UNTIL IS THE CONTROL THAT SETS THEM, and only that. §24 puts them
          in this row; a DATE is a value a reader supplies, and the picker that supplies it has no approved
          copy and is its own drawing problem, so it is still reported rather than half-drawn. Both parameters
          are honoured wherever they arrive in the URL, and as of this chunk both can be REMOVED once set —
          removal needs no picker, and without it the 400 they can cause had no way out. */}

      {/* THE LENSES ARE `/corpus`'s TWO DOORWAYS (§25 :770), and neither of them is a SINGLE-PAGE view or the
          claims view. Drawing the control on either would mark PAGES or CITED as `aria-current` on a page that
          is neither — an answer to "where am I" that is wrong. The way back from one page is the
          `corpus.allPages` link above its card (board ט·ב), never a chip and never a lens. */}
      {(view === 'stream' && !singlePage) || view === 'documents' ? (
      <nav data-corpus-lenses className="flex flex-wrap gap-3 text-sm" aria-label={t('lenses')}>
        {LENSES.filter((lens) => !lens.gatedOnly || scope === 'all').map((lens) =>
          lens.id === active ? (
            <span key={lens.id} data-lens={lens.id} aria-current="page" className="text-ink">
              {t(`lens.${lens.id}`)}
            </span>
          ) : (
            <Link key={lens.id} data-lens={lens.id} href={href(lens.filters, lens.id === 'documents' ? 'documents' : 'stream', scope)} className="text-ink-muted underline">
              {t(`lens.${lens.id}`)}
            </Link>
          ),
        )}
      </nav>
      ) : null}
    </div>
  );
}
