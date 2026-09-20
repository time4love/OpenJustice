import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { displayUrl, formatCaptureDate } from '@/lib/format';
import { MAX_BAR_PX, monthsOf, stripOf } from '@/lib/timeStrip';
import type { CorpusEntry, PagesFacetRow } from '@/types/corpus';

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

export function PageCard({ page, entries }: { page: PagesFacetRow; entries: readonly CorpusEntry[] }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const { dots, bars } = stripOf(entries, page.first, page.last, VIEW_W);
  const months = monthsOf(page.first, page.last, VIEW_W);

  return (
    <section data-page-card className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
      {/* The heading names the page the way §4 requires — the domain and path, never the `trackedUrlId` — and
          the url is LTR inside a Hebrew document, so it is isolated. */}
      <bdi dir="ltr" data-page-card-url className="break-all text-sm text-ink">
        {displayUrl(page.url)}
      </bdi>
      <span className="text-xs text-ink-muted">
        <bdi dir="ltr">{t('interval', { first: formatCaptureDate(page.first, locale), last: formatCaptureDate(page.last, locale) })}</bdi>
        {' · '}
        {t('records', { count: page.entries })}
      </span>

      {/* THE ONE ENTRY TO THE CLAIMS VIEW (§25 :780, :782–:783): it is reached "from the page a reader is
          already looking at, never from the corpus root" — so it lives on the PAGE CARD, which is the one
          element that exists only when `?page=` is set, and never in the sidebar as a category or in the
          lens control beside PAGES and CITED. The page's id travels in the href and is never text (§4). */}
      <Link data-claims-entry href={`/corpus/claims?page=${page.trackedUrlId}`} className="self-start text-xs text-ink-muted underline">
        {t('claims.entry')}
      </Link>

      <svg
        data-time-strip
        viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
        className="w-full"
        role="img"
        // The strip is a PICTURE OF THE INTERVAL the line above states in words, so a screen reader is given
        // that sentence rather than a mark-by-mark reading it cannot act on.
        aria-label={t('interval', { first: formatCaptureDate(page.first, locale), last: formatCaptureDate(page.last, locale) })}
      >
        {/* THE MONTHS FIRST, underneath everything: they are the scale, and without them a 71px void says
            nothing while the same void between two named months says eighty-four days. */}
        <g className="text-line" stroke="currentColor" strokeWidth="1">
          {months.map((month) => (
            <line key={month.iso} data-month-tick x1={month.x} x2={month.x} y1={BASELINE - 3} y2={BASELINE} />
          ))}
        </g>
        <g className="text-ink-muted" fill="currentColor" fontSize="7">
          {months.map((month) => (
            <text key={month.iso} x={month.x} y={VIEW_H - 3} textAnchor="middle">
              {new Date(month.iso).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' })}
            </text>
          ))}
        </g>

        {/* THE BARS, each at its interval's MIDPOINT with its height the square root of the chunk count (b, f).
            A dimmed bar is one the significance gate hides from the stream below — DRAWN, and lighter (g):
            de-emphasise, never hide. Drawing only the passed ones would remove every low bar on the real page
            and make the strip "the shape the classifier approved". */}
        {bars.map((bar) => (
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
          {dots.map((dot) => (
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
    </section>
  );
}
