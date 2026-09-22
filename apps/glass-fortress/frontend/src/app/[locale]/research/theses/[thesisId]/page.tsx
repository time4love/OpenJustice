import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResearchThesis } from '@/components/research/ResearchThesis';

// ---------------------------------------------------------------------------
// `/research/theses/[thesisId]` — THE WORKING VIEW. docs/gf-ui-flows.md §10–§14 :364–:504, §17; UI plan UI-8
// :728–:743; thesis A4 :1476.
//
// A THIN SERVER SHELL OVER A CLIENT BODY, and the split is forced rather than chosen: the read is
// `/api/research/theses/:id`, which answers only to the Supabase bearer, and the bearer is in
// `window.localStorage` — `authHeaders()` returns nothing on the server (`lib/session.ts` :80, :110). So the
// shell carries what the server can carry (`<main>`, the reading measure, the tab's title) and the body carries
// the read.
//
// NO `<h1>` HERE, AND THAT IS THE DESIGN. The heading is the CLAIM, verbatim (A2 :1268; §11 :395–:397), and the
// claim arrives with the body — so the page's one heading is the client body's. A server heading naming the page
// would be a second title above the claim, which §11's block does not have.
//
// THE TITLE IS `common.nav.research`, CALLED. The tab's name cannot be the claim without a server read of a
// gated body, and no approved string names this page; the nav's own word is the one this route is reached by.
//
// `reading` ON `<main>`: the page puts a thesis in front of someone to read, so it takes the reading measure
// like every other page that does (W-21, `recordPageWitnesses.test.tsx`'s `RESEARCH_PAGES`).
//
// NO DISCLAIMER. COMPLIANCE.md :92 names every thesis page and every call page — the PUBLIC ones, whose reader
// is the public; a gated working view is neither (§26 :820's ruling, applied where the same reasoning reaches).
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string; thesisId: string }>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common.nav' });
  return { title: t('research') };
}

export default async function ResearchThesisPage({ params }: PageParams) {
  const { locale, thesisId } = await params;
  return (
    <main className="page-column reading flex flex-col gap-4 py-4">
      <ResearchThesis thesisId={thesisId} locale={locale} />
    </main>
  );
}
