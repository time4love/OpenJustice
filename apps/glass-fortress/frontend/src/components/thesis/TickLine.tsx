import { Tick, domainOfCitation, tickFace } from './Tick';
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
            <Tick key={`${citation.kind}:${citation.name}`} {...tickFace(citation, locale)} />
          ))}
        </p>
      ))}
    </>
  );
}
