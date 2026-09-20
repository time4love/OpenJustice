'use client';

import { useTranslations } from 'next-intl';
import { ProvisionName } from '@/components/thesis/ProvisionName';
import type { FramingRow as Row } from '@/types/research';

// ---------------------------------------------------------------------------
// A FRAMING'S ROW — docs/gf-ui-flows.md §29 :899–:902: "every framing, oldest first — question · provision ·
// author · the thesis it attaches to or none · its latest round · the CHOSEN claim verbatim".
//
// A FRAMING THAT PRODUCED NO THESIS IS SHOWN AS SUCH, never hidden and never blank (§12 :1163) — an absence a
// reader can see is a fact; a row that quietly omits the line reads as a page that lost something.
//
// NO TAP YET, AND THAT IS DECLARED. §29 :901 opens the framing SHEET on tap, and the sheet is
// `get_framing`'s `turns` through the transcript's own `TurnRow` (A4 :1459 as ruled — one builder, three
// doors). That renderer is the working view's and is built once, there; drawing a second one here for four of
// the seventeen kinds is the duplication the ruling exists to prevent, and a row that led to a page which does
// not exist is what `nav-is-the-map` calls an entry leading nowhere. The row is complete; its tap arrives with
// the sheet.
// ---------------------------------------------------------------------------

export function FramingRow({ row }: { row: Row }) {
  const t = useTranslations('research.framings');
  return (
    <li data-framing-row={row.framingId} className="flex flex-col gap-1 rounded border border-line bg-surface p-3">
      <span className="text-xs text-ink-muted">{t('question')}</span>
      <span data-framing-question dir="auto" className="text-sm text-ink">
        {row.question}
      </span>
      <ProvisionName provision={row.provision} />
      <span className="text-xs text-ink-muted">
        <bdi>{row.author}</bdi>
      </span>
      {row.latest === null ? (
        <span className="text-xs text-ink-muted">{t('rounds', { count: row.rounds })}</span>
      ) : (
        <span data-framing-latest={row.latest.type} className="text-xs text-ink-muted">
          {t(`latest.${row.latest.type}`)}
        </span>
      )}
      {row.thesisId === null ? <span className="text-xs text-ink-muted">{t('noThesis')}</span> : null}
      {row.claim === null ? null : (
        <>
          <span className="text-xs text-ink-muted">{t('chosenClaim')}</span>
          <span data-framing-claim dir="auto" className="text-sm text-ink">
            {row.claim}
          </span>
        </>
      )}
    </li>
  );
}
