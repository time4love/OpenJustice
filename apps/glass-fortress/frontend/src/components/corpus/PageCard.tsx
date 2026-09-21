import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatCaptureDate } from '@/lib/format';
import { claimsPath } from '@/lib/corpusQuery';
import { heldInterval } from '@/lib/pageInterval';
import { MAX_BAR_PX, monthsOf, stripOf } from '@/lib/timeStrip';
import { PageUrl } from './PageUrl';
import type { CorpusScope, PagesFacetRow } from '@/types/corpus';

// ---------------------------------------------------------------------------
// REGION 3 — THE PAGE CARD WITH THE TIME STRIP. docs/gf-ui-flows.md §24 region 3, rulings (a) to (g).
//
// IT IS ONE PAGE'S SHAPE, which is the whole reason it is a HEADING here and never a row in region 0, and why
// (a) draws it only when `page` is set: a stream reached by `?cited=1` or `?since=` alone has no "the page",
// and an aggregate strip across pages would contradict the region's own sentence.
//
// THE GEOMETRY IS `lib/timeStrip.ts`' AND NOT THIS FILE'S. Every ruling with a number in it — the true-time
// axis, the 5px merge, the square-root height, the two tones — is arithmetic, and arithmetic a case can hold
// without a DOM. This component places what that module returns and adds no rule of its own. A second
// implementation of any of it here would be the defect this repository names as its dominant shape.
//
// THE CARD TAKES THE FACET ROW AND NOTHING ELSE (§24 :755, ruled 2026-09-21). It used to take the view's
// `entries` beside it, and drew its text line from the row while drawing its strip from that array — so the
// line said „43 רשומות" over a strip holding whatever the filter and the cursor had left. Dropping the prop
// is the fix rather than a guard on it: with no second source in the signature, the card CANNOT be handed a
// window, so the contradiction is unspellable instead of merely unspelled.
//
// A ROW WHOSE `shape` IS NULL DRAWS NO STRIP AT ALL — not an empty axis and not the months alone. `null` is
// a read that named no page (§28), and a strip with nothing on it reads as "this page never changed", which
// is a claim about the corpus. A loud absence, never a silent half. SO DOES A ROW WITH NO INTERVAL, and it is
// a SECOND condition rather than the same one: the read gives the page it NAMES a shape whatever that page
// holds, so a surveyed page with no captures arrives with empty bins and two null endpoints, and an axis
// drawn between them would be drawn between dates that do not exist (chunk 6, `lib/pageInterval.ts`).
//
// THE STRIP IS AN SVG IN THE PURE MODULE'S OWN UNITS. Its `viewBox` is 319 wide — the drawable width measured
// at 375px — and it scales to whatever the card actually gets, so the marks keep their relative positions at
// every width without the component ever learning a pixel. The module's numbers and the drawing's numbers are
// therefore the same numbers, and the browser reading checks the one thing the suite cannot: that they landed.
//
// NO RAW COLOUR. Every mark is `currentColor` inside a group carrying a token class, so the strip has no
// palette of its own and follows `globals.css` wherever it goes. THE RING IS A SHAPE, not a hue: a cited
// capture is drawn as a ring rather than recoloured, so it survives a greyscale reader — the „א+ג" reasoning
// the letter's fill already stands on.
// ---------------------------------------------------------------------------

/** The pure module's own coordinate space; the drawing scales, the numbers do not move. */
const VIEW_W = 319;
const DOT_R = 2.2;
const BASELINE = MAX_BAR_PX + 6;
const VIEW_H = BASELINE + 14;

export function PageCard({ page, scope }: { page: PagesFacetRow; scope: CorpusScope }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  // THE PAGE'S HELD INTERVAL, ASKED ONCE — the pages list asks the same question through the same function.
  // A PAGE WITH NO CAPTURES IS NOT A PAGE WITH NO SHAPE, and that distinction is the whole of chunk 6's item
  // (4) here: `corpusReads.ts` :1312 gives the NAMED page a shape whatever it holds, so `shapeOf([], [])`
  // arrives as `{ captures: [], diffs: [] }` and NOT as `null`. Guarding the strip on the shape alone would
  // therefore have drawn a bare axis between two dates that do not exist. The interval is the guard.
  const interval = heldInterval(page);
  // ONE NULLABLE VALUE FOR THE WHOLE DRAWING, so the absence is decided once. Two conditions — a null strip
  // and an empty month list — would be two places to get "no shape" right, and the second one would be the
  // one that drew a bare axis under a page that has no shape to show.
  const drawn =
    page.shape === null || interval === null
      ? null
      : { ...stripOf(page.shape, interval.first, interval.last, VIEW_W), months: monthsOf(interval.first, interval.last, VIEW_W), interval };

  return (
    <section data-page-card className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
      {/* The heading names the page the way §4 requires — the domain and path, never the `trackedUrlId`.
          `PageUrl`, CALLED: it owns the isolation and the break for every url on the corpus. */}
      <PageUrl url={page.url} weight="subject" />
      <span className="text-xs text-ink-muted">
        {/* NO INTERVAL WHERE THE PAGE HOLDS NO CAPTURES — the pages list's own rule, one region up. */}
        {interval === null ? null : (
          <>
            <bdi dir="ltr">{t('interval', { first: formatCaptureDate(interval.first, locale), last: formatCaptureDate(interval.last, locale) })}</bdi>
            {' · '}
          </>
        )}
        {t('records', { count: page.entries })}
      </span>

      {/* THE ONE ENTRY TO THE CLAIMS VIEW (§25 :780, :782–:783): it is reached "from the page a reader is
          already looking at, never from the corpus root" — so it lives on the PAGE CARD, which is the one
          element that exists only when `?page=` is set, and never in the sidebar as a category or in the
          lens control beside PAGES and CITED. The page's id travels in the href and is never text (§4). */}
      <Link data-claims-entry href={`${claimsPath(scope)}?page=${page.trackedUrlId}`} className="self-start text-xs text-ink-muted underline">
        {t('claims.entry')}
      </Link>

      {drawn === null ? null : (
        <svg
          data-time-strip
          viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
          className="w-full"
          role="img"
          // The strip is a PICTURE OF THE INTERVAL the line above states in words, so a screen reader is given
          // that sentence rather than a mark-by-mark reading it cannot act on.
          aria-label={t('interval', { first: formatCaptureDate(drawn.interval.first, locale), last: formatCaptureDate(drawn.interval.last, locale) })}
        >
          {/* THE MONTHS FIRST, underneath everything: they are the scale, and without them a 71px void says
              nothing while the same void between two named months says eighty-four days. */}
          <g className="text-line" stroke="currentColor" strokeWidth="1">
            {drawn.months.map((month) => (
              <line key={month.iso} data-month-tick x1={month.x} x2={month.x} y1={BASELINE - 3} y2={BASELINE} />
            ))}
          </g>
          <g className="text-ink-muted" fill="currentColor" fontSize="7">
            {drawn.months.map((month) => (
              <text key={month.iso} data-tick-unit={month.unit} x={month.x} y={VIEW_H - 3} textAnchor="middle">
                {/* THE UNIT IS THE PURE MODULE'S AND THE WORD IS THE LOCALE'S (ruled 2026-09-21): past fifteen
                    months the strip labels YEARS, because 41 month words in 319 units are a grey smear. */}
                {new Date(month.iso).toLocaleDateString(locale, month.unit === 'year' ? { year: 'numeric', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' })}
              </text>
            ))}
          </g>

          {/* THE BARS, each at its interval's MIDPOINT with its height the square root of the chunk count (b, f).
              A dimmed bar is one the significance gate hides from the stream below — DRAWN, and lighter (g):
              de-emphasise, never hide. Drawing only the passed ones would remove every low bar on the real page
              and make the strip "the shape the classifier approved". */}
          {drawn.bars.map((bar) => (
            <rect
              key={`b-${String(bar.x)}`}
              data-strip-bar
              data-strip-dim={bar.dim ? 'true' : undefined}
              data-strip-count={bar.count > 1 ? String(bar.count) : undefined}
              className={bar.dim ? 'text-line' : 'text-ink'}
              fill="currentColor"
              x={bar.x - 1}
              width="2"
              y={BASELINE - bar.height}
              height={bar.height}
            />
          ))}

          {/* THE DOTS on the baseline — the captures, the ticks between the changes. A merged mark carries the
              number of captures under it (e), and it is RINGED when any one of them is cited (c). */}
          <g className="text-ink">
            {drawn.dots.map((dot) => (
              <circle
                key={`d-${String(dot.x)}`}
                data-strip-dot
                data-strip-ringed={dot.ringed ? 'true' : undefined}
                data-strip-count={dot.count > 1 ? String(dot.count) : undefined}
                cx={dot.x}
                cy={BASELINE}
                r={dot.ringed ? DOT_R + 1.4 : DOT_R}
                fill={dot.ringed ? 'none' : 'currentColor'}
                stroke={dot.ringed ? 'currentColor' : 'none'}
                strokeWidth="1"
              />
            ))}
          </g>
        </svg>
      )}
    </section>
  );
}
