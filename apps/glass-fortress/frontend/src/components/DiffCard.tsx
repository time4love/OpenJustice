'use client';

import { useState } from 'react';
import { ClaimBlock } from '@/components/ClaimBlock';
import { addEvidenceToThesis } from '@/lib/thesisDocument';
import { fetchTheses } from '@/lib/thesisApi';
import type { ThesisSummary as FullThesisSummary } from '@/types/thesis';

// ---------------------------------------------------------------------------
// Types — the shape every forensic diff-listing endpoint returns
// (GET /api/forensics/tracked/:id and its /report sibling).
// ---------------------------------------------------------------------------

export interface PromotedEvidence {
  id: string;
  fileHash: string;
  /**
   * CONFIRMED means a person reviewed this and accepted it. PENDING_REVIEW
   * means a scan recorded it as a candidate and nobody has decided yet. The
   * card must never collapse the two — see EvidenceStatusChip.
   */
  status: 'PENDING_REVIEW' | 'CONFIRMED' | 'REJECTED';
}

export interface DiffItem {
  summary: string;
  exactQuote: string;
}

export interface DiffRecord {
  id: string;
  beforeDate: string;
  date: string;
  snapshotUrl: string;
  beforeSnapshotUrl: string | null;
  deletedItems: DiffItem[];
  addedItems: DiffItem[];
  rawDeletedChunks: string[];
  rawAddedChunks: string[];
  legalSignificance: string;
  isLegallySignificant: boolean;
  promotedEvidence: PromotedEvidence | null;
}

export interface DiffCardLabels {
  deletionsLabel: string;
  additionsLabel: string;
  forensicLabel: string;
  viewSnapshot: string;
  viewBeforeSnapshot: string;
  promotedChip: string;
  pendingReviewChip: string;
  flaggedBadge: string;
  auditBadge: string;
  showChanges: string;
  hideChanges: string;
  addToThesis: {
    addBtn: string;
    saving: string;
    done: string;
    pick: string;
    loading: string;
    empty: string;
    untitled: (id: string) => string;
  };
}

// Wayback snapshot URLs embed their capture time: /web/YYYYMMDDHHMMSS/<url>.
// Extracted purely for display — no extra network round-trip needed since the
// URL is already on the diff record.
function extractWaybackTime(url: string): string | null {
  const match = /\/web\/(\d{14})\//.exec(url);
  if (!match) return null;
  const ts = match[1] as string;
  return `${ts.slice(8, 10)}:${ts.slice(10, 12)}`;
}

// ---------------------------------------------------------------------------
// AddToThesisButton — fetch thesis list, pick one, append evidence mention
// ---------------------------------------------------------------------------

type ThesisSummary = Pick<FullThesisSummary, 'id' | 'createdAt' | 'version'>;

function AddToThesisButton({
  fileHash,
  evidenceSummary,
  labels,
}: {
  fileHash: string;
  evidenceSummary: string;
  labels: DiffCardLabels['addToThesis'];
}) {
  const [state, setState] = useState<'idle' | 'open' | 'saving' | 'done'>('idle');
  const [theses, setTheses] = useState<ThesisSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  async function openPicker() {
    if (state === 'open') { setState('idle'); return; }
    setState('open');
    if (theses.length > 0) return;
    setLoadingList(true);
    try {
      setTheses(await fetchTheses());
    } finally {
      setLoadingList(false);
    }
  }

  async function addTo(thesis: ThesisSummary) {
    setState('saving');
    try {
      await addEvidenceToThesis(thesis.id, fileHash, evidenceSummary);
      setState('done');
    } catch {
      setState('open');
    }
  }

  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        {labels.done}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => { void openPicker(); }}
        disabled={state === 'saving'}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-100 hover:bg-violet-200 text-violet-700 disabled:opacity-40 transition-colors"
      >
        {state === 'saving' ? labels.saving : labels.addBtn}
      </button>

      {state === 'open' && (
        <div className="absolute bottom-full mb-2 end-0 z-30 w-64 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600">{labels.pick}</p>
          </div>
          {loadingList && <p className="text-xs text-slate-400 px-3 py-3">{labels.loading}</p>}
          {!loadingList && theses.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-3">{labels.empty}</p>
          )}
          {!loadingList && theses.map(th => (
            <button
              key={th.id}
              onClick={() => { void addTo(th); }}
              className="w-full text-start px-3 py-2.5 hover:bg-violet-50 border-b border-slate-100 last:border-0 transition-colors"
            >
              <p className="text-xs font-medium text-slate-700 truncate">
                {th.version?.preview?.slice(0, 50) || labels.untitled(th.id.slice(0, 8))}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(th.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence status chip
//
// Replaces a "Promote to Evidence" button that POSTed to an unauthenticated
// endpoint. Adding data to this system goes through MCP, where the caller is an
// authenticated, approved researcher.
//
// It also stops the card asserting something untrue. The chip used to render
// from the mere PRESENCE of an Evidence row, and a scan writes a row for every
// finding it records — as PENDING_REVIEW, explicitly awaiting a person. So an
// unreviewed candidate displayed as "promoted": the exact claim the review
// exists to make, made on the reviewer's behalf, in front of the reviewer.
// The status decides what is shown; nothing is inferred from existence.
// ---------------------------------------------------------------------------

function EvidenceStatusChip({
  promoted,
  labels,
}: {
  promoted: PromotedEvidence | null;
  labels: DiffCardLabels;
}) {
  if (!promoted) return null;

  const confirmed = promoted.status === 'CONFIRMED';

  return (
    <span
      className={
        confirmed
          ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200'
      }
      dir="auto"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${confirmed ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      {confirmed ? labels.promotedChip : labels.pendingReviewChip}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DiffCard — the single shared rendering of a forensic diff, used by both the
// full-history timeline (forensics/[trackedUrlId]) and, after a fresh scan
// completes, the redirect target off the scanner page. One component so a
// data-shape or labeling drift between the two surfaces can't happen again.
// ---------------------------------------------------------------------------

export function DiffCard({
  diff,
  index,
  labels,
}: {
  diff: DiffRecord;
  index: number;
  labels: DiffCardLabels;
}) {
  const [expanded, setExpanded] = useState(false);
  const sig = diff.isLegallySignificant;

  const hasDeletions = diff.deletedItems.length > 0 || diff.rawDeletedChunks.length > 0;
  const hasAdditions = diff.addedItems.length > 0 || diff.rawAddedChunks.length > 0;
  const hasChanges = hasDeletions || hasAdditions;

  // Wayback can archive the same calendar day more than once — show the time
  // too when that happens, otherwise it's just noise.
  const sameDay = diff.beforeDate === diff.date;
  const beforeTime = sameDay && diff.beforeSnapshotUrl ? extractWaybackTime(diff.beforeSnapshotUrl) : null;
  const afterTime = sameDay ? extractWaybackTime(diff.snapshotUrl) : null;

  // Visual tokens driven by significance
  const dotClass = sig
    ? 'bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.5)]'
    : 'bg-slate-400';
  const cardClass = sig
    ? 'border-red-400 shadow-md bg-red-50/30'
    : 'border-slate-200 shadow-sm bg-white';
  const headerClass = sig
    ? 'border-b border-red-200 bg-red-50'
    : 'border-b border-slate-100 bg-slate-50';
  const footerClass = sig ? 'border-t border-red-100/60' : 'border-t border-slate-100';

  return (
    <div className="flex gap-3 sm:gap-4 mb-5 last:mb-0">
      {/* Spine */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-3 h-3 rounded-full ring-2 ring-slate-50 mt-[1.125rem] shrink-0 ${dotClass}`}
        />
        <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-8" />
      </div>

      {/* Card */}
      <div className={`flex-1 min-w-0 rounded-xl border overflow-hidden ${cardClass}`}>
        {/* Header */}
        <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 ${headerClass}`}>
          <span className="font-mono text-xs text-slate-400 shrink-0">
            {diff.beforeDate}{beforeTime && <span className="text-slate-300"> {beforeTime}</span>}
          </span>
          <span className="text-xs text-slate-300 shrink-0">→</span>
          <span className="font-mono text-xs text-slate-600 font-medium shrink-0">
            {diff.date}{afterTime && <span className="text-slate-400"> {afterTime}</span>}
          </span>
          {sig ? (
            <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-300 uppercase tracking-wide">
              {labels.flaggedBadge}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200 uppercase tracking-wide">
              {labels.auditBadge}
            </span>
          )}
          <span className="ms-auto text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* AI Forensic Analysis — the model's rationale, shown regardless of
              significance so a "Version Change" badge always comes with the reasoning
              behind it instead of a bare label. */}
          {diff.legalSignificance && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {labels.forensicLabel}
              </span>
              <p
                className={`text-sm text-slate-700 leading-relaxed border-s-2 ps-3 ${
                  sig ? 'border-red-400' : 'border-slate-300'
                }`}
                dir="auto"
              >
                {diff.legalSignificance}
              </p>
            </div>
          )}

          {/* Expand/collapse toggle — only when there are diffs to show */}
          {hasChanges && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                expanded
                  ? sig
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : sig
                    ? 'bg-red-50/60 text-red-500 hover:bg-red-100'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <span>{expanded ? labels.hideChanges : labels.showChanges}</span>
              <svg
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Collapsible diff details */}
          {expanded && hasChanges && (
            <div className="space-y-4">
              {/* Deletions */}
              {hasDeletions && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-red-600 uppercase tracking-widest">
                    {labels.deletionsLabel}
                  </span>
                  <div className="space-y-2">
                    {diff.deletedItems.length > 0
                      ? diff.deletedItems.map((item, i) => (
                          <ClaimBlock
                            key={`del-${i}`}
                            claim={item.summary}
                            rawChunk={item.exactQuote || undefined}
                            type="deleted"
                          />
                        ))
                      : diff.rawDeletedChunks.map((chunk, i) => (
                          <ClaimBlock key={`del-raw-${i}`} claim={null} rawChunk={chunk} type="deleted" />
                        ))}
                  </div>
                </div>
              )}

              {/* Additions */}
              {hasAdditions && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                    {labels.additionsLabel}
                  </span>
                  <div className="space-y-2">
                    {diff.addedItems.length > 0
                      ? diff.addedItems.map((item, i) => (
                          <ClaimBlock
                            key={`add-${i}`}
                            claim={item.summary}
                            rawChunk={item.exactQuote || undefined}
                            type="added"
                          />
                        ))
                      : diff.rawAddedChunks.map((chunk, i) => (
                          <ClaimBlock key={`add-raw-${i}`} claim={null} rawChunk={chunk} type="added" />
                        ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer — promote button + add to thesis + archive links */}
          <div className={`flex flex-wrap items-center justify-between gap-3 pt-1 ${footerClass}`}>
            <div className="flex flex-wrap items-center gap-2">
              <EvidenceStatusChip promoted={diff.promotedEvidence} labels={labels} />
              {diff.promotedEvidence && (
                <AddToThesisButton
                  fileHash={diff.promotedEvidence.fileHash}
                  evidenceSummary={diff.legalSignificance.slice(0, 40) || diff.promotedEvidence.fileHash.slice(0, 12)}
                  labels={labels.addToThesis}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {diff.beforeSnapshotUrl && (
                <a
                  href={diff.beforeSnapshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline transition-colors"
                >
                  {labels.viewBeforeSnapshot}
                  <span aria-hidden="true">&#x2197;</span>
                </a>
              )}
              <a
                href={diff.snapshotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
              >
                {labels.viewSnapshot}
                <span aria-hidden="true">&#x2197;</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
