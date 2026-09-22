'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAsyncData } from '@/hooks/useAsyncData';
import { researchFetch } from '@/lib/researchFetch';
import { parseCorpusPages, parseCorpusStream } from '@/lib/corpusBody';
import { parsePages } from '@/lib/researchBody';
import { corpusPath, queryOf, readCorpusQuery, readCursor, toReadParameters, writeCorpusQuery, writeReadQuery, type CorpusFilters } from '@/lib/corpusQuery';
import { Link } from '@/i18n/navigation';
import { CorpusContextLine } from '@/components/corpus/CorpusContextLine';
import { PageCard } from '@/components/corpus/PageCard';
import { PagesList } from '@/components/corpus/PagesList';
import { Stream } from '@/components/corpus/Stream';
import { ResearchDoor, ResearchFetchBoundary } from './ResearchFetchBoundary';
import { useExtraction } from './ExtractionSheet';
import type { PageEntry } from '@/types/research';
import type { PagesFacetRow } from '@/types/corpus';

// ---------------------------------------------------------------------------
// `/research/corpus` — THE GATED DOOR ONTO THE SAME PAGE. docs/gf-ui-flows.md §27 :863–:876, §24 :656–:657
// ("`/corpus` and `/research/corpus` are ONE page rendered from one read at two scopes"), §28 :878–:885;
// UI plan :750–:760.
//
// THE SAME COMPONENTS, AT `all`, AND THERE IS NO SECOND STREAM. `PagesList`, `PageCard`, `CorpusContextLine`
// and `Stream` are imported from `components/corpus/` — the very modules `/corpus` renders — and
// `one-stream-two-doors` holds that by IMPORT-CLOSURE IDENTITY rather than by resemblance. What differs is
// exactly §27's three additions: the NOT PUBLIC mark (the components' own, drawn from the body's `public`),
// THE EXTRACTION SHEET (the slot this page fills), and the PAGE facet from `list_pages`.
//
// REGION 0'S ROWS ARE THE `pages` FACET; ITS FACTS ARE `list_pages`'. §28 :882–:883 defines the facet at `all`
// as "every surveyed page", carrying `first`, `last` and `entries` — the interval and the record count a row
// draws. §27 :873 names `list_pages` as the source of the rows PER OUTCOME and of `stopPending`. Neither read
// carries the other's fields, so each supplies what it defines, and the two are joined by `trackedUrlId`.
// THE JOIN IS TOTAL: a page in one answer and not in the other is two reads disagreeing about what is
// surveyed — a contradiction, not a gap in a row — so it throws by name.
//
// ONE READ PER VIEW, EXACTLY AS THE PUBLIC TWIN DOES IT. `/corpus` branches on the view and issues the bare
// read OR the filtered one; a client body cannot branch a hook, so the fetcher is `null` — IDLE — on the
// view that does not want it. The result is the same two requests the public door makes, never three.
//
// IT IS CLIENT-RENDERED BELOW A THIN SERVER SHELL because every read here is `/api/research/*` and the bearer
// lives in `window.localStorage` — a Server Component cannot read it (`lib/session.ts` :80; Next's own
// authentication guide :1545–:1547: React context is unavailable to Server Components). The shell carries the
// title, `<main>` and the reading measure.
//
// NOTHING HERE WRITES: every call is `researchFetch`, which is GET-only.
// ---------------------------------------------------------------------------

/**
 * THE PAGE FACET, JOINED — §27 :873's "rows counted per outcome and whether a stop is PENDING", beside the
 * facet row that carries the url, the interval and the count.
 *
 * TOTAL, AND LOUD WHEN IT IS NOT. Both reads answer over the same scope at the same moment; a page present in
 * one and absent from the other is not a row to draw with a hole in it. It is the `requireSnapshotIdentity`
 * shape — a loud guard, never a silent filter — because a page quietly dropped from this list is a page
 * reported as not surveyed.
 */
export function joinPageFacts(facet: readonly PagesFacetRow[], pages: readonly PageEntry[]): Map<string, PageEntry> {
  const byId = new Map<string, PageEntry>();
  for (const row of facet) {
    const facts = pages.find((one) => one.trackedUrlId === row.trackedUrlId);
    if (facts === undefined) throw new Error(`/research/corpus: the corpus facet names a page list_pages does not: ${row.url}`);
    byId.set(row.trackedUrlId, facts);
  }
  return byId;
}

/** §27 :874–:876 — the rows counted, then counted per outcome, and the pending stop as a FACT. */
function PageFacts({ facts }: { facts: PageEntry }) {
  const corpus = useTranslations('research.corpus');
  const outcome = useTranslations('research.outcome');
  const stop = useTranslations('research.stop');
  // ONLY THE OUTCOMES THIS PAGE ACTUALLY HAS. All seven keys arrive zero-filled (A5 :1071), and seven rows of
  // which five say "· 0" is a row of noise around the two facts that matter.
  const drawn = Object.entries(facts.outcomes).filter(([, count]) => count > 0);
  return (
    <span data-page-facts className="flex flex-col gap-1 text-xs text-ink-muted">
      {/* THE TOTAL FIRST, AS BOARD ה DRAWS IT — §27 :873's "rows counted per outcome" is a breakdown, and a
          breakdown reads as a list of unrelated numbers until the whole it divides is stated above it.
          `research.corpus.rows` is the catalogue's own plural for exactly this count and keeps its caller
          here (the frozen file's correction of 2026-09-21). */}
      <span data-page-rows>{corpus('rows', { count: facts.total })}</span>
      <span className="flex flex-wrap gap-2">
        {drawn.map(([name, count]) => (
          <span key={name} data-outcome={name}>
            {outcome(name)} · {count}
          </span>
        ))}
      </span>
      {/* A PENDING STOP IS A FACT IN WORDS (§27 :874–:876; MARKING :576–:578). The marking URL is not read
          on this page at all — `list_pages` does not even carry one — so there is no href to get wrong. */}
      {facts.stopPending ? <span data-stop-pending>{stop('pending')}</span> : null}
    </span>
  );
}

export function ResearchCorpus({ query }: { query: Record<string, string | string[] | undefined> }) {
  const t = useTranslations('corpus');
  // `queryOf` is CALLED — the pure module already owns "Next's `searchParams` as `URLSearchParams`", including
  // the repeated-parameter rule, and a second spelling here would be the defect this repository names.
  const parameters = useMemo(() => queryOf(query), [query]);
  const view = readCorpusQuery(parameters);
  const cursor = readCursor(parameters);
  const filters: CorpusFilters = view.view === 'stream' ? view.filters : {};
  const stream = view.view === 'stream';

  const suffix = writeReadQuery(toReadParameters(filters, 'all', cursor)).toString();
  const streamRead = useMemo(
    () => (stream ? (signal: AbortSignal) => researchFetch(`/api/research/corpus${suffix === '' ? '' : `?${suffix}`}`, parseCorpusStream, { signal }) : null),
    [stream, suffix],
  );
  const facetRead = useMemo(() => (stream ? null : (signal: AbortSignal) => researchFetch('/api/research/corpus', parseCorpusPages, { signal })), [stream]);
  const pagesRead = useMemo(() => (stream ? null : (signal: AbortSignal) => researchFetch('/api/research/pages', parsePages, { signal })), [stream]);

  const streamAnswer = useAsyncData(streamRead);
  const facetAnswer = useAsyncData(facetRead);
  const pagesAnswer = useAsyncData(pagesRead);
  const extraction = useExtraction();

  // THE FILTERS IN FORCE, DRAWN FOR REMOVAL — A2 :1149's rendering of a 400, handed to the boundary. It is the
  // same context line the door beside it draws, at this scope, so a refused filter can be TAKEN OUT rather
  // than pressed again. The facet is empty because a refused read returned none, which is precisely the state
  // the line's own removal chips were written for.
  const refused = (
    <>
      {filters.page === undefined ? null : (
        <Link data-all-pages href={corpusPath('all')} className="self-start text-xs text-ink-muted underline">
          {t('allPages')}
        </Link>
      )}
      <CorpusContextLine filters={filters} count={0} scope="all" />
    </>
  );

  const onward = (next: string): string => {
    const params = writeCorpusQuery(filters);
    params.set('cursor', next);
    return `${corpusPath('all')}?${params.toString()}`;
  };

  return (
    <ResearchDoor states={[streamAnswer.state, facetAnswer.state, pagesAnswer.state]}>
      {stream ? (
        <ResearchFetchBoundary state={streamAnswer.state} refused={refused}>
          {(answer) => {
            const card = filters.page === undefined ? undefined : answer.pages.find((row) => row.trackedUrlId === filters.page);
            return (
              <>
                {/* BOARD ט·ב: THE ONE WAY BACK, above the header — `corpus.allPages` returns to region 0,
                    which is where a page is chosen. It replaces the PAGE chip's removal.

                    THE CONDITION IS THE FILTER IN FORCE, NOT THE CARD. On a 400 the read returned no facet,
                    so there is no card — and that is exactly the moment a reader most needs to take the page
                    off, because the page is how they reached the refusal. */}
                {filters.page === undefined ? null : (
                  <Link data-all-pages href={corpusPath('all')} className="self-start text-xs text-ink-muted underline">
                    {t('allPages')}
                  </Link>
                )}
                {/* THE PAGE CARD IS THE FIRST ELEMENT OF A SINGLE-PAGE VIEW (§24 :752 as RULED 2026-09-21) — a
                    header that says the view is ONE page's, above the filters rather than below them. Its
                    strip is the facet row's own `shape` (§24 :755), never this view's entries. */}
                {card === undefined ? null : <PageCard page={card} scope="all" />}
                <CorpusContextLine filters={filters} count={answer.entries.length} scope="all" />
                {/* A ROW NAMES ITS PAGE ONLY WHEN THE VIEW SPANS PAGES (§24 :763, amended 2026-09-21) — the
                    FILTER's fact, not the card's, exactly as on the public door.
                    „N מוסתרים" IS THE WINDOW'S FIGURE on both views (reverted 2026-09-21; the grounds are in
                    the Stream's own header), so no shape crosses this boundary any more. */}
                <Stream entries={answer.entries} spansPages={filters.page === undefined} extraction={extraction} />
                {answer.nextCursor === null ? null : (
                  <Link data-load-newer href={onward(answer.nextCursor)} className="self-start text-xs text-ink-muted underline">
                    {t('loadNewer')}
                  </Link>
                )}
              </>
            );
          }}
        </ResearchFetchBoundary>
      ) : (
        <ResearchFetchBoundary state={facetAnswer.state}>
          {(rows) => (
            <ResearchFetchBoundary state={pagesAnswer.state}>
              {(pages) => {
                const facts = joinPageFacts(rows, pages);
                return (
                  <PagesList
                    pages={rows}
                    scope="all"
                    facts={(page) => {
                      const found = facts.get(page.trackedUrlId);
                      // The join above already refused a row without facts, so this cannot be missing; the
                      // guard is here because `Map.get` is typed `T | undefined` and a `!` is the assertion
                      // `no-non-null-assertion` refuses. A loud throw, never a silent blank.
                      if (found === undefined) throw new Error(`/research/corpus: no page facts for ${page.url}`);
                      return <PageFacts facts={found} />;
                    }}
                  />
                );
              }}
            </ResearchFetchBoundary>
          )}
        </ResearchFetchBoundary>
      )}
    </ResearchDoor>
  );
}
