'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { checkPublicationReadiness, publishThesis, unpublishThesis } from '@/lib/thesisApi';
import type { PublicationCheck, PublicationReport, PublicationState, PublishOutcome } from '@/types/thesis';
import { PublicationBadge } from '@/components/PublicationBadge';

// ---------------------------------------------------------------------------
// The researcher's publish / unpublish control.
//
// Publishing pins the HEAD version behind thirteen individually-reported
// checks (backend services/thesisPublication.ts). Hard checks block and the
// refusal names them; advisory checks never block but are recorded with the
// publication. The panel shows every check, pass or fail, so what is missing
// is visible before the researcher argues for it.
// ---------------------------------------------------------------------------

interface Props {
  thesisId: string;
  publication: PublicationState;
  publicInterestStatement: string | null;
  /** Called after a publish or unpublish succeeded, so the page reloads its state. */
  onChanged: () => Promise<unknown>;
}

function CheckRow({ check }: { check: PublicationCheck }) {
  const t = useTranslations('theses');
  const tone = check.passed
    ? 'text-emerald-700'
    : check.kind === 'hard'
      ? 'text-red-700'
      : 'text-amber-700';
  const details =
    check.details === undefined
      ? null
      : typeof check.details === 'string'
        ? check.details
        : JSON.stringify(check.details, null, 1);

  return (
    <li className="text-xs leading-relaxed">
      <span className={`font-semibold ${tone}`}>
        {check.passed ? '✓' : check.kind === 'hard' ? '✕' : '△'} {check.number}.{' '}
        {t(`publication.checks.${check.id}`)}
      </span>
      <span className="text-slate-400"> · {check.kind === 'hard' ? t('publication.hard') : t('publication.advisory')}</span>
      {check.binding === false && (
        <span className="text-slate-400"> · {t('publication.nonBinding')}</span>
      )}
      <div className="text-slate-600">{check.summary}</div>
      {details && !check.passed && (
        <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-slate-500 bg-slate-50 rounded p-2" dir="auto">
          {details}
        </pre>
      )}
    </li>
  );
}

export function ThesisPublicationPanel({ thesisId, publication, publicInterestStatement, onChanged }: Props) {
  const t = useTranslations('theses');
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState(publicInterestStatement ?? '');
  const [rationale, setRationale] = useState('');
  const [reason, setReason] = useState('');
  const [report, setReport] = useState<PublicationReport | null>(null);
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);
  const [busy, setBusy] = useState<'check' | 'publish' | 'unpublish' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setBusy('check');
    setError(null);
    setOutcome(null);
    try {
      setReport(
        await checkPublicationReadiness(thesisId, {
          rationale: rationale.trim() || undefined,
          publicInterestStatement: statement.trim() || undefined,
        }),
      );
    } catch {
      setError(t('publication.errorCheck'));
    } finally {
      setBusy(null);
    }
  }

  async function runPublish() {
    setBusy('publish');
    setError(null);
    try {
      const result = await publishThesis(thesisId, {
        rationale: rationale.trim(),
        publicInterestStatement: statement.trim() || undefined,
      });
      setOutcome(result);
      if ('report' in result) setReport(result.report);
      if (result.published) await onChanged();
    } catch {
      setError(t('publication.errorPublish'));
    } finally {
      setBusy(null);
    }
  }

  async function runUnpublish() {
    setBusy('unpublish');
    setError(null);
    try {
      await unpublishThesis(thesisId, reason.trim());
      setReason('');
      setOutcome(null);
      setReport(null);
      await onChanged();
    } catch {
      setError(t('publication.errorUnpublish'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-start"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">{t('publication.panelTitle')}</h2>
          <PublicationBadge publication={publication} />
        </div>
        <span className="text-slate-400 text-xs">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-5">
          <p className="text-xs text-slate-500 leading-relaxed">{t('publication.panelIntro')}</p>

          {publication.isPublished && (
            <p className="text-xs text-slate-600">
              {publication.headIsPublished
                ? t('publication.publicSeesHead')
                : t('publication.publicBehind', { count: publication.versionsAhead })}
              {publication.publishedBy && <span className="text-slate-400"> · {publication.publishedBy}</span>}
            </p>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">{t('publication.statementLabel')}</span>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={3}
              dir="auto"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
              placeholder={t('publication.statementPlaceholder')}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">{t('publication.rationaleLabel')}</span>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={5}
              dir="auto"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
              placeholder={t('publication.rationalePlaceholder')}
            />
            <span className="block text-[11px] text-slate-400">{t('publication.rationaleHint')}</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runCheck}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50"
            >
              {busy === 'check' ? t('publication.checking') : t('publication.checkBtn')}
            </button>
            <button
              type="button"
              onClick={runPublish}
              disabled={busy !== null || rationale.trim() === ''}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50"
            >
              {busy === 'publish' ? t('publication.publishing') : t('publication.publishBtn')}
            </button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {outcome && 'error' in outcome && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <span className="font-semibold">{outcome.error}</span> — {outcome.explanation}
            </div>
          )}

          {outcome && !('error' in outcome) && outcome.published && (
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
              <div className="font-semibold">{t('publication.publishedNotice')}</div>
              {outcome.overObjection && <div>{t('publication.overObjection')}</div>}
              {outcome.advisoryFailures.length > 0 && (
                <div>{t('publication.advisoryRecorded', { count: outcome.advisoryFailures.length })}</div>
              )}
            </div>
          )}

          {outcome && !('error' in outcome) && !outcome.published && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {t('publication.refusedNotice', { count: outcome.refusedBy.length })}
            </div>
          )}

          {report && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                {report.publishable ? t('publication.readyHeading') : t('publication.notReadyHeading')}
              </div>
              {report.assessment?.objection && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3" dir="auto">
                  <span className="font-semibold">{t('publication.objectionLabel')}:</span> {report.assessment.objection}
                </div>
              )}
              <ul className="space-y-2">
                {report.checks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </ul>
            </div>
          )}

          {publication.isPublished && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-700">{t('publication.unpublishReasonLabel')}</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  dir="auto"
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </label>
              <button
                type="button"
                onClick={runUnpublish}
                disabled={busy !== null || reason.trim() === ''}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 hover:bg-red-200 text-red-800 disabled:opacity-50"
              >
                {busy === 'unpublish' ? t('publication.unpublishing') : t('publication.unpublishBtn')}
              </button>
              <p className="text-[11px] text-slate-400">{t('publication.unpublishHint')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
