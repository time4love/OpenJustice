import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { readPublic } from '@/lib/api';
import { parseThesisBody } from '@/lib/thesisBody';
import type { PublishedThesis, ThesisBody } from '@/types/thesis';
import { Appeals } from '@/components/thesis/Appeals';
import { Byline } from '@/components/thesis/Byline';
import { History } from '@/components/thesis/History';
import { ProvisionName } from '@/components/thesis/ProvisionName';
import { PaneTabs } from '@/components/thesis/PaneTabs';
import { TickLine } from '@/components/thesis/TickLine';
import { NoteRecent } from '@/components/thesis/NoteRecent';
import { PrefaceFold } from '@/components/thesis/PrefaceFold';
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

/**
 * `<main>` HAS FIVE CHILDREN AND `children[1]` IS THE CLAIM — the researcher's ruling of 2026-09-17.
 *
 *   [0] the folded preface   the statement and the full disclaimer, one element that grows
 *   [1] the CLAIM            §17 :529; A2 :1268
 *   [2] <header>             the provision · the byline with the COPY · the TICK LINE (§10 :1121)
 *   [3] <article>            the read: the text, the call card, the four folds
 *   [4] the short disclaimer LAST (§17 :561; §32 :813–:815)
 *
 * REGION 4 IS GONE — the appeals leave the thesis page entirely (§10 :1122–:1123; R56's ruling;
 * design session §3 :73–:75). One card leads to the call page, where they still live.
 *
 * THE CONTEXT LINE IS RETIRED (2026-09-18; §4 :159, §17 :531 as amended). It sat inside [3], not beside
 * it, and `<main>` is still at FIVE because it never was one of them. It returns when a thesis has a
 * SHORT NAME to put in it; until then `no-context-line` holds that nothing re-adds it.
 */
function Published({ thesis, locale, copyLabel, headings }: { thesis: PublishedThesis; locale: string; copyLabel: string; headings: Headings }) {
  // §17 :549 — a thesis with no CALLED and no REQUESTED gap shows no appeals section, so it declares no
  // call tab either. THE PRESENCE IS THE COUNTS AND NEVER THE ELEMENT: `<Appeals>` returns null when both
  // lists are empty, but a React element is never `undefined`, so a page that passed it unconditionally
  // would declare a tab that draws nothing. `pane-tabs-declared` holds this on `published-no-appeals.json`.
  const hasAppeals = thesis.appeals.call.length + thesis.appeals.requests.length > 0;
  return (
    <main className="page-column space-y-6 py-8">
      {/* WHAT OPENS BESIDE THE READ (§10 :1124; §20 as amended): every cited record, and the call. The page
          declares; the shell renders. A tick's press makes one active.

          NO SECOND READ (§8 :331–:333). The call panel is built from THIS body's own `appeals` —
          `{ call, requests, intake }`, thesis A5 :1567 — which `types/thesis.ts` :276 types with the very
          `CallItem[]` / `RequestItem[]` / `intake` the `/call` route's own body carries at :304. Nothing is
          derived that the body does not hold, and `GET /api/thesis/:id/call` is the CALL PAGE's read alone.

          THE TAB IS BOARD 3A MINUS THE FOLDED PREFACE AND THE FULL DISCLAIMER (§20 as amended): the centre
          already carries the statement and the disclaimer, and COMPLIANCE.md :92 names "every thesis page ·
          every /call/[thesisId] page" — a tab is neither. */}
      <PaneTabs
        citations={thesis.citations}
        pages={thesis.pages}
        locale={locale}
        call={
          hasAppeals ? (
            <Appeals
              call={thesis.appeals.call}
              requests={thesis.appeals.requests}
              intake={thesis.appeals.intake}
              citations={thesis.citations}
              pages={thesis.pages}
              locale={locale}
              headings={headings}
            />
          ) : undefined
        }
      />
      {/* WHAT THIS BROWSER HAS OPENED (§9 :1084–:1085). The label is the page's — a thesis by its
          claim's first words — because only the page knows what a person recognises it by. */}
      <NoteRecent kind="thesis" href={`/theses/${thesis.thesisId}`} label={thesis.claim} />
      <PrefaceFold statement={thesis.publicInterestStatement} />
      <h1 id="claim" dir="auto" className="text-claim font-bold">
        {thesis.claim}
      </h1>
      <header className="space-y-2">
        <ProvisionName provision={thesis.provision} />
        {/* The COPY of `thesis <id>` — the chat-ready form, labelled by what it is FOR (§4 :172–:174; run B,
            Live-31) — INSIDE the credit line, as board 3A draws it (`.by > .copy`). It was a sibling of the
            byline until R59's staging exercise; `built-as-drawn` holds the placement now. */}
        <Byline author={thesis.version.author} at={thesis.version.publishedAt} locale={locale}>
          <CopyableCode value={`thesis ${thesis.thesisId}`} label={copyLabel} />
        </Byline>
        {/* THE TICK LINE, under the byline (§10 :1121): the cited records of each page, in the body's
            order, before the reader walks through them. */}
        <TickLine citations={thesis.citations} locale={locale} />
      </header>
      <article className="reading space-y-6">
        <ThesisText text={thesis.version.text} citations={thesis.citations} pages={thesis.pages} locale={locale} />
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
      </article>
      <LegalDisclaimer form="short" />
    </main>
  );
}

/** The call area's three region headings — §20's rows 3, 4 and 5 — resolved on the server, as the call page does. */
interface Headings {
  call: string;
  requests: string;
  how: string;
}

export default async function ThesisPage({ params }: PageParams) {
  const { locale, id } = await params;
  const thesis = await body(id);
  if ('withdrawn' in thesis) return <WithdrawnNotice at={thesis.withdrawnAt} locale={locale} />;
  const t = await getTranslations({ locale, namespace: 'theses.page' });
  // The same approved strings the call page passes, from the same namespace: the call area reads one way
  // wherever it is drawn, and no string is added for the tab (§10 :1127's copy rule).
  const labels = await getTranslations({ locale, namespace: 'call.page' });
  return (
    <Published
      thesis={thesis}
      locale={locale}
      copyLabel={t('copyThesis')}
      headings={{ call: labels('callHeading'), requests: labels('requestsHeading'), how: labels('howHeading') }}
    />
  );
}
