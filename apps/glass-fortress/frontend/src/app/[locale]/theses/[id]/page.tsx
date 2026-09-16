import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { readPublic } from '@/lib/api';
import { parseThesisBody } from '@/lib/thesisBody';
import type { PublishedThesis, ThesisBody } from '@/types/thesis';
import { Appeals } from '@/components/thesis/Appeals';
import { Byline } from '@/components/thesis/Byline';
import { ContextLine } from '@/components/thesis/ContextLine';
import { History } from '@/components/thesis/History';
import { ProvisionName } from '@/components/thesis/ProvisionName';
import { PublicInterestStatement } from '@/components/thesis/PublicInterestStatement';
import { TheCase } from '@/components/thesis/TheCase';
import { ThePages } from '@/components/thesis/ThePages';
import { ThesisText } from '@/components/thesis/ThesisText';
import { VerifyDisclosure } from '@/components/thesis/VerifyDisclosure';
import { WithdrawnNotice } from '@/components/thesis/WithdrawnNotice';
import { CopyableCode } from '@/components/CopyableCode';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';

// ---------------------------------------------------------------------------
// THE PUBLIC THESIS PAGE — docs/gf-thesis-flows.md T5 :804–:830, A5 :1565–:1569; docs/gf-ui-flows.md §16–§19.
//
// ONE READ, and nothing derived but the text diff the reader asks for (§16 :513–:515; §8 :331–:333). The page is a
// SERVER component: the share metadata is composed from the body (§32 :822–:823), which only a server render can
// do, and `generateMetadata` and the page share one request.
//
// NO `loading.tsx` IN THIS SEGMENT (the researcher's ruling q1 A, 2026-09-16). A Suspense boundary would stream
// the response, and a `notFound()` after the first byte answers 200 with a `noindex` tag instead of a real 404
// (next docs, file-conventions/loading.md :105–:120). The one 404 is a status, not only a sentence.
//
// THE ORDER IS T5'S, top to bottom (§17 :523–:561): the statement and the disclaimer FIRST, the claim as the
// heading, the text with its chips, the appeals, the case, the history, the pages, and LAST the short disclaimer
// with the VERIFY disclosure closed.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string; id: string }>;
}

async function body(id: string): Promise<ThesisBody> {
  const answer = await readPublic(`/api/thesis/${id}`, parseThesisBody);
  if (answer.status === 404) notFound();
  return answer.body;
}

export async function generateMetadata({ params }: PageParams, parent: ResolvingMetadata): Promise<Metadata> {
  const { locale, id } = await params;
  const thesis = await body(id);
  // The notice and the 404 carry the site's name and nothing of the body (the researcher's ruling q11).
  // A page's `openGraph` REPLACES the parent's rather than merging into it, so the site's share image has to be
  // carried forward explicitly — the R54 defect's exact shape, caught again by the served-HTML read (§a8). The
  // documented way is the resolving parent (next docs, generate-metadata.md :60–:74); the site keeps ONE image
  // (the researcher's ruling Q4), and no page segment adds one of its own.
  const image = (await parent).openGraph?.images ?? [];
  if ('withdrawn' in thesis) {
    return { title: (await getTranslations({ locale, namespace: 'common' }))('appName'), openGraph: { images: [...image] } };
  }
  // A thesis with no statement has the claim as its description (ruled 5(i)); no call item, no person (§21 :624).
  const description = thesis.publicInterestStatement ?? thesis.claim;
  return {
    title: thesis.claim,
    description,
    openGraph: { title: thesis.claim, description, type: 'article', images: [...image] },
    twitter: { title: thesis.claim, description },
  };
}

function Published({ thesis, locale, copyLabel }: { thesis: PublishedThesis; locale: string; copyLabel: string }) {
  return (
    <main className="page-column space-y-6 py-8">
      <PublicInterestStatement statement={thesis.publicInterestStatement} />
      <LegalDisclaimer form="full" />
      <header className="space-y-2">
        <h1 id="claim" dir="auto" className="text-2xl font-semibold leading-snug">
          {thesis.claim}
        </h1>
        <ProvisionName title={thesis.provisionTitle} />
        <Byline author={thesis.version.author} at={thesis.version.publishedAt} locale={locale} />
        {/* The COPY of `thesis <id>` — the chat-ready form, labelled by what it is FOR (§4 :172–:174; run B, Live-31). */}
        <CopyableCode value={`thesis ${thesis.thesisId}`} label={copyLabel} />
      </header>
      <ContextLine claim={thesis.claim} watch="claim" />
      <ThesisText text={thesis.version.text} citations={thesis.citations} pages={thesis.pages} locale={locale} />
      <Appeals
        call={thesis.appeals.call}
        requests={thesis.appeals.requests}
        intake={thesis.appeals.intake}
        citations={thesis.citations}
        pages={thesis.pages}
        locale={locale}
        headings={null}
      />
      <TheCase rationale={thesis.rationale} overObjection={thesis.overObjection} analysisRun={thesis.analysisRun} />
      <History
        thesisId={thesis.thesisId}
        history={thesis.history}
        current={{ versionId: thesis.version.versionId, text: thesis.version.text, citations: thesis.citations.map((citation) => ({ kind: citation.kind, name: citation.name, pin: citation.kind === 'EVIDENCE' ? citation.pin : null })) }}
        author={thesis.version.author}
        locale={locale}
      />
      <ThePages pages={thesis.pages} />
      <VerifyDisclosure contentHash={thesis.version.contentHash} citations={thesis.citations} />
      <LegalDisclaimer form="short" />
    </main>
  );
}

export default async function ThesisPage({ params }: PageParams) {
  const { locale, id } = await params;
  const thesis = await body(id);
  if ('withdrawn' in thesis) return <WithdrawnNotice at={thesis.withdrawnAt} locale={locale} />;
  const t = await getTranslations({ locale, namespace: 'theses.page' });
  return <Published thesis={thesis} locale={locale} copyLabel={t('copyThesis')} />;
}
