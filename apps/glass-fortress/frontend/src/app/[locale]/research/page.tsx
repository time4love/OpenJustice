import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResearchDashboard } from '@/components/research/ResearchDashboard';

// ---------------------------------------------------------------------------
// `/research` — THE READ VIEW'S DOOR. docs/gf-ui-flows.md §29 :887–:909, A1 :1131; UI plan UI-8 :716–:727.
//
// A THIN SERVER SHELL OVER A CLIENT BODY, and the split is forced rather than chosen: every read here is
// `/api/research/*`, which answers only to the Supabase bearer, and the bearer is in `window.localStorage`
// — `authHeaders()` returns nothing on the server (`lib/session.ts` :80, :110). So the shell carries what the
// server can carry (the title, `<main>`, the reading measure) and the body carries the reads.
//
// `reading` ON `<main>`: the page puts the researcher's own claims and framings in front of someone, so it
// takes the reading measure like every other page that does (W-21, `recordPageWitnesses.test.tsx` :437).
//
// NO DISCLAIMER. COMPLIANCE.md :92 names every thesis page and every call page; the read view is neither
// (§26 :820's ruling read on the record pages, applied where the same reasoning reaches).
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common.nav' });
  return { title: t('research') };
}

export default async function ResearchPage({ params }: PageParams) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'common.nav' });
  return (
    <main className="page-column reading flex flex-col gap-4 py-4">
      <h1 className="text-lg text-ink">{t('research')}</h1>
      <ResearchDashboard locale={locale} />
    </main>
  );
}
