import { formatDate } from '@/lib/format';

/**
 * The author's handle and the date the version was published (docs/gf-ui-flows.md §17 :530). The date is
 * isolated: a date inside Hebrew reverses the line otherwise (§17 :533–:534). The handle is DATA — the body's.
 *
 * THE COPY CONTROL IS A CHILD OF THIS ROW, never its sibling. Canvas board 3A draws `.by > .copy` — the
 * handle, the date and the control on one credit line — and the build had it as `BUTTON < SPAN < HEADER`,
 * a sibling, which the researcher read on staging as "why is it there?" (`handoffs/R59-staging-exercise-
 * 2026-09-17.md`, item 3). It arrives as `children` rather than as a prop so this component stays
 * presentational and the page keeps deciding what the control copies and how it is labelled.
 *
 * `children` is PHRASING CONTENT because this is a `<p>`: `CopyableCode` renders a `<span>` holding a
 * `<code>` and a `<button>`, all of which nest legally here — `valid-nesting` holds the rule over the
 * whole page and would redden on a block element put inside.
 */
export function Byline({ author, at, locale, children }: { author: string; at: string | null; locale: string; children?: React.ReactNode }) {
  return (
    <p data-byline className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
      <span>
        <bdi>{author}</bdi>
        {at === null ? null : (
          <>
            {' · '}
            <bdi dir="ltr">{formatDate(at, locale)}</bdi>
          </>
        )}
      </span>
      {children}
    </p>
  );
}
