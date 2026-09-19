import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { readPublic } from '@/lib/api';
import { parseCorpusPages, parseCorpusStream } from '@/lib/corpusBody';
import { readCorpusQuery, toReadParameters, type CorpusFilters } from '@/lib/corpusQuery';
import { CorpusContextLine } from '@/components/corpus/CorpusContextLine';
import { PagesList } from '@/components/corpus/PagesList';
import { Stream } from '@/components/corpus/Stream';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';

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
// A SERVER COMPONENT, and no `loading.tsx` in this segment — the thesis page's ruling (q1 A, 2026-09-16): a
// Suspense boundary streams the response, and a `notFound()` after the first byte answers 200 with a `noindex`
// tag instead of a real 404.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The URL's query as `URLSearchParams`, which is what the pure module reads.
 *
 * A REPEATED PARAMETER TAKES ITS FIRST VALUE. Next hands `?page=a&page=b` to a page as an ARRAY, and the read
 * takes one page; `readCorpusFilters` would see neither. Taking the first is the same answer a browser's own
 * `URLSearchParams.get` gives, so the page agrees with every other reader of the same URL.
 */
function queryOf(searchParams: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const one = Array.isArray(value) ? value.at(0) : value;
    if (one !== undefined) params.set(key, one);
  }
  return params;
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
  const answer = await readPublic('/api/corpus', parseCorpusPages);
  // The one 404 is NOT_SURVEYED and NOT_PUBLIC alike (§6's table). A corpus with no opened page is not a 404:
  // it is region 5's sentence, which is why an empty facet returns a body and renders the empty state.
  return answer.status === 404 ? [] : answer.body;
}

/**
 * THE ONE READ, FILTERED (§8: a filter is a parameter of the one read, never a second read). The filters
 * become the read's parameters through `toReadParameters`, which is where the URL's `cited=1` and the read's
 * boolean meet — the only place the two spellings are allowed to know about each other.
 */
async function streamInScope(filters: CorpusFilters): Promise<ReturnType<typeof parseCorpusStream>> {
  const read = toReadParameters(filters, 'public');
  const query = new URLSearchParams();
  if (read.page !== undefined) query.set('page', read.page);
  if (read.since !== undefined) query.set('since', read.since);
  if (read.until !== undefined) query.set('until', read.until);
  if (read.kind !== undefined) query.set('kind', read.kind);
  if (read.cited === true) query.set('cited', '1');
  const suffix = query.toString();
  const answer = await readPublic(`/api/corpus${suffix === '' ? '' : `?${suffix}`}`, parseCorpusStream);
  // §6's table: NOT_SURVEYED and NOT_PUBLIC are ONE 404, and a filter naming a page this scope cannot see is
  // the commonest way to reach it. An empty stream is region 5's sentence, which is a state and not an error.
  return answer.status === 404 ? { entries: [], pages: [], nextCursor: null } : answer.body;
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
    const answer = await streamInScope(query.filters);
    return (
      <main className="page-column flex flex-col gap-3 py-4">
        <h1 className="text-lg text-ink">{t('title')}</h1>
        <CorpusContextLine filters={query.filters} count={answer.entries.length} pages={answer.pages} />
        <Stream entries={answer.entries} />
        <LegalDisclaimer form="short" />
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
      <LegalDisclaimer form="short" />
    </main>
  );
}

