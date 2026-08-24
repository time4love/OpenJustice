'use client';

import React, { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { EvidenceInfo, TrajectoryInfo } from '@/components/TipTapRenderer';

// ---------------------------------------------------------------------------
// One citation, opened from the footnote marker that points at it.
//
// The thesis page used to stand every source open below the argument: seven
// evidence chips and, once a real co-movement was cited, eight trajectory
// panels each carrying a collapsible list of eighty-three archived captures.
// All of it true, none of it readable — and the reader following [7] had to
// find [7] in the pile themselves.
//
// A citation is consulted, not read straight through. So the marker opens the
// one source it names, and the full apparatus stays available as a compact list
// under the argument.
// ---------------------------------------------------------------------------

export type CitationTarget =
  | { kind: 'evidence'; hash: string; number?: number; info: EvidenceInfo | undefined }
  | { kind: 'trajectory'; number?: number; info: TrajectoryInfo; claims: string[] };

interface Props {
  target: CitationTarget;
  locale: string;
  onClose: () => void;
}

export function CitationSheet({ target, locale, onClose }: Props) {
  const t = useTranslations('theses');

  // Escape closes it. A sheet with no keyboard exit is a trap for anyone not
  // using a mouse, and this one can open over a long RTL document.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 print:hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={target.kind === 'evidence' ? t('evidenceSuggestion') : t('trajectoriesTitle')}
    >
      {/* Bottom sheet on a phone, centred card from sm up — a citation is
          consulted mid-sentence, and on mobile that means thumb-height. */}
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${target.kind === 'evidence' ? 'text-amber-700' : 'text-teal-700'}`}>
              {target.number ? `[${String(target.number)}]` : '#'}
            </span>
            <h2 className="text-sm font-semibold text-slate-900">
              {target.kind === 'evidence' ? t('evidenceSuggestion') : t('trajectoriesTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none transition-colors p-1"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {target.kind === 'evidence'
            ? <EvidenceBody hash={target.hash} info={target.info} />
            : <TrajectoryBody info={target.info} claims={target.claims} locale={locale} />}
        </div>
      </div>
    </div>
  );
}

function EvidenceBody({ hash, info }: { hash: string; info: EvidenceInfo | undefined }) {
  const t = useTranslations('theses');
  const isForensic = info?.evidenceType === 'FORENSIC_DIFF';
  const href = info?.evidenceId
    ? `/evidence/${info.evidenceId}`
    : isForensic && info.trackedUrlId
      ? `/forensics/${info.trackedUrlId}`
      : `/evidence?hash=${encodeURIComponent(hash)}`;

  return (
    <>
      <p className="text-sm text-slate-700 leading-relaxed" dir="auto">
        {info?.summary ?? hash}
      </p>
      {info?.evidenceTier && (
        <p className="text-xs text-slate-500">{info.evidenceTier}</p>
      )}
      <Link href={href} className="inline-block text-xs font-medium text-amber-700 hover:underline">
        {t('openEvidence')} ←
      </Link>
    </>
  );
}

function TrajectoryBody({ info, claims, locale }: { info: TrajectoryInfo; claims: string[]; locale: string }) {
  const t = useTranslations('theses');

  return (
    <>
      <div className="space-y-1">
        {claims.map((claim, i) => (
          <p key={i} className="text-sm text-slate-700 leading-relaxed" dir="auto">{claim}</p>
        ))}
      </div>

      {info.coMovementCount > 1 && (
        <p className="text-xs font-medium text-teal-800">
          {t('trajectoryCoMovement', { count: info.coMovementCount })}
          {' · '}
          {t('trajectoryCoMovementCited', { cited: info.coMovementCitedCount })}
        </p>
      )}

      {/* The flips, each linked to the capture it was measured in. */}
      <ul className="space-y-1">
        {info.changes.map(c => (
          <li key={`${c.snapshotDate}-${c.snapshotUrl}`} className="text-xs text-slate-600">
            <span className="font-mono">{c.snapshotDate}</span>
            {' — '}
            <span className={c.present ? 'text-emerald-700' : 'text-red-700'}>
              {c.present ? t('trajectoryAppeared') : t('trajectoryDisappeared')}
            </span>
            {' · '}
            <a href={c.snapshotUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
              {t('trajectoryViewCapture')}
            </a>
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-600">
        {info.finalState === 'PRESENT' ? t('trajectoryFinalPresent') : t('trajectoryFinalRemoved')}
      </p>

      {/* Every capture examined, not only the flips: a claim absent across nine
          consecutive captures is a different finding from one absent across two,
          and the absences are what show it. */}
      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">
          {t('trajectoryAllCaptures', { count: info.observations.length })}
        </summary>
        <ul className="mt-2 space-y-1 ms-3">
          {info.observations.map(o => (
            <li key={`${o.snapshotDate}-${o.snapshotUrl}`}>
              <a
                href={o.snapshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-teal-700 hover:underline"
              >
                {o.snapshotDate}
              </a>
              {' — '}
              {o.present ? t('trajectoryAppeared') : t('trajectoryDisappeared')}
            </li>
          ))}
        </ul>
      </details>

      {/* §3.3 of the citation plan: a trajectory describes an archived text
          EXTRACTION, never the page. Stated beside the finding, not in a doc. */}
      <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-3">
        {t('trajectoryCaveat')}
      </p>

      <p className="text-[11px] text-slate-400">
        {t('trajectoryPinned', {
          date: new Date(info.computedAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US'),
        })}
      </p>

      {/* Pinned for integrity, current for honesty — both, and labelled. */}
      {info.currency.state === 'RECOMPUTED_DISAGREES' && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {t('trajectoryRecomputed')}
          {info.currency.difference ? ` ${info.currency.difference}` : ''}
        </p>
      )}
      {info.currency.state === 'NOT_FOLLOWED_BY_LATEST' && (
        <p className="text-xs text-slate-500">{t('trajectoryNotFollowed')}</p>
      )}
    </>
  );
}
