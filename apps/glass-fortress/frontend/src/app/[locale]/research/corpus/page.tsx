import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DOCUMENTS_LENS } from '@/components/corpus/CorpusContextLine';
import { ResearchCorpus } from '@/components/research/ResearchCorpus';
import { ResearchDocuments } from '@/components/research/ResearchDocuments';

// ---------------------------------------------------------------------------
// `/research/corpus` — THE GATED CHRONOLOGY. docs/gf-ui-flows.md §27 :863–:876, §24 :656–:657, §28; A1 :1133;
// UI plan UI-8 :750–:760.
//
// A THIN SERVER SHELL OVER A CLIENT BODY, and the split is forced rather than chosen: every read here is
// `/api/research/*`, which answers only to the Supabase bearer, and the bearer is in `window.localStorage` —
// `authHeaders()` returns nothing on the server (`lib/session.ts` :80, :110). Next's own authentication guide
// says the same of any provider-held session (:1545–:1547: React context is not supported in Server
// Components). So the shell carries what the server can carry — the title, `<main>`, the reading measure —
// and the body carries the reads.
//
// `searchParams` IS A PROMISE AND A REQUEST-TIME API (next's `page.md` :67–:83, :13–:14), so reading it opts
// this route into dynamic rendering, which is what a filtered view is: the answer depends on the question. It
// is awaited here and handed DOWN as a plain object, because a Client Component takes serialisable props.
//
// `reading` ON `<main>`: the page puts the corpus in front of someone to read, so it takes the reading
// measure like every other page that does (W-21, `recordPageWitnesses.test.tsx`'s `RESEARCH_PAGES`).
//
// NO DISCLAIMER. COMPLIANCE.md :92 names every thesis page and every call page; a corpus view is neither —
// the same reasoning that took it off `/corpus` and off the record pages (§26 :820's ruling, 2026-09-19).
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'research.corpus' });
  return { title: t('open') };
}

export default async function ResearchCorpusPage({ params, searchParams }: PageParams) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'research.corpus' });
  const query = await searchParams;
  return (
    <main className="page-column reading flex flex-col gap-3 py-4">
      <h1 className="text-lg text-ink">{t('open')}</h1>
      {/* THE DOCUMENTS LENS (§24 :719) is its own read, not a filter of the stream — so it is a branch here, before
          the corpus's reads are made, and `?lens=documents` never reaches the stream's parameter reader. */}
      {query[DOCUMENTS_LENS.key] === DOCUMENTS_LENS.value ? <ResearchDocuments /> : <ResearchCorpus query={query} />}
    </main>
  );
}
