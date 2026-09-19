import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { readUnfiltered } from '@/lib/api';
import { parseCallBody, parseThesisBody } from '@/lib/thesisBody';
import type { PublishedThesis, ThesisBody, WhistleblowerCall } from '@/types/thesis';
import { Appeals } from '@/components/thesis/Appeals';
import { NoteRecent } from '@/components/thesis/NoteRecent';
import { PrefaceFold } from '@/components/thesis/PrefaceFold';
import { WithdrawnNotice } from '@/components/thesis/WithdrawnNotice';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';

// ---------------------------------------------------------------------------
// THE CALL PAGE — docs/gf-ui-flows.md §20 :599–:617; thesis T4 :685–:699, A4 :1501–:1504, A5 :1569.
//
// THE APPEALS ALONE, SHAREABLE. Two public reads: the thesis for the statement, the disclaimer's place and the
// claim (A5 :1569 — "the one source of the public-interest statement a call page shows"), and the call for
// THE_CALL and THE_REQUESTS with the intake instruction.
//
// `{ live: false }` IS A PAGE, not an error (A4 :1503): "no appeal is open on this thesis", with the link to the
// thesis. A thesis never published is the one 404, and a WITHDRAWN thesis is the notice alone (the researcher's
// ruling q12, 2026-09-16) — the thesis read decides that, and the call route is then not read at all.
//
// THE SHARE METADATA IS THE STATEMENT AND THE CLAIM, never a call item (§20 :616–:617): a call names units and
// roles, and the metadata says less than the page.
// ---------------------------------------------------------------------------

interface PageParams {
  params: Promise<{ locale: string; thesisId: string }>;
}

async function thesisBody(thesisId: string): Promise<ThesisBody> {
  const answer = await readUnfiltered(`/api/thesis/${thesisId}`, parseThesisBody);
  if (answer.status === 404) notFound();
  return answer.body;
}

async function callBody(thesisId: string): Promise<WhistleblowerCall> {
  const answer = await readUnfiltered(`/api/thesis/${thesisId}/call`, parseCallBody);
  return answer.status === 404 ? { live: false } : answer.body;
}

export async function generateMetadata({ params }: PageParams, parent: ResolvingMetadata): Promise<Metadata> {
  const { locale, thesisId } = await params;
  const thesis = await thesisBody(thesisId);
  // A page's `openGraph` REPLACES the parent's rather than merging into it, so the site's share image has to be
  // carried forward explicitly — the R54 defect's exact shape, caught again by the served-HTML read (§a8). The
  // documented way is the resolving parent (next docs, generate-metadata.md :60–:74); the site keeps ONE image
  // (the researcher's ruling Q4), and no page segment adds one of its own.
  const image = (await parent).openGraph?.images ?? [];
  if ('withdrawn' in thesis) {
    return { title: (await getTranslations({ locale, namespace: 'common' }))('appName'), openGraph: { images: [...image] } };
  }
  const description = thesis.publicInterestStatement ?? thesis.claim;
  return {
    title: thesis.claim,
    description,
    openGraph: { title: thesis.claim, description, type: 'article', images: [...image] },
    twitter: { title: thesis.claim, description },
  };
}

interface Labels {
  toThesis: string;
  callHeading: string;
  requestsHeading: string;
  howHeading: string;
  notLive: string;
}

function Live({ thesis, call, locale, t }: { thesis: PublishedThesis; call: WhistleblowerCall; locale: string; t: Labels }) {
  return (
    <main className="page-column space-y-6 py-8">
      {/* WHAT THIS BROWSER HAS OPENED (§9 :1084–:1085). The label is the page's — a thesis by its
          claim's first words — because only the page knows what a person recognises it by. */}
      <NoteRecent kind="thesis" href={`/theses/${thesis.thesisId}`} label={thesis.claim} />
      <PrefaceFold statement={thesis.publicInterestStatement} />
      <header className="space-y-2">
        <p id="claim" dir="auto" className="text-lg font-semibold leading-snug">
          {thesis.claim}
        </p>
        <Link href={`/theses/${thesis.thesisId}`} className="text-sm underline">
          {t.toThesis}
        </Link>
      </header>
      {call.live ? (
        <Appeals
          call={call.call}
          requests={call.requests}
          intake={call.intake}
          citations={thesis.citations}
          pages={thesis.pages}
          locale={locale}
          headings={{ call: t.callHeading, requests: t.requestsHeading, how: t.howHeading }}
        />
      ) : (
        <p className="text-ink">{t.notLive}</p>
      )}
      <LegalDisclaimer form="short" />
    </main>
  );
}

export default async function CallPage({ params }: PageParams) {
  const { locale, thesisId } = await params;
  const thesis = await thesisBody(thesisId);
  // The notice is the whole page, and the call route is never read for it — "nothing else" (§19 :590–:593).
  if ('withdrawn' in thesis) return <WithdrawnNotice at={thesis.withdrawnAt} locale={locale} />;
  const call = await callBody(thesisId);
  const labels = await getTranslations({ locale, namespace: 'call.page' });
  return (
    <Live
      thesis={thesis}
      call={call}
      locale={locale}
      t={{
        toThesis: labels('toThesis'),
        callHeading: labels('callHeading'),
        requestsHeading: labels('requestsHeading'),
        howHeading: labels('howHeading'),
        notLive: labels('notLive'),
      }}
    />
  );
}
