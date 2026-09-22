import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { readPublic } from '@/lib/api';
import { parseClaims } from '@/lib/corpusBody';
import { corpusPath, queryOf, readCorpusFilters, readCursor, writeClaimsQuery, writeCorpusQuery } from '@/lib/corpusQuery';
import { Claims } from '@/components/corpus/Claims';
import { CorpusContextLine } from '@/components/corpus/CorpusContextLine';
import { Link } from '@/i18n/navigation';
import type { TrajectoryAnswer } from '@/types/corpus';

// ---------------------------------------------------------------------------
// `/corpus/claims?page=<trackedUrlId>` — docs/gf-ui-flows.md §25 :787–:810, A1 :91 and :1122, §6.1 :247–:249;
// UI plan :616–:627 and §10 :1217–:1223.
//
// PER PAGE, AND `page` IS REQUIRED (the researcher, 2026-09-18). The rows are ordered by the date the claim
// LEFT, and that ordering has no meaning across unrelated documents — „אין מובן לרשימת טענות על פני אתרים
// שונים”. Within one page it is the whole point: this document's sentences in the order they were withdrawn.
//
// THE `page` RULE IS THE PAGE'S, NOT THE ROUTE'S. `GET /api/corpus/claims` answers 200 without one (measured:
// 26 rows on staging's single page), so nothing downstream enforces this — §25 :783 does, here, with the ONE
// 404: "there is no bare `/corpus/claims`". A missing page and a page that parses to nothing are the same
// answer, because §24's region 0 rule is that a value the page cannot parse is not a filter.
//
// ONE READ (§8 :344). `/api/corpus/claims` and nothing beside it: no `list_pages`, no `/api/pages/:id/
// trajectories` — which serves the same rows at one page and would be a SECOND spelling of this view — and
// no `/findings`. `filter-is-a-query`'s claims arm holds all three.
//
// THE CONTEXT LINE IS CALLED UNCHANGED (§25 :788, "the same context line, filters and axis"). It is handed no
// `pages` facet, because this read has none, and that is exactly the state its own 400 branch was written
// for: the PAGE chip is drawn from `filters` rather than from the facet, so it is present and removable here.
// Removing it lands on `/corpus`, which is correct — without a page there is no claims view.
//
// A SERVER COMPONENT reading `searchParams`, a REQUEST-TIME API and a Promise
// (01-app/03-api-reference/03-file-conventions/page.md), so this route renders dynamically: the answer
// depends on the question. No `loading.tsx` in this segment — a Suspense boundary streams the response, and
// a `notFound()` after the first byte answers 200 with a `noindex` tag instead of a real 404.
//
// NO LEGAL DISCLAIMER (the researcher, 2026-09-19): `COMPLIANCE.md` :92 names a thesis page and a call page,
// and a corpus view is neither.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'corpus.claims' });
  return { title: t('title') };
}

export default async function ClaimsPage({ params, searchParams }: PageParams) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'corpus.claims' });
  const corpus = await getTranslations({ locale, namespace: 'corpus' });

  const query = queryOf(await searchParams);
  const filters = readCorpusFilters(query);
  const page = filters.page;
  // §25 :783, and it is the same refusal for both roads: no `page` at all, and a `page` whose value the pure
  // module could not read. Neither is a filter, and a claims list with no page is the list §25 removed.
  if (page === undefined) notFound();

  // THE CHIPS THIS VIEW CARRIES are the page and the interval. `kind` and `cited` are the STREAM's and the
  // claims read takes neither, so they are dropped here rather than sent to earn a 400 — a reader arriving
  // from `/corpus?cited=1` keeps a working view instead of a refusal.
  const carried = { page, ...(filters.since === undefined ? {} : { since: filters.since }), ...(filters.until === undefined ? {} : { until: filters.until }) };
  const cursor = readCursor(query);
  const suffix = writeClaimsQuery({ ...carried, ...(cursor === undefined ? {} : { cursor }) }).toString();
  const read = await readPublic(`/api/corpus/claims?${suffix}`, parseClaims);
  // The public door's ONE 404 is NOT_SURVEYED and NOT_PUBLIC alike (§6's table) — and a page id naming
  // nothing this scope can see is the commonest way to reach it.
  if (read.status === 404) notFound();
  // A2 :1149 gives the 400 its own rendering — the filters shown for removal — and never a stack trace. The
  // chips below are drawn from `filters`, so they are all present even when the read returned nothing.
  const answer: TrajectoryAnswer = read.status === 200 ? read.body : { entries: [], undetected: [], nextCursor: null };

  const onward = (next: string): string => {
    const params = writeCorpusQuery(carried);
    params.set('cursor', next);
    return `/corpus/claims?${params.toString()}`;
  };

  return (
    <main className="page-column reading flex flex-col gap-3 py-4">
      <h1 className="text-lg text-ink">{t('title')}</h1>
        {/* BOARD ט·ב: THE ONE WAY BACK, above the header — `corpus.allPages` returns to region 0, which is
            where a page is chosen. It replaces the PAGE chip's removal: a chip per page put the whole corpus
            in a scrolling row in front of one page's records. */}
      <Link data-all-pages href={corpusPath('public')} className="self-start text-xs text-ink-muted underline">
        {corpus('allPages')}
      </Link>
      <CorpusContextLine filters={carried} count={answer.entries.length} scope="public" view="claims" />
      {/* WHICH EMPTY THE VIEW MAY CLAIM. Only a read that ANSWERED, with no date chip narrowing it, has the
          standing to say "nothing was tracked on this page"; a 400 answered nothing, and a window with
          nothing in it says nothing about the page outside that window. */}
      <Claims entries={answer.entries} emptiness={read.status === 200 && carried.since === undefined && carried.until === undefined ? 'tracked' : 'filtered'} />
      {answer.nextCursor === null ? null : (
        <Link data-load-newer href={onward(answer.nextCursor)} className="self-start text-xs text-ink-muted underline">
          {corpus('loadNewer')}
        </Link>
      )}
    </main>
  );
}
