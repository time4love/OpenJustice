'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAsyncData } from '@/hooks/useAsyncData';
import { researchFetch } from '@/lib/researchFetch';
import { parseClaims } from '@/lib/corpusBody';
import { claimsPath, corpusPath, queryOf, readCorpusFilters, readCursor, writeClaimsQuery, writeCorpusQuery } from '@/lib/corpusQuery';
import { Link } from '@/i18n/navigation';
import { Claims } from '@/components/corpus/Claims';
import { CorpusContextLine } from '@/components/corpus/CorpusContextLine';
import { ResearchDoor, ResearchFetchBoundary } from './ResearchFetchBoundary';

// ---------------------------------------------------------------------------
// `/research/corpus/claims` — THE CLAIMS LENS AT `all` (UI plan :759–:760, "the CLAIMS lens at `all`"); the
// view itself is docs/gf-ui-flows.md §25 :787–:810 and the read is §6.1 :247–:249.
//
// THE SAME COMPONENT, AND THE PAGE RULE IS THE PAGE'S. `Claims` and `CorpusContextLine` are imported from
// `components/corpus/` — the modules `/corpus/claims` renders — so the two doors differ by the read's scope
// and nothing else. §25 :783's "there is no bare `/corpus/claims`" is enforced in the SERVER SHELL above this
// body, where `notFound()` belongs and where the public twin already enforces it, rather than in a client
// component that would have to render before it could refuse.
//
// THE CHIPS THIS VIEW CARRIES are the page and the interval. `list_trajectories` takes neither `kind` nor
// `cited` (§6.1 :247 against :239), so a chip for either would earn a 400 from the route it sits on — which
// is why `CorpusContextLine` is handed `view="claims"` and draws neither.
// ---------------------------------------------------------------------------

export function ResearchClaims({ page, query }: { page: string; query: Record<string, string | string[] | undefined> }) {
  const corpus = useTranslations('corpus');
  const parameters = useMemo(() => queryOf(query), [query]);
  const filters = readCorpusFilters(parameters);
  const cursor = readCursor(parameters);

  // The page is the SHELL's — it refused the request without one — so this carries it rather than re-reading
  // a rule that has already been applied.
  const carried = {
    page,
    ...(filters.since === undefined ? {} : { since: filters.since }),
    ...(filters.until === undefined ? {} : { until: filters.until }),
  };
  const suffix = writeClaimsQuery({ ...carried, ...(cursor === undefined ? {} : { cursor }) }).toString();
  const read = useMemo(() => (signal: AbortSignal) => researchFetch(`/api/research/corpus/claims?${suffix}`, parseClaims, { signal }), [suffix]);
  const answer = useAsyncData(read);

  const refused = (
    <>
      {/* THE WAY BACK IS DRAWN ON THE REFUSAL TOO — a page is REQUIRED here, so without this link a 400 would
          leave a reader on a view they cannot change. */}
      <Link data-all-pages href={corpusPath('all')} className="self-start text-xs text-ink-muted underline">
        {corpus('allPages')}
      </Link>
      <CorpusContextLine filters={carried} count={0} scope="all" view="claims" />
    </>
  );

  const onward = (next: string): string => {
    const params = writeCorpusQuery(carried);
    params.set('cursor', next);
    return `${claimsPath('all')}?${params.toString()}`;
  };

  return (
    <ResearchDoor states={[answer.state]}>
      <ResearchFetchBoundary state={answer.state} refused={refused}>
        {(body) => (
          <>
            {/* BOARD ט·ב: THE ONE WAY BACK, above the view — `corpus.allPages` returns to region 0, which is
                where a page is chosen. It replaces the PAGE chip's removal. */}
            <Link data-all-pages href={corpusPath('all')} className="self-start text-xs text-ink-muted underline">
              {corpus('allPages')}
            </Link>
            <CorpusContextLine filters={carried} count={body.entries.length} scope="all" view="claims" />
            {/* WHICH EMPTY THE VIEW MAY CLAIM — the public twin's own rule, unchanged: only an answered read
                with no date window narrowing it has the standing to say "nothing was tracked on this page".
                Here the read ANSWERED (a refusal never reaches this branch), so the one thing left to ask is
                whether a window narrowed it. */}
            <Claims
              entries={body.entries}
              emptiness={carried.since === undefined && carried.until === undefined ? 'tracked' : 'filtered'}
            />
            {body.nextCursor === null ? null : (
              <Link data-load-newer href={onward(body.nextCursor)} className="self-start text-xs text-ink-muted underline">
                {corpus('loadNewer')}
              </Link>
            )}
          </>
        )}
      </ResearchFetchBoundary>
    </ResearchDoor>
  );
}
