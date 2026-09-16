'use client';

import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CopyableCode } from '@/components/CopyableCode';
import { domainOf, formatCaptureDate } from '@/lib/format';
import type { Citation, EvidenceCitation, TrajectoryCitation } from '@/types/thesis';
import { PlatformMark } from './PlatformMark';
import { ResearcherWords } from './ResearcherWords';

// ---------------------------------------------------------------------------
// THE CHIP AND THE SHEET IT OPENS — docs/gf-ui-flows.md §17 :532–:538, §18 :566–:586, §4 :167–:178.
//
// A chip names what a reader RECOGNISES — a page by its domain, a capture by its date, a diff by its interval,
// a trajectory by the claim's first words — and never the record's 64-hex name, which lives in a COPY control and
// in VERIFY. It carries the body's MARKS beside it and computes none of them (§21 :626–:627).
//
// Tapping it opens the sheet over the text and returns to the same place (§4 :157–:158): the record, the pinned
// content, VERIFIED per capture, the FLAG with the arms the body named, the two facts, and one link onward.
//
// THE VERSION PAGE'S TWO EXTRA KINDS (the researcher's ruling M4, 2026-09-16): on a previous version, a record the
// CURRENT version cites at another pinned content version is `repinned` — the record's facts are shown, its marks
// are NOT, because a mark belongs to the pin it was computed for — and a record the current version no longer
// cites is `not-current`, which shows nothing about the record at all.
// ---------------------------------------------------------------------------

export type ChipKind = 'capture' | 'diff' | 'trajectory' | 'unresolved' | 'repinned' | 'not-current';

export interface ChipProps {
  kind: ChipKind;
  /** The record's name or the trajectory's id — an attribute for the instruments, never a text node. */
  name: string;
  /** The token as it stands in the text, for the sheet's COPY (§4 :172–:173). */
  source: string;
  citation?: Citation;
  /** The cited page's id, when the body's `pages` names it — the sheet's link onward (§18 :575). */
  pageId?: string;
  locale: string;
}

const isEvidence = (citation: Citation | undefined): citation is EvidenceCitation => citation?.kind === 'EVIDENCE';
const isTrajectory = (citation: Citation | undefined): citation is TrajectoryCitation => citation?.kind === 'TRAJECTORY';

function Interval({ record, locale }: { record: { capture?: string; before?: string; after?: string }; locale: string }) {
  if (record.capture !== undefined) return <bdi dir="ltr">{formatCaptureDate(record.capture, locale)}</bdi>;
  return (
    <bdi dir="ltr">
      {formatCaptureDate(record.before ?? '', locale)}–{formatCaptureDate(record.after ?? '', locale)}
    </bdi>
  );
}

function EvidenceSheet({ citation, pageId, source, locale }: { citation: EvidenceCitation; pageId?: string; source: string; locale: string }) {
  const t = useTranslations('theses.sheet');
  const verdict = citation.verified;
  const verified = 'notEvaluable' in verdict ? null : verdict;
  return (
    <>
      <p className="text-sm text-slate-600">
        <bdi dir="ltr">{domainOf(citation.record.url)}</bdi> · <Interval record={citation.record} locale={locale} />
      </p>
      {citation.content.kind === 'CAPTURE' ? (
        <ResearcherWords className="max-h-60 overflow-y-auto text-sm leading-relaxed">{citation.content.text}</ResearcherWords>
      ) : (
        <div className="space-y-2">
          {citation.content.chunks.map((chunk, index) => (
            <div key={`${chunk.side}-${String(index)}`}>
              <p className="text-xs font-semibold text-slate-500">{chunk.side === 'before' ? t('before') : t('after')}</p>
              <ResearcherWords className="text-sm leading-relaxed">{chunk.text}</ResearcherWords>
            </div>
          ))}
        </div>
      )}
      {verified === null ? (
        <p className="text-sm text-slate-600">{t('notEvaluable', { reason: 'notEvaluable' in verdict ? verdict.notEvaluable : '' })}</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-600">
          {verified.captures.map((capture) => (
            <li key={capture.capture}>
              <bdi dir="ltr">{formatCaptureDate(capture.capture, locale)}</bdi> ·{' '}
              {capture.attributed === null ? t('attributionUnread') : capture.attributed ? t('attributed') : t('attributionUnread')}
              {capture.anchoredHashMatchesDocumentHash ? ` · ${t('hashMatches')}` : ''}
            </li>
          ))}
        </ul>
      )}
      {citation.flag.flagged ? (
        <ul className="space-y-1 text-sm text-amber-700">
          {citation.flag.reasons.map((reason) => (
            <li key={reason}>{t(`flag.${reason}`)}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-slate-600">
        {citation.argued ? t('argued') : null}
        {citation.argued ? ' · ' : ''}
        {t('overObjection', { answer: citation.overObjection ? t('yes') : t('no') })}
      </p>
      <p className="flex flex-wrap gap-3 text-sm">
        {pageId === undefined ? null : (
          <Link href={`/corpus?page=${pageId}`} className="underline">
            {t('openPage')}
          </Link>
        )}
        <Link href={`/records/${citation.name}`} className="underline">
          {t('openRecord')}
        </Link>
      </p>
      <CopyableCode value={source} label={t('copyToken')} />
    </>
  );
}

function TrajectorySheet({ citation, source, locale }: { citation: TrajectoryCitation; source: string; locale: string }) {
  const t = useTranslations('theses.sheet');
  const marks = useTranslations('theses.marks');
  if (!citation.resolves) return <p className="text-sm text-slate-600">{marks('trajectoryUnresolved')}</p>;
  return (
    <>
      <ResearcherWords className="text-sm leading-relaxed">{citation.claimText}</ResearcherWords>
      <p className="text-sm text-slate-600">
        <bdi dir="ltr">{domainOf(citation.url)}</bdi> · {t('transitions', { count: citation.transitions })}
      </p>
      <PlatformMark kind={citation.current ? 'trajectoryCurrent' : 'trajectoryStale'} />
      <CopyableCode value={source} label={t('copyToken')} />
      <span className="sr-only">{locale}</span>
    </>
  );
}

export function CitationChip({ kind, name, source, citation, pageId, locale }: ChipProps) {
  const t = useTranslations('theses');
  const sheet = useTranslations('theses.sheet');
  const [open, setOpen] = useState(false);
  const id = useId();
  const evidence = isEvidence(citation);

  const label = ((): React.ReactNode => {
    if (kind === 'unresolved') return t('chip.unresolved');
    if (kind === 'not-current') return t('chip.notCurrent');
    if (isTrajectory(citation)) {
      if (!citation.resolves) return t('marks.trajectoryUnresolved');
      return (
        <>
          {citation.claimText.split(/\s+/).slice(0, 5).join(' ')} · <bdi dir="ltr">{domainOf(citation.url)}</bdi>
        </>
      );
    }
    if (!evidence) return t('chip.unresolved');
    return (
      <>
        <bdi dir="ltr">{domainOf(citation.record.url)}</bdi> · <Interval record={citation.record} locale={locale} />
        {kind === 'repinned' ? ` · ${t('chip.repinned')}` : ''}
      </>
    );
  })();

  const openable = citation !== undefined && kind !== 'not-current' && kind !== 'unresolved';

  return (
    <span data-chip={name} data-chip-kind={kind} className="inline-flex items-center">
      <button
        type="button"
        disabled={!openable}
        onClick={() => setOpen((was) => !was)}
        aria-expanded={openable ? open : undefined}
        aria-controls={openable ? id : undefined}
        className="mx-0.5 inline-flex items-center gap-1 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-700 disabled:text-slate-500"
      >
        {label}
      </button>
      {/* A mark belongs to the pin it was computed for: a re-pinned chip shows the record and NO marks (M4). */}
      {kind === 'capture' || kind === 'diff' ? (
        <>
          {evidence && 'verified' in citation.verified && citation.verified.verified ? <PlatformMark kind="verified" /> : null}
          {evidence && citation.flag.flagged ? <PlatformMark kind="flagged" /> : null}
          {evidence && citation.argued ? <PlatformMark kind="argued" /> : null}
        </>
      ) : null}
      {kind === 'trajectory' && isTrajectory(citation) && citation.resolves ? (
        <PlatformMark kind={citation.current ? 'trajectoryCurrent' : 'trajectoryStale'} />
      ) : null}
      {/* PORTALLED to the document: the chip is INLINE inside a paragraph of the researcher's text, and a sheet
          rendered there would be a block inside a `<p>` — which the browser re-parents and React then cannot
          hydrate. It is also where a sheet over the page belongs (§4 :157–:158). */}
      {/* A server render has no document; `open` is false until the reader presses, which is after hydration. */}
      {open && citation !== undefined && typeof document !== 'undefined'
        ? createPortal(
            <div id={id} role="dialog" aria-modal="true" className="sheet space-y-2 p-4">
              {isEvidence(citation) ? (
                <EvidenceSheet citation={citation} pageId={pageId} source={source} locale={locale} />
              ) : (
                <TrajectorySheet citation={citation} source={source} locale={locale} />
              )}
              <button type="button" onClick={() => setOpen(false)} className="rounded border border-slate-300 px-2 py-1 text-xs">
                {sheet('close')}
              </button>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
