import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { readPublic, readUnfiltered } from '@/lib/api';
import { parseCorpusPages, parseCorpusStream } from '@/lib/corpusBody';
import { corpusPath, queryOf, readCorpusQuery, readCursor, toReadParameters, writeCorpusQuery, writeReadQuery, type CorpusFilters } from '@/lib/corpusQuery';
import { CorpusContextLine } from '@/components/corpus/CorpusContextLine';
import { PagesList } from '@/components/corpus/PagesList';
import { PageCard } from '@/components/corpus/PageCard';
import { Stream } from '@/components/corpus/Stream';
import { Link } from '@/i18n/navigation';

// ---------------------------------------------------------------------------
// `/corpus` — docs/gf-ui-flows.md §24 :676–:717, §28 :792, A1's route table; UI plan UI-7.
//
// THIS ROUTE KILLED A LIVE 404. `Sidebar.tsx` has rendered `<Link href="/corpus">` under הארכיון since UI-4b
// and the route did not exist — the deployed site answered 404 from its own navigation.
//
// REGION 0 IS THE DEFAULT AND THE STREAM IS WHAT A FILTER RETURNS. `/corpus` with none of the five read
// parameters is the PAGES LIST; `page` · `since` · `until` · `kind` · `cited` carry it to the STREAM. The
// choice is `readCorpusQuery`'s and not this page's — one rule, one implementation — and the thesis page's
// `/corpus?page=<trackedUrlId>`, specified in four places, is one of those five doors.
//
// THE READ IS THE DISCLOSURE RULE. `GET /api/corpus` at `scope: 'public'`, and the `pages` FACET of that one
// read — never `list_pages`, never `/api/research/pages`, never the facet at `all`. §28: "no public read lists
// pages (`list_pages` is GATED, and rightly: a public list of surveyed pages is the §9.5 leak)". At `public` the
// facet is exactly the OPENED pages and "reveals nothing the thesis pages' links do not already reveal".
// `pages-list-reads-public-only` holds all three halves of that.
//
// THE PAGE NOW READS ITS QUERY, and that is what makes the stream reachable. Chunk 2 declared `params` alone —
// deliberately, because a control whose parameter the page ignored was the round's own defect — so `?cited=1`
// rendered the identical page and its lens was deleted. `searchParams` is a REQUEST-TIME API and a Promise
// (next 16's `page.js` reference), so reading it opts this route into dynamic rendering, which is what a
// filtered view is: the answer depends on the question.
//
// THE CONTEXT LINE IS REBORN HERE rather than restored. What chunk 2 deleted was a scope label and a lens
// control of one; what returns carries the COUNT, the CHIPS and a lens control of TWO (PAGES · CITED, §25
// :770 and :783). The scope label does NOT return: „דפים פתוחים" names a scope against a second scope this
// public door does not have, and a reader who is not a researcher does not know the closed pages exist.
//
// NO LEGAL DISCLAIMER, ruled 2026-09-19 (the researcher): „יש להסיר את ההסתייגות הלא עקבית מ /corpus". §26
// carries it. `COMPLIANCE.md` names a thesis page and a call page and nothing else, so the public pages that
// carry it are exactly `/theses/[id]`, `/theses/[id]/versions/[v]` and `/call/[id]` — and the same reasoning
// that took it off `/theses` ("a list is neither") takes it off this door and off the three record pages.
// This page rendered it TWICE, once per branch. `no-disclaimer-off-the-thesis` holds the absence in both
// directions, because an absence asserted with no positive control is the easiest green in the world.
//
// A SERVER COMPONENT, and no `loading.tsx` in this segment — the thesis page's ruling (q1 A, 2026-09-16): a
// Suspense boundary streams the response, and a `notFound()` after the first byte answers 200 with a `noindex`
// tag instead of a real 404.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * THE ONE READ (§8): `/api/corpus`, its own `pages` facet, and no second request for the filter.
 *
 * THE SCOPE IS THE ROUTE AND IS NEVER A PARAMETER, which is a STRONGER guarantee than the one this page
 * first implemented and is the backend's own design: `corpusRoutes.ts` :17–:18 — "the corpus reads' scope is
 * `public`, fixed by the route, and a `scope` in the query is a malformed parameter" — and it answers **400
 * `Unrecognized key: "scope"`** to anything that sends one. §6.1 :237 gives the TOOL a `scope` argument, and
 * `/api/research/corpus` is where `all` lives; the public door cannot ask for `all` because there is nothing
 * to ask. So the leak this page must not cause is not reachable from here by a wrong parameter at all —
 * only by calling a different ROUTE, which is what `pages-list-reads-public-only`'s first two arms hold.
 *
 * Measured, not assumed: an earlier draft sent `?scope=public` and the suite was GREEN over it, because the
 * api double is keyed by path and the case staged the same wrong path. A reading from the running backend is
 * what caught it — the fixture-that-does-not-match-reality shape, exactly.
 */
async function pagesInScope(): Promise<ReturnType<typeof parseCorpusPages>> {
  // `readUnfiltered`, because region 0 is the BARE url: it sends no chip, so the route has nothing to refuse
  // and a 400 here would be this page's own bug rather than a reader's filter. The stream below is the half
  // that can meet one, and it is the half that renders the state.
  const answer = await readUnfiltered('/api/corpus', parseCorpusPages);
  // The one 404 is NOT_SURVEYED and NOT_PUBLIC alike (§6's table). A corpus with no opened page is not a 404:
  // it is region 5's sentence, which is why an empty facet returns a body and renders the empty state.
  return answer.status === 404 ? [] : answer.body;
}

/**
 * THE ONE READ, FILTERED (§8: a filter is a parameter of the one read, never a second read). The filters
 * become the read's parameters through `toReadParameters`, which is where the URL's `cited=1` and the read's
 * boolean meet — the only place the two spellings are allowed to know about each other.
 */
async function streamInScope(filters: CorpusFilters, cursor: string | undefined): Promise<ReturnType<typeof parseCorpusStream>> {
  // THE WIRE'S SPELLING IS THE PURE MODULE'S, NEVER THIS PAGE'S. This was six hand-rolled lines, and one of
  // them serialised the read's BOOLEAN `cited` back to the URL's `1` — which `booleanParam` does not coerce,
  // so the route answered 400 and the reader got a 500 on „רשומות מצוטטות". One rule, one implementation:
  // `writeReadQuery` is CALLED, it drops `scope` because the scope is the route, and it is where `cursor` and
  // `limit` will already be right when the stream gains "load older".
  const suffix = writeReadQuery(toReadParameters(filters, 'public', cursor)).toString();
  const answer = await readPublic(`/api/corpus${suffix === '' ? '' : `?${suffix}`}`, parseCorpusStream);
  // §6's table: NOT_SURVEYED and NOT_PUBLIC are ONE 404, and a filter naming a page this scope cannot see is
  // the commonest way to reach it. An empty stream is region 5's sentence, which is a state and not an error.
  // A2 gives 400 THE SAME RENDERING — region 5's filtered sentence with the chips shown for removal — so a
  // malformed filter is answered by the page rather than by a stack trace, and it needs no new string.
  return answer.status === 200 ? answer.body : { entries: [], pages: [], nextCursor: null };
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'corpus' });
  return { title: t('title') };
}

export default async function CorpusPage({ params, searchParams }: PageParams) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'corpus' });
  const query = readCorpusQuery(queryOf(await searchParams));
  if (query.view === 'stream') {
    const cursor = readCursor(queryOf(await searchParams));
    const answer = await streamInScope(query.filters, cursor);
    // THE NEXT WINDOW'S URL — the filters unchanged, the cursor replaced. `writeCorpusQuery` is CALLED for the
    // filters so the link and the chips cannot spell them differently, and the cursor is appended as what it
    // is: an operational parameter, not a sixth chip.
    const onward = (next: string): string => {
      const params = writeCorpusQuery(query.filters);
      params.set('cursor', next);
      return `/corpus?${params.toString()}`;
    };
    // `find` narrows to `PagesFacetRow | undefined` on its own, so the card's presence is a value and never a
    // cast: a page the facet did not return has no url and no interval, and there is nothing to draw.
    const card = query.filters.page === undefined ? undefined : answer.pages.find((row) => row.trackedUrlId === query.filters.page);
    return (
      <main className="page-column flex flex-col gap-3 py-4">
        <h1 className="text-lg text-ink">{t('title')}</h1>
        {/* BOARD ט·ב: THE ONE WAY BACK, above the header — `corpus.allPages` returns to region 0, which is
            where a page is chosen. It replaces the PAGE chip's removal: a chip per page put the whole corpus
            in a scrolling row in front of one page's records.

            THE CONDITION IS THE FILTER IN FORCE, NOT THE CARD. On a 400 the read returned no facet, so there
            is no card — and that is exactly the moment a reader most needs to take the page off, because the
            page is how they reached the refusal. A link drawn only when the answer came back is a link that
            is missing exactly when it is needed, which is the defect the page CHIP was written against and
            which this must not re-introduce. */}
        {query.filters.page === undefined ? null : (
          <Link data-all-pages href={corpusPath('public')} className="self-start text-xs text-ink-muted underline">
            {t('allPages')}
          </Link>
        )}
        {/* THE PAGE CARD IS THE FIRST ELEMENT OF A SINGLE-PAGE VIEW (§24 :752 as RULED 2026-09-21) — a header
            that says the view is ONE page's, above the filters rather than below them. Ruling (a) still holds
            the condition: the card is ONE page's shape, so a stream reached by `?cited=1`, `?since=` or
            `?until=` alone carries none and begins at the filters. The facet supplies the url and the
            interval, so a filter naming a page this scope cannot see draws no card either — the same 404 the
            stream already renders as its empty state.

            IT IS HANDED THE FACET ROW AND NOTHING ELSE (§24 :755, ruled 2026-09-21). The strip's source is
            that row's own `shape`, computed with the read and BEFORE the filter and the cursor — so this page
            cannot hand the card a window even by accident, which is what it used to do. */}
        {card === undefined ? null : <PageCard page={card} scope="public" />}
        <CorpusContextLine filters={query.filters} count={answer.entries.length} scope="public" />
        {/* THE HIDDEN-COUNT LINE READS THE SAME SHAPE THE STRIP DOES, for the same reason: on a single-page
            view „N מוסתרים" is the PAGE's figure and not this window's. With no page there is no shape and
            the line stays the window's, which is all a cross-page stream knows. */}
        <Stream entries={answer.entries} shape={card?.shape ?? null} />
        {/* „טען חדשים יותר" — §24 region 4's forward control, and the ONE the read can serve. MEASURED on the
            running backend: the window is OLDEST FIRST (23.12.2021 → 17.3.2022 at `limit=10`) and the cursor
            advances toward NEWER, so forward is „newer" and this control belongs at the FOOT of the stream.
            `nextCursor === null` IS the end — one fact, not a second `hasMore` beside it.
            WHY THE URL AND NOT CLIENT STATE: this page is a Server Component and `readPublic` is the one door
            to the read, with its own token, its own 404 and its own 400. A browser fetch would be a SECOND
            door to the same read, with those three implemented twice — the duplication this round has spent
            itself removing. The URL also makes a deep window linkable, which is region 2's own principle for
            the filters, and it is why the cursor is read from `searchParams` rather than held in a component. */}
        {answer.nextCursor === null ? null : (
          <Link data-load-newer href={onward(answer.nextCursor)} className="self-start text-xs text-ink-muted underline">
            {t('loadNewer')}
          </Link>
        )}
      </main>
    );
  }
  const pages = await pagesInScope();
  // `page-column` IS THE SHELL'S OWN READING MEASURE (`globals.css`: `max-width: var(--reading-column)`,
  // `margin-inline: auto`, `padding-inline: 1rem`) and is what every public page already uses. An earlier draft
  // of this page spelled `max-w-prose` instead — 65ch, which resolves to 422.5px and is WIDER THAN A 375px
  // PHONE, so the centre's scrollport shifted and the RTL row painted 67px off the left edge. The suite could
  // not see it (jsdom computes no layout) and `document.documentElement.scrollWidth` stayed 375 because the
  // shell clips; only a SCREENSHOT did. One rule, one implementation: this page CALLS the primitive.
  return (
    <main className="page-column flex flex-col gap-3 py-4">
      <h1 className="text-lg text-ink">{t('title')}</h1>
      <PagesList pages={pages} scope="public" />
    </main>
  );
}

