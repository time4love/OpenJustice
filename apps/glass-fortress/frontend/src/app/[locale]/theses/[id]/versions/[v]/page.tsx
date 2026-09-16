import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { readPublic } from '@/lib/api';
import { parseThesisBody, parseVersionBody } from '@/lib/thesisBody';
import type { ThesisBody, VersionBody } from '@/types/thesis';
import { Banner } from '@/components/thesis/Banner';
import { Byline } from '@/components/thesis/Byline';
import { PublicInterestStatement } from '@/components/thesis/PublicInterestStatement';
import { ThesisText } from '@/components/thesis/ThesisText';
import { VerifyDisclosure } from '@/components/thesis/VerifyDisclosure';
import { WithdrawnNotice } from '@/components/thesis/WithdrawnNotice';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';

// ---------------------------------------------------------------------------
// A PREVIOUS PUBLISHED VERSION — docs/gf-ui-flows.md §19 :595–:597; thesis A5 :1570, T6 :898–:901.
//
// TWO READS (the researcher's ruling q2, 2026-09-16). A5 :1570's body carries the text, its hash, its date and its
// citations AS REFERENCES — no statement, no claim of its own, no resolved record. So the thesis read supplies the
// statement COMPLIANCE.md rule 5 requires and the records the chips name, and the version read supplies what was
// published then. The gaps this leaves are recorded in the step's dated doc, never invented here.
//
// THE ORDER (ruled q3): the statement, the disclaimer, THEN the banner — rule 5 governs every thesis page, and
// §19's "banner first" is first among what the page says ABOUT the version.
//
// A VERSION A WITHDRAWAL NAMES ANSWERS THE NOTICE (A5 :1570), even after the thesis was published again — and so
// does every version while the thesis itself is withdrawn.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string; id: string; v: string }>;
}

async function read(id: string, v: string): Promise<{ thesis: ThesisBody; version: VersionBody }> {
  const thesis = await readPublic(`/api/thesis/${id}`, parseThesisBody);
  if (thesis.status === 404) notFound();
  const version = await readPublic(`/api/thesis/${id}/versions/${v}`, parseVersionBody);
  if (version.status === 404) notFound();
  return { thesis: thesis.body, version: version.body };
}

export async function generateMetadata({ params }: PageParams, parent: ResolvingMetadata): Promise<Metadata> {
  const { locale, id, v } = await params;
  await read(id, v);
  // A page's `openGraph` REPLACES the parent's rather than merging into it, so the site's share image has to be
  // carried forward explicitly — the R54 defect's exact shape, caught again by the served-HTML read (§a8). The
  // documented way is the resolving parent (next docs, generate-metadata.md :60–:74); the site keeps ONE image
  // (the researcher's ruling Q4), and no page segment adds one of its own.
  const image = (await parent).openGraph?.images ?? [];
  // The version body carries no claim of its own (A5 :1570), so the page's name is the site's.
  return {
    title: (await getTranslations({ locale, namespace: 'common' }))('appName'),
    openGraph: { images: [...image] },
  };
}

export default async function VersionPage({ params }: PageParams) {
  const { locale, id, v } = await params;
  const { thesis, version } = await read(id, v);
  if ('withdrawn' in version) return <WithdrawnNotice at={version.withdrawnAt} locale={locale} />;
  if ('withdrawn' in thesis) return <WithdrawnNotice at={thesis.withdrawnAt} locale={locale} />;
  return (
    <main className="page-column space-y-6 py-8">
      <PublicInterestStatement statement={thesis.publicInterestStatement} />
      <LegalDisclaimer form="full" />
      <Banner thesisId={thesis.thesisId} />
      <Byline author={thesis.version.author} at={version.publishedAt} locale={locale} />
      <ThesisText
        text={version.text}
        citations={thesis.citations}
        pins={version.citations}
        pages={thesis.pages}
        locale={locale}
      />
      <VerifyDisclosure contentHash={version.contentHash} citations={thesis.citations} />
      <LegalDisclaimer form="short" />
    </main>
  );
}
