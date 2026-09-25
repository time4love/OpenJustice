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
//
// A DOCUMENT'S CHIP JOINS THE STRIP at document step 33 (board ד2·י, the captures strip): after the page's ticks.
// ---------------------------------------------------------------------------

export function TickLine({ citations, locale }: { citations: readonly Citation[]; locale: string }) {
  const byDomain = new Map<string, Citation[]>();
  for (const citation of citations) {
    const domain = domainOfCitation(citation);
    if (domain === null) continue;
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), citation]);
  }
  // THE CITED DOCUMENTS — board ד2·י draws the captures strip with the document's chip AFTER the page's dated ticks,
  // on the same line (ui §17 :540 as ruled; document step 33). A document has no domain to head a line of its own.
  const documents = citations.filter((citation) => citation.kind === 'DOCUMENT');
  if (byDomain.size === 0 && documents.length === 0) return null;
  const lines = [...byDomain];
  const chipsOf = (cited: readonly Citation[]) =>
    cited.map((citation) => (
      <CitationChip
        key={`${citation.kind}:${citation.name}`}
        kind={evidenceChipKind(citation)}
        name={citation.name}
        source={`${citation.kind === 'DOCUMENT' ? '#doc_' : '#ev_'}${citation.name}`}
        citation={citation}
        locale={locale}
      />
    ));
  return (
    <>
      {lines.map(([domain, cited], index) => (
        <p key={domain} data-tick-line className="tick-line">
          <bdi dir="ltr" className="tick-line-domain">
            {domain}
          </bdi>
          <span className="tick-line-rail" aria-hidden="true" />
          {chipsOf(cited)}
          {/* The documents close the LAST line, as board ד2·י draws them after its one page's ticks. */}
          {index === lines.length - 1 ? chipsOf(documents) : null}
        </p>
      ))}
      {/* A thesis citing documents and no page: the documents' own line, with no domain and no rail — the board
          draws no such thesis, and this shape is a QUESTION for the researcher at the page (the chunk-6 report). */}
      {lines.length === 0 ? (
        <p data-tick-line className="tick-line">
          {chipsOf(documents)}
        </p>
      ) : null}
    </>
  );
}
