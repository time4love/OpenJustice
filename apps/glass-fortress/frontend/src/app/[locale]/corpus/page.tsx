import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { readPublic } from '@/lib/api';
import { parseCorpusPages } from '@/lib/corpusBody';
import { PagesList } from '@/components/corpus/PagesList';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';

// ---------------------------------------------------------------------------
// `/corpus` — docs/gf-ui-flows.md §24 :676–:717, §28 :792, A1's route table; UI plan UI-7.
//
// THIS ROUTE KILLED A LIVE 404. `Sidebar.tsx` has rendered `<Link href="/corpus">` under הארכיון since UI-4b
// and the route did not exist — the deployed site answered 404 from its own navigation.
//
// REGION 0 IS THE DEFAULT AND THIS CHUNK RENDERS ONLY IT. `/corpus` with none of the five read parameters is
// the PAGES LIST; `page` · `since` · `until` · `kind` · `cited` carry it to the STREAM, which lands next. Until
// then a stream URL renders the list and says so — it does NOT 404, because every one of those URLs is already
// specified (the thesis page's `/corpus?page=` is named in four places) and a 404 would break a link that the
// contract says must work.
//
// THE READ IS THE DISCLOSURE RULE. `GET /api/corpus` at `scope: 'public'`, and the `pages` FACET of that one
// read — never `list_pages`, never `/api/research/pages`, never the facet at `all`. §28: "no public read lists
// pages (`list_pages` is GATED, and rightly: a public list of surveyed pages is the §9.5 leak)". At `public` the
// facet is exactly the OPENED pages and "reveals nothing the thesis pages' links do not already reveal".
// `pages-list-reads-public-only` holds all three halves of that.
//
// THE PAGE READS NO QUERY, and that is the amendment of 2026-09-18 rather than an omission. The stream is not
// a lens and not a destination: it is WHAT A FILTER RETURNS, so `?page=` · `?since=`/`?until=` · `?cited=1` are
// the stream's only doors and each lands when its region does. `/corpus` bare is region 0, and until the stream
// lands those URLs render the list rather than a 404 — they are contract-specified in four places and a 404
// would break a link the contract guarantees. `lib/corpusQuery.ts` already holds the rule; this page will call
// it when there is a stream for it to choose.
//
// NO CONTEXT LINE AND NO LENS CONTROL AT THIS CHUNK, and both are DELETED — never drawn empty, never left in the
// tree unused (the researcher, 2026-09-18). A LENS CONTROL OF ONE IS NOT A CONTROL: `?cited=1` reached a page
// declaring no `searchParams`, so pressing „מצוטטות" re-rendered the identical page and did not even mark itself
// current — a control drawn before it works, which is this round's own defect, four times over. AND A SCOPE MEANS
// SOMETHING ONLY WHERE THERE ARE TWO: „דפים פתוחים" names the opened pages against the surveyed ones, and a reader
// who is not a researcher does not know the closed ones exist — „הקורא שאינו חוקר לא ידע שיש דפים סגורים". §24's
// region 1 is written FRESH at chunk 5, when the filters, the count and the control arrive together; the set that
// returns is PAGES · CITED — two, per §25 :770 and :783, the CLAIMS lens having moved per-page.
//
// A SERVER COMPONENT, and no `loading.tsx` in this segment — the thesis page's ruling (q1 A, 2026-09-16): a
// Suspense boundary streams the response, and a `notFound()` after the first byte answers 200 with a `noindex`
// tag instead of a real 404.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string }>;
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

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'corpus' });
  return { title: t('title') };
}

export default async function CorpusPage({ params }: PageParams) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'corpus' });
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

