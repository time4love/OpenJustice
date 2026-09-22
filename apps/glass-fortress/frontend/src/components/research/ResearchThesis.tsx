'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import { ProvisionName } from '@/components/thesis/ProvisionName';
import { useAsyncData } from '@/hooks/useAsyncData';
import { researchFetch } from '@/lib/researchFetch';
import { parseThesisContext } from '@/lib/researchBody';
import type { ThesisContext } from '@/types/research';
import { OwedStrip } from './OwedStrip';
import { ResearchDoor, ResearchFetchBoundary } from './ResearchFetchBoundary';
import { ThesisState } from './ThesisRow';

// ---------------------------------------------------------------------------
// `/research/theses/[thesisId]` — THE WORKING VIEW. docs/gf-ui-flows.md §11 :395–:408, §14 :486, §17;
// docs/gf-thesis-flows.md A4 :1476 (the read), T6 :866–:882 (what is owed); UI plan UI-8 :728–:743.
//
// OPTION ב, RULED 2026-09-21: the CENTRE is the thesis the public page draws (§17, UI-5's `components/thesis/*`
// CALLED and never edited), under the researcher's context block and WHAT IS OWED; the six tabs of §14 :486 are
// the RIGHT PANE's and land with the transcript.
//
// THE THESIS READ IS ONE READ (§12 :464): `GET /api/research/theses/:id` answers the thesis, HEAD, PUBLISHED,
// UNARGUED, the gap list, the analysis, the framings and the whole transcript in one body, and `since` is that
// same read's own parameter rather than a second read for a filter.
//
// WHAT IS OWED RIDES THE SAME READ — RULED 2026-09-22 (the researcher, R71; A4 :1476, ui §11 :402). §11 :402–:408
// draws "this thesis's entries of REVIEWS", and until today this page took a SECOND read of `/api/research/reviews`
// at `all` and KEPT the entries naming this thesis. That was a pass over every thesis on the platform to keep one
// thesis's rows — a read ui §10 :369–:371's closed list never named — and it was MEASURED on the real page at
// 5,246 ms for a body of 23 bytes, running beside the 4,344 ms read the page actually needs and therefore SETTING
// the page's wall. `get_thesis_context` now carries `owed` and `reviews` for this thesis, at zero extra queries,
// and the second read is gone.
//
// IT IS A CLIENT COMPONENT because the bearer lives in `window.localStorage` and a Server Component cannot read
// it (`lib/session.ts` :80, :110). The shell above carries the metadata, `<main>` and the reading measure.
//
// NOTHING HERE WRITES: every call is `researchFetch`, which is GET-only, and the one actionable element is the
// COPY of a command the owed list names, plus the COPY of `thesis <id>` for the chat (§12 :456–:461).
// ---------------------------------------------------------------------------

/**
 * THE CLAIM IS THE VERSION'S, and the page has two versions to take it from.
 *
 * A2 :1268 makes the claim the heading, and the wire carries it on `head` and on `published` — never on the
 * thesis itself (A4 :1476). HEAD is what the researcher is working on, so HEAD's claim is the page's; a thesis
 * whose head was withdrawn to nothing falls back to the published one, and a thesis with neither has no claim to
 * show. `null` is drawn as NO HEADING rather than as a placeholder: a heading that says "untitled" is a word
 * nobody approved for a state nobody has seen.
 */
function claimOf(context: ThesisContext): string | null {
  return context.head?.claim ?? context.published?.claim ?? null;
}

/**
 * THE CONTEXT BLOCK — §11 row 1, and NOT STICKY (RULED 2026-09-20, R66 „Q9”; §11 :395–:399).
 *
 * The reason it is not sticky is R60's and unchanged: a sticky title bar's precondition is a SHORT NAME, no
 * thesis has one, and this block carries the CLAIM — which on run B runs to hundreds of characters. `no-context-line`
 * holds that nothing re-adds one.
 *
 * THE STATE WORD IS CALLED, NEVER DERIVED. `ThesisState` is the row's own component over the union
 * `publicationState` answers on both reads (A4 :1429 as ruled), so this page computes no state from
 * `publishedVersionId` and a count — the second spelling that ruling removed.
 *
 * THE HANDLE RENDERS WITH NO KEY (the freeze's DROPPED row: „a placeholder is not a string"), and `mine` is
 * marked with `research.scope.mine` — the freeze's own CALL instead for `research.theses.mine`.
 */
function ContextBlock({ context, locale }: { context: ThesisContext; locale: string }) {
  const t = useTranslations('research');
  const claim = claimOf(context);
  const { thesis } = context;
  return (
    <section data-region="context" className="flex flex-col gap-2">
      {/* THE CLAIM, VERBATIM AND WHOLE (A2 :1268) — `dir="auto"` and no truncation, because a claim cut to fit
          is a claim the researcher did not write. */}
      {claim === null ? null : (
        <h1 data-claim dir="auto" className="text-claim font-bold">
          {claim}
        </h1>
      )}
      <ProvisionName provision={thesis.provision} />
      <p className="text-xs text-ink-muted">
        <bdi>{thesis.by.handle}</bdi>
        {thesis.by.mine ? <span data-mine className="ms-2">{t('scope.mine')}</span> : null}
      </p>
      <ThesisState state={thesis.state} locale={locale} />
      {/* THE THESIS ID HAS TWO HOMES AND THIS IS ONE OF THEM (§4 :167–:176): the URL, and a COPY labelled by what
          the value is FOR — the chat, where every act is made (run B, Live-31). It is never a text node. */}
      <CopyableCode value={`thesis ${thesis.thesisId}`} label={t('thesis.copyId')} />
    </section>
  );
}

export function ResearchThesis({ thesisId, locale }: { thesisId: string; locale: string }) {
  const t = useTranslations('research');

  const context = useAsyncData(
    useCallback((signal: AbortSignal) => researchFetch(`/api/research/theses/${thesisId}`, parseThesisContext, { signal }), [thesisId]),
  );

  return (
    // THE DOOR ANSWERS ONCE FOR THE PAGE (§13 :474–:475): a 401 is one act and a 403 is one sentence, whatever
    // number of reads met them. A 404 is this page's own state — `research.state.noThesis`, named rather than
    // the public one-404, because the caller is a researcher and working state is theirs to read (§7 :310–:313).
    <ResearchDoor states={[context.state]}>
      <ResearchFetchBoundary state={context.state}>
        {(body) => (
          <>
            <ContextBlock context={body} locale={locale} />

            <section data-region="owed" className="flex flex-col gap-2">
              <h2 className="text-sm text-ink">{t('thesis.owedHere')}</h2>
              {/* THIS THESIS'S ENTRIES (§11 :402), off the body the page is already drawing — no keeping by id,
                  because the read is per-thesis and cannot carry another thesis's row. */}
              <OwedStrip
                theses={body.reviews}
                // THE CORPUS-WIDE ENTRIES ARE `/research`'S REGION 1, NOT THIS PAGE'S. §29 :890–:894 gives
                // CONTENT_MOVED to the door — they are computed over the corpus and name no thesis — and
                // §11 :402–:406 lists this region's kinds as the thesis reviews alone.
                evidence={[]}
                notEvaluable={[]}
                // THE CLAIM IS THE PAGE'S OWN — the Q-G join of `/research` reads it from the theses list;
                // here the body under the heading already carries it, so no join and no second read.
                claimOf={() => claimOf(body)}
                locale={locale}
              />
            </section>

            {/* THE TRANSCRIPT'S DOOR — §11 :408 as ruled 2026-09-21: ONE line beneath WHAT IS OWED, carrying the
                turn count. It is drawn at every width, so the page does not change by width.

                IT IS A LINE AND NOT A CONTROL UNTIL THE PANE EXISTS. An actionable element needs a defined
                moment, and a button that opens a tab no page declares yet is a dead control — which this
                repository has ruled against more than once. The turn count is a FACT of the body either way,
                and the line becomes the pane's door in the next chunk, where the tab is declared. */}
            <p data-open-transcript={body.history.length} className="text-sm text-ink-muted">
              {t('thesis.openTranscript', { count: body.history.length })}
            </p>
          </>
        )}
      </ResearchFetchBoundary>
    </ResearchDoor>
  );
}
