'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAsyncData } from '@/hooks/useAsyncData';
import { researchFetch } from '@/lib/researchFetch';
import { parseEvidenceReviews, parseFramings, parsePages, parseThesesList, parseThesisReviews } from '@/lib/researchBody';
import { CorpusNumbers } from './CorpusNumbers';
import { FramingRow } from './FramingRow';
import { OwedStrip } from './OwedStrip';
import { ResearchDoor, ResearchFetchBoundary } from './ResearchFetchBoundary';
import { ScopeSwitch, atScope, useScope } from './ScopeSwitch';
import { ThesisRow } from './ThesisRow';

// ---------------------------------------------------------------------------
// `/research` — THE DOOR TO THE READ VIEW. docs/gf-ui-flows.md §29 :887–:909; UI plan UI-8 :716–:727.
//
// FOUR REGIONS, IN ORDER: WHAT I OWE · THESES · FRAMINGS · THE CORPUS IN NUMBERS. The order is §29's and it is
// §13 :473's loading order too — what matters most paints first — so each region carries its own boundary and
// a slow read never blanks the ones beside it.
//
// FIVE READS, ALL AT `all`, NONE OF THEM FILTERED. The routes fix the scope (`researchRoutes.ts` :26–:27), so
// the page sends no `scope` and no parameter at all; the `mine`/`all` switch is a VIEW over the `mine` every
// entry carries (§7.1 :328), which is why moving it re-fetches nothing.
//
// IT IS A CLIENT COMPONENT because the bearer lives in `window.localStorage` and a Server Component cannot
// read it (`lib/session.ts` :80; Next's own authentication guide says the same of any provider-held session).
// The server shell above it carries the metadata, `<main>` and the reading measure.
//
// NOTHING HERE WRITES: every call is `researchFetch`, which is GET-only, and the one actionable element on the
// page is the COPY of a command the owed list names (§12 :458–:461).
// ---------------------------------------------------------------------------

export function ResearchDashboard({ locale }: { locale: string }) {
  const t = useTranslations();
  const [scope, setScope] = useScope();

  const reviews = useAsyncData(useCallback((signal: AbortSignal) => researchFetch('/api/research/reviews', parseThesisReviews, { signal }), []));
  const evidence = useAsyncData(
    useCallback((signal: AbortSignal) => researchFetch('/api/research/evidence-reviews', parseEvidenceReviews, { signal }), []),
  );
  const theses = useAsyncData(useCallback((signal: AbortSignal) => researchFetch('/api/research/theses', parseThesesList, { signal }), []));
  const framings = useAsyncData(useCallback((signal: AbortSignal) => researchFetch('/api/research/framings', parseFramings, { signal }), []));
  const pages = useAsyncData(useCallback((signal: AbortSignal) => researchFetch('/api/research/pages', parsePages, { signal }), []));

  // THE Q-G JOIN: an owed entry names its thesis by the CLAIM the theses read already carries. A lookup over a
  // body this page already holds is not a second read (§12 :464), and an entry whose thesis is outside that
  // body — a colleague's, while the switch is on `mine` — draws no claim rather than an id.
  const thesesState = theses.state;
  const claimOf = useCallback(
    (thesisId: string): string | null => {
      const rows = thesesState.status === 'ok' && thesesState.data.state === 'BODY' ? thesesState.data.body.theses : [];
      return rows.find((row) => row.thesisId === thesisId)?.claim ?? null;
    },
    [thesesState],
  );

  return (
    // THE DOOR ANSWERS ONCE FOR THE PAGE (§13 :474–:475): a 401 is one act and a 403 is one sentence, whatever
    // number of reads met them. Each region's own boundary then draws only what is that region's — loading, a
    // backend it could not reach, a refusal that names what was not found.
    <ResearchDoor states={[reviews.state, evidence.state, theses.state, framings.state, pages.state]}>
      <ScopeSwitch scope={scope} onChange={setScope} />

      <section data-region="owed" className="flex flex-col gap-2">
        <h2 className="text-sm text-ink">{t('research.owed.heading')}</h2>
        <ResearchFetchBoundary state={reviews.state}>
          {(thesisReviews) => (
            <ResearchFetchBoundary state={evidence.state}>
              {(evidenceReviews) => (
                <OwedStrip
                  theses={atScope(thesisReviews.reviews, scope)}
                  evidence={evidenceReviews.reviews}
                  notEvaluable={evidenceReviews.notEvaluable}
                  claimOf={claimOf}
                  locale={locale}
                />
              )}
            </ResearchFetchBoundary>
          )}
        </ResearchFetchBoundary>
      </section>

      <section data-region="theses" className="flex flex-col gap-2">
        <h2 className="text-sm text-ink">{t('theses.list.title')}</h2>
        <ResearchFetchBoundary state={theses.state}>
          {(list) => {
            const rows = atScope(list.theses, scope);
            return rows.length === 0 ? (
              <p data-theses-empty className="text-sm text-ink-muted">
                {t('research.theses.empty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <ThesisRow key={row.thesisId} row={row} locale={locale} />
                ))}
              </ul>
            );
          }}
        </ResearchFetchBoundary>
      </section>

      <section data-region="framings" className="flex flex-col gap-2">
        <h2 className="text-sm text-ink">{t('research.framings.heading')}</h2>
        <ResearchFetchBoundary state={framings.state}>
          {(rows) =>
            rows.length === 0 ? (
              <p data-framings-empty className="text-sm text-ink-muted">
                {t('research.framings.empty')}
              </p>
            ) : (
              // OLDEST FIRST IS THE READ'S OWN ORDER (A4 :1432, "ordered `createdAt` then id"), kept as served
              // — a page that re-sorted would be deriving an order the body already decided.
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <FramingRow key={row.framingId} row={row} />
                ))}
              </ul>
            )
          }
        </ResearchFetchBoundary>
      </section>

      {/* REGION 4 IS A DOOR CARD AND CARRIES ITS OWN TITLE (board ב, approved 2026-09-21): the card's heading
          IS the link to `/research/corpus`, so a second `<h2>` above it would name the region twice — and
          „הארכיון במספרים" named a list of numbers this region no longer draws. The key lost its caller here
          and left both catalogues in the same change. */}
      <section data-region="corpus" className="flex flex-col gap-2">
        <ResearchFetchBoundary state={pages.state}>{(rows) => <CorpusNumbers pages={rows} />}</ResearchFetchBoundary>
      </section>
    </ResearchDoor>
  );
}
