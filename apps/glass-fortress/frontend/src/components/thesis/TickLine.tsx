import { domainOfCitation, evidenceChipKind } from './Tick';
import { CitationChip } from './CitationChip';
import type { Citation } from '@/types/thesis';

// ---------------------------------------------------------------------------
// THE TICK LINE — docs/gf-ui-refactor-plan.md §10 :1121 ("the TICK LINE of the cited captures under
// the byline"); canvas page 2 board A and page 1 board B, `build.mjs`'s `.tickline`.
//
// The cited records of one page, in the body's order, under the domain they belong to and along a
// hairline rail: what the reader is about to walk through, before they walk through it.
//
// A THESIS CITING TWO PAGES GETS TWO LINES, because the domain heads the line and a line with two
// domains would name neither. A thesis with no citation renders NOTHING — that is a real state of a
// published thesis, not an empty rail.
//
// EVERY TICK HERE IS THE SAME CONTROL AS A TICK IN THE TEXT (R59 · F3). It rendered a bare `<Tick>`
// until the staging exercise, and the researcher read the result exactly: the tick line's dates were
// dead and the text's were live. Measured on `aa00640` — header 3 ticks `isButton false`, article 4
// ticks `isButton true`: THE SAME PILL, TWO BEHAVIOURS, which teaches a reader that a date is
// sometimes pressable and sometimes not.
//
// SO IT RENDERS `<CitationChip>`, the one control that already routes a press through `useOpenRecord`
// — called, never re-spelled — exactly as `Appeals.tsx` does for a request's `restsOn`. This file
// STAYS A SERVER COMPONENT: `CitationChip` carries the `'use client'` directive, so it is the client
// boundary and a server component may render it directly with serialisable props (next docs,
// server-and-client-components :113, :178). Nothing else moves; the domain, the rail and the grouping
// are unchanged.
// ---------------------------------------------------------------------------

export function TickLine({ citations, locale }: { citations: readonly Citation[]; locale: string }) {
  const byDomain = new Map<string, Citation[]>();
  for (const citation of citations) {
    const domain = domainOfCitation(citation);
    if (domain === null) continue;
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), citation]);
  }
  if (byDomain.size === 0) return null;
  return (
    <>
      {[...byDomain].map(([domain, cited]) => (
        <p key={domain} data-tick-line className="tick-line">
          <bdi dir="ltr" className="tick-line-domain">
            {domain}
          </bdi>
          <span className="tick-line-rail" aria-hidden="true" />
          {cited.map((citation) => (
            <CitationChip
              key={`${citation.kind}:${citation.name}`}
              kind={evidenceChipKind(citation)}
              name={citation.name}
              source={`#ev_${citation.name}`}
              citation={citation}
              locale={locale}
            />
          ))}
        </p>
      ))}
    </>
  );
}
