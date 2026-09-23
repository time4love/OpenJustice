'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { GLYPHS } from '@/components/glyphs';
import { CorpusContextLine } from '@/components/corpus/CorpusContextLine';
import { useAsyncData } from '@/hooks/useAsyncData';
import { formatDate } from '@/lib/format';
import { parseDocuments } from '@/lib/researchBody';
import { researchFetch } from '@/lib/researchFetch';
import type { DocumentRow } from '@/types/research';
import { ResearchDoor, ResearchFetchBoundary } from './ResearchFetchBoundary';
import { atScope, ScopeSwitch, useScope } from './ScopeSwitch';

// ---------------------------------------------------------------------------
// THE DOCUMENTS LENS — docs/gf-ui-flows.md §24 :719, RULED 2026-09-22 at board י3: a THIRD lens on `/research/corpus`,
// GATED, over `list_documents` (document flows A4 :1432–:1434 as ruled; the route passes `scope: 'all'`). One row per
// document of the caller's scope, oldest first: the date, the TITLE, the page it asserts, custody, anchored or owed,
// cited-by; a derived document names what it derives from with a document tick. The dialog is NOT reachable from
// here (ui §1 :36–:39), and one line says so.
//
// ONE READ, the documents route (§8). THE SCOPE is the read view's own switch (§7.1): the route answers every
// researcher's documents and `mine` narrows them by the row's own `by.mine` — never a second read, never an id.
//
// THE DATE IS THE ASSERTED DAY where the researcher gave one (board י3 draws `3.9.2026` for the dataset asserted
// 2026-09-03), and the day of receipt otherwise.
//
// A SEALED OR SHED ROW CANNOT EXIST before document steps 32 and 35 build what writes one; its custody word is theirs
// to rule, so meeting one THROWS naming the step — never a word invented here.
// ---------------------------------------------------------------------------

const DOCUMENTS_ROUTE = '/api/research/documents';

/** `https://doi.org/10.1/x` → `doi.org/10.1/x` — the board's spelling of a page (domain + path). */
function pageOf(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function Row({ row }: { row: DocumentRow }) {
  const t = useTranslations('research.documents');
  const derivedFrom = useTranslations('upload.labels');
  const locale = useLocale();
  if (row.custody !== 'HELD') {
    throw new Error(`the documents lens: ${row.commitment} is ${row.custody} — its custody word is document step ${row.custody === 'SEALED' ? '32' : '35'}'s`);
  }
  const day = row.assertions.assertedAt === null ? row.receivedAt : `${row.assertions.assertedAt}T00:00:00.000Z`;
  return (
    <li data-document-row className="flex gap-3 border-b border-line py-2 text-sm">
      <span className="w-20 shrink-0 text-ink">{formatDate(day, locale)}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <bdi className="text-ink">{row.title ?? ''}</bdi>
        {row.assertions.assertedUrl === null ? null : (
          <span dir="ltr" className="truncate text-xs text-ink-muted">
            {pageOf(row.assertions.assertedUrl)}
          </span>
        )}
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {row.assertions.derivedFrom === null ? null : (
            <>
              <span>{derivedFrom('derivedFrom')}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2">
                {GLYPHS.version()}
                <bdi>{row.assertions.derivedFrom.title ?? ''}</bdi>
              </span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>{t(`custody.${row.custody}`)}</span>
          <span className={`rounded-full border border-line bg-surface px-2 ${row.anchored ? 'text-ink-muted' : 'text-amber'}`}>
            {row.anchored ? t('anchored') : t('owed')}
          </span>
          {row.citedBy.length === 0 ? null : (
            <>
              <span aria-hidden="true">·</span>
              <span>{t('cited')}</span>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

export function ResearchDocuments() {
  const t = useTranslations('research.documents');
  const [scope, setScope] = useScope();
  const read = useMemo(() => (signal: AbortSignal) => researchFetch(DOCUMENTS_ROUTE, parseDocuments, { signal }), []);
  const answer = useAsyncData(read);

  return (
    <ResearchDoor states={[answer.state]}>
      <ResearchFetchBoundary state={answer.state}>
        {(body) => {
          const rows = atScope(
            body.documents.map((row) => ({ row, mine: row.by?.mine === true })),
            scope,
          ).map(({ row }) => row);
          return (
            <>
              <CorpusContextLine filters={{}} count={rows.length} scope="all" view="documents" />
              <ScopeSwitch scope={scope} onChange={setScope} />
              <h2 data-documents-heading className="text-sm font-semibold text-ink-muted">
                {t(`heading.${scope}`)}
              </h2>
              {rows.length === 0 ? (
                <p data-documents-empty className="text-sm text-ink-muted">
                  {t('empty')}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {rows.map((row) => (
                    <Row key={row.commitment} row={row} />
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-muted">{t('notReachable')}</p>
            </>
          );
        }}
      </ResearchFetchBoundary>
    </ResearchDoor>
  );
}
