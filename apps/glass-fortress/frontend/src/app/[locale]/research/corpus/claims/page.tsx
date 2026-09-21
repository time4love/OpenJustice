import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { queryOf, readCorpusFilters } from '@/lib/corpusQuery';
import { ResearchClaims } from '@/components/research/ResearchClaims';

// ---------------------------------------------------------------------------
// `/research/corpus/claims?page=<trackedUrlId>` — THE CLAIMS LENS AT `all`. UI plan UI-8 :759–:760; the view
// is docs/gf-ui-flows.md §25 :787–:810; A1 :1134; the read is §6.1 :247–:249.
//
// `page` IS REQUIRED, AND THE RULE IS THE PAGE'S RATHER THAN THE ROUTE'S — §25 :783, exactly as the public
// twin enforces it. `GET /api/research/corpus/claims` answers 200 without one, so nothing downstream refuses;
// this shell does, with the ONE 404, and a missing `page` and a `page` the pure module cannot read are the
// same answer (§24's region 0 rule: a value the page cannot parse is not a filter).
//
// IT REFUSES IN THE SERVER SHELL, before the client body mounts. `notFound()` terminates the segment
// (next's error-handling guide §"Not found" :151–:187); a client body would have to render, discover the
// absence and then throw, which is a page drawn before it is refused.
//
// THE BODY IS CLIENT-RENDERED for the reason `/research/corpus`'s is: the bearer is in `window.localStorage`
// and a Server Component cannot read it. `reading` on `<main>` (W-21), and no legal disclaimer — a corpus
// view is neither a thesis page nor a call page (COMPLIANCE.md :92).
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

export default async function ResearchClaimsPage({ params, searchParams }: PageParams) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'corpus.claims' });
  const query = await searchParams;
  const page = readCorpusFilters(queryOf(query)).page;
  if (page === undefined) notFound();
  return (
    <main className="page-column reading flex flex-col gap-3 py-4">
      <h1 className="text-lg text-ink">{t('title')}</h1>
      <ResearchClaims page={page} query={query} />
    </main>
  );
}
