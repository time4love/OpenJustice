'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CopyableCode } from '@/components/CopyableCode';
import { domainOf, formatCaptureDate } from '@/lib/format';
import type { EvidenceCitation, TrajectoryCitation } from '@/types/thesis';
import { PlatformMark } from './PlatformMark';
import { ResearcherWords } from './ResearcherWords';

// ---------------------------------------------------------------------------
// THE RECORD, AS A RIGHT-PANE TAB — docs/gf-ui-flows.md §18 as amended 2026-09-16 ("the citation
// record opens as a right-pane tab at width and full-screen on the phone"); §10 :1124; canvas page 1
// board B (`recordPane()`) and page 3 board E.
//
// THIS IS WHERE THE MARKS' WORDS LIVE NOW (§10 :1122; the researcher's Q4, CONFIRMED). They used to
// render inline beside the citation, in the same face and size as the sentence they judged. Every one
// of them is here, in the platform's own register, beside the record they judge — „מאומת מול העוגן”,
// „עוגן בידי הפלטפורמה”, „הגיבוב המעוגן זהה לגיבוב המסמך”, „נטען בדיון”, „למרות התנגדות המעריך”.
//
// IT COMPUTES NOTHING. Every mark is a FIELD OF THE BODY (§21 :626–:627); the pane re-derives no
// verdict, and `notEvaluable` is shown as the REASON it is, never as a failure (§18 :571).
// ---------------------------------------------------------------------------

export function EvidenceRecordPane({ citation, pageId, source, locale }: { citation: EvidenceCitation; pageId?: string; source: string; locale: string }) {
  const t = useTranslations('theses.sheet');
  const verdict = citation.verified;
  const verified = 'notEvaluable' in verdict ? null : verdict;
  const { record } = citation;
  const heading =
    record.capture === undefined
      ? t('diff', { before: formatCaptureDate(record.before ?? '', locale), after: formatCaptureDate(record.after ?? '', locale) })
      : t('capture', { date: formatCaptureDate(record.capture, locale) });

  return (
    <div data-record className="record space-y-3">
      <p className="record-head">
        <bdi dir="ltr">{domainOf(record.url)}</bdi>
      </p>
      <h2 className="record-title">{heading}</h2>

      {/* THE MARKS' WORDS, in one place, beside what they judge. */}
      <p className="record-marks">
        {verified?.verified === true ? <PlatformMark kind="verified" /> : null}
        {citation.flag.flagged ? <PlatformMark kind="flagged" /> : null}
        {citation.argued ? <PlatformMark kind="argued" /> : null}
        {citation.overObjection ? <PlatformMark kind="overObjection" /> : null}
      </p>

      {verified === null ? (
        <p className="record-meta">{t('notEvaluable', { reason: 'notEvaluable' in verdict ? verdict.notEvaluable : '' })}</p>
      ) : (
        <ul className="record-meta space-y-1">
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
        <ul className="record-meta space-y-1">
          {citation.flag.reasons.map((reason) => (
            <li key={reason}>{t(`flag.${reason}`)}</li>
          ))}
        </ul>
      ) : null}

      {citation.content.kind === 'CAPTURE' ? (
        <ResearcherWords className="record-captured">{citation.content.text}</ResearcherWords>
      ) : (
        <div className="space-y-2">
          {citation.content.chunks.map((chunk, index) => (
            <div key={`${chunk.side}-${String(index)}`}>
              <p className="record-register">{chunk.side === 'before' ? t('before') : t('after')}</p>
              <ResearcherWords className="record-captured">{chunk.text}</ResearcherWords>
            </div>
          ))}
        </div>
      )}

      <p className="record-links">
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
    </div>
  );
}

export function TrajectoryRecordPane({ citation, source }: { citation: TrajectoryCitation; source: string }) {
  const t = useTranslations('theses.sheet');
  const marks = useTranslations('theses.marks');
  if (!citation.resolves) return <p className="record-meta">{marks('trajectoryUnresolved')}</p>;
  return (
    <div data-record className="record space-y-3">
      <p className="record-head">
        <bdi dir="ltr">{domainOf(citation.url)}</bdi>
      </p>
      <ResearcherWords className="record-captured">{citation.claimText}</ResearcherWords>
      <p className="record-meta">{t('transitions', { count: citation.transitions })}</p>
      <p className="record-marks">
        <PlatformMark kind={citation.current ? 'trajectoryCurrent' : 'trajectoryStale'} />
      </p>
      <CopyableCode value={source} label={t('copyToken')} />
    </div>
  );
}
