import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { readUnfiltered } from '@/lib/api';
import { parseThesisBody, parseVersionBody } from '@/lib/thesisBody';
import type { ThesisBody, VersionBody } from '@/types/thesis';
import { Banner } from '@/components/thesis/Banner';
import { Byline } from '@/components/thesis/Byline';
import { NoteRecent } from '@/components/thesis/NoteRecent';
import { PaneTabs } from '@/components/thesis/PaneTabs';
import { PrefaceFold } from '@/components/thesis/PrefaceFold';
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
  const thesis = await readUnfiltered(`/api/thesis/${id}`, parseThesisBody);
  if (thesis.status === 404) notFound();
  const version = await readUnfiltered(`/api/thesis/${id}/versions/${v}`, parseVersionBody);
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
      {/* WHAT OPENS BESIDE THE READ (§10 :1124; §22 as amended — "at width the record is a right-pane tab,
          not a margin panel"). THE RECORDS ONLY, AND NO CALL: the appeals belong to the thesis as it stands,
          not to a version that has been superseded, and this page's own body (A5 :1570) carries none — which
          is what `PaneTabs`' `call` prop means by "absent on the version page". Nothing is fetched for the
          tabs (§8 :331–:333): both lists are already read above.

          THE SET IS THE INTERSECTION, and the page reads two bodies to get it. The VERSION names what THIS
          text cited (`version.citations`, A5 :1570); the THESIS resolves each record's facts and marks
          (A5 :1569). Declaring the thesis's list would open a tab for a record this version never cited,
          and none for one it did.

          A RECORD THIS VERSION CITES THAT THE CURRENT BODY NO LONGER CARRIES GETS NO TAB, and that is the
          right answer rather than a gap: there is no resolved record to open, so `<ThesisText>` renders it
          as a `not-current` chip (`ThesisText.tsx` :27) and the pane agrees with the text instead of
          contradicting it. */}
      <PaneTabs
        citations={thesis.citations.filter((citation) =>
          version.citations.some((ref) => ref.kind === citation.kind && ref.name === citation.name),
        )}
        pages={thesis.pages}
        locale={locale}
      />
      {/* WHAT THIS BROWSER HAS OPENED (§9 :1084–:1085). The label is the page's — a thesis by its
          claim's first words — because only the page knows what a person recognises it by. */}
      <NoteRecent kind="thesis" href={`/theses/${thesis.thesisId}`} label={thesis.claim} />
      <PrefaceFold statement={thesis.publicInterestStatement} />
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
