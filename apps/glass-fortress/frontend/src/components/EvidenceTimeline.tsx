'use client';

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { CategoryBadges } from '@/components/CategoryBadges';
import { SkeletonRows } from '@/components/SkeletonRows';
import { TierBadge } from '@/components/TierBadge';
import { perspectiveStyles } from '@/lib/evidencePerspective';
import { usePromoteAction } from '@/hooks/usePromoteAction';
import type { EvidenceMetadata as SharedEvidenceMetadata } from '@/types/evidence';

// evidenceId is always populated by the backend's shared mapEvidenceToRecord
// (used by both /timeline and /search), but stays optional on the shared
// frontend type for other, older call sites — narrow it here since every
// record rendered by this component does have it.
export type EvidenceMetadata = SharedEvidenceMetadata & { evidenceId: string };

export interface TimelineRecord {
  content: string;
  metadata: EvidenceMetadata;
  score?: number;
}

export interface NodeLabels {
  unknownDate: string;
  keyFigures: string;
  medicalContext: string;
  statisticalClaims: string;
  regulatoryMentions: string;
  euaOmitted: string;
  euaMentioned: string;
  perspective: string;
  roleIncriminating: string;
  roleContextAnchor: string;
  targetEntityLabel: string;
  viewSource: string;
  viewDiffHistory: string;
  pendingReviewBadge: string;
  pendingReviewNote: string;
  promoteToVault: string;
  promoting: string;
  promoteSuccess: string;
  promoteError: string;
  relevanceLabel: (pct: number) => string;
}

// ---------------------------------------------------------------------------
// Promote button
// ---------------------------------------------------------------------------

function PromoteButton({
  fileHash,
  labels,
  onPromoted,
}: {
  fileHash: string;
  labels: NodeLabels;
  onPromoted: () => void;
}) {
  const { state, error, run } = usePromoteAction(async () => {
    const res = await fetch(apiUrl('/api/evidence/promote'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileHash }),
    });
    if (res.ok) {
      setTimeout(onPromoted, 1200);
      return { ok: true };
    }
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: data?.message };
  });

  if (state === 'done') {
    return (
      <span className="text-xs font-semibold text-emerald-600">{labels.promoteSuccess}</span>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => void run()}
        disabled={state === 'loading'}
        className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white transition-colors"
      >
        {state === 'loading' ? labels.promoting : labels.promoteToVault}
      </button>
      {state === 'error' && (
        <p className="text-xs text-red-600">{error ?? labels.promoteError}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline node card
// ---------------------------------------------------------------------------

function CollapsibleChipRow({
  label,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase tracking-widest shrink-0 hover:text-slate-600 transition-colors"
      >
        <span>{label} ({count})</span>
        <span className={`inline-block transition-transform ${expanded ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {expanded && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}
    </div>
  );
}

function TimelineNode({
  record,
  index,
  labels,
  onPromoted,
}: {
  record: TimelineRecord;
  index: number;
  labels: NodeLabels;
  onPromoted: (fileHash: string) => void;
}) {
  const { metadata, score } = record;
  const styles = perspectiveStyles(metadata.evidencePerspective);
  const isUnknown = metadata.evidenceDate === 'Unknown';
  const isPending = metadata.status === 'PENDING_REVIEW';
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) =>
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  const router = useRouter();
  const goToEvidence = () => router.push(`/evidence/${metadata.evidenceId}`);

  return (
    <div className="flex gap-3 sm:gap-4 mb-5 last:mb-0">
      {/* Spine column — sits on logical start, so right in RTL */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-3 h-3 rounded-full ring-2 ring-slate-50 shadow-sm mt-[1.125rem] shrink-0 ${styles.dot}`}
        />
        <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-8" />
      </div>

      {/* Card — full width on mobile. The whole card navigates to the evidence
          page (was a separate "View Evidence" link before) — every nested
          interactive element (toggles, promote button, chip links, the
          remaining footer links) stops propagation so it doesn't also
          trigger this. */}
      <div
        role="link"
        tabIndex={0}
        onClick={goToEvidence}
        onKeyDown={(e) => { if (e.key === 'Enter') goToEvidence(); }}
        className={`flex-1 min-w-0 rounded-xl border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${styles.card} ${styles.border}`}
      >
        {/* Card header */}
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 border-b ${styles.header}`}
        >
          {/* Date */}
          <span
            className={`font-mono text-xs shrink-0 ${
              isUnknown ? 'text-slate-300 italic' : 'text-slate-500 font-medium'
            }`}
          >
            {isUnknown ? labels.unknownDate : metadata.evidenceDate}
          </span>

          {/* Tier */}
          <TierBadge tier={metadata.tier} />

          {/* Perspective badge */}
          {metadata.evidencePerspective && (
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${styles.badge}`}
            >
              {labels.perspective}
            </span>
          )}

          {/* Role badge */}
          {metadata.evidenceRole && (
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                metadata.evidenceRole === 'Incriminating'
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {metadata.evidenceRole === 'Incriminating'
                ? labels.roleIncriminating
                : labels.roleContextAnchor}
            </span>
          )}

          {/* Category */}
          <CategoryBadges categories={metadata.investigativeCategories} max={2} />

          {/* Pending badge */}
          {isPending && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-300">
              {labels.pendingReviewBadge}
            </span>
          )}

          {/* Relevance (search mode) or index (timeline mode) */}
          {score !== undefined ? (
            <span className="ms-auto text-xs font-mono text-slate-400 shrink-0">
              {labels.relevanceLabel(Math.round(score * 100))}
            </span>
          ) : (
            <span className="ms-auto text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
          )}
        </div>

        {/* Card body */}
        <div className="px-4 py-3 space-y-3">
          {isPending && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                <span className="text-xs text-amber-800 leading-snug">{labels.pendingReviewNote}</span>
              </div>
              <PromoteButton
                fileHash={metadata.fileHash}
                labels={labels}
                onPromoted={() => onPromoted(metadata.fileHash)}
              />
            </div>
          )}
          {metadata.euaOmissionStatus === 'Omits EUA (Misleading)' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-300">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wide">
                {labels.euaOmitted}
              </span>
            </div>
          )}
          {metadata.euaOmissionStatus === 'Explicitly Mentions EUA' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
              <span className="text-xs font-medium text-slate-600">{labels.euaMentioned}</span>
            </div>
          )}

          <p className="text-sm text-slate-700 leading-relaxed" dir="auto">
            {metadata.summary}
          </p>

          {((metadata.figures?.length ?? 0) > 0 ||
            (metadata.medicalConditions?.length ?? 0) > 0 ||
            (metadata.statisticalClaims?.length ?? 0) > 0 ||
            (metadata.regulatoryMentions?.length ?? 0) > 0) && (
            <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
              {(metadata.figures?.length ?? 0) > 0 && (
                <CollapsibleChipRow
                  label={labels.keyFigures}
                  count={metadata.figures!.length}
                  expanded={expandedSections.has('figures')}
                  onToggle={() => toggleSection('figures')}
                >
                  {metadata.figures!.map((f) => (
                    <Link
                      key={f.id}
                      href={`/figures?id=${f.id}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                    >
                      {f.name}
                    </Link>
                  ))}
                </CollapsibleChipRow>
              )}
              {(metadata.medicalConditions?.length ?? 0) > 0 && (
                <CollapsibleChipRow
                  label={labels.medicalContext}
                  count={metadata.medicalConditions!.length}
                  expanded={expandedSections.has('medicalConditions')}
                  onToggle={() => toggleSection('medicalConditions')}
                >
                  {metadata.medicalConditions!.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      {c}
                    </span>
                  ))}
                </CollapsibleChipRow>
              )}
              {(metadata.statisticalClaims?.length ?? 0) > 0 && (
                <CollapsibleChipRow
                  label={labels.statisticalClaims}
                  count={metadata.statisticalClaims!.length}
                  expanded={expandedSections.has('statisticalClaims')}
                  onToggle={() => toggleSection('statisticalClaims')}
                >
                  {metadata.statisticalClaims!.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200"
                    >
                      {c}
                    </span>
                  ))}
                </CollapsibleChipRow>
              )}
              {(metadata.regulatoryMentions?.length ?? 0) > 0 && (
                <CollapsibleChipRow
                  label={labels.regulatoryMentions}
                  count={metadata.regulatoryMentions!.length}
                  expanded={expandedSections.has('regulatoryMentions')}
                  onToggle={() => toggleSection('regulatoryMentions')}
                >
                  {metadata.regulatoryMentions!.map((m, i) => (
                    <span
                      key={`${m}-${i}`}
                      className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200"
                    >
                      {m}
                    </span>
                  ))}
                </CollapsibleChipRow>
              )}
            </div>
          )}

          {/* Footer row — plain context label on one side, remaining action
              links grouped together on the other. The raw fileHash/evidenceId
              hex is deliberately not displayed here — it's an internal
              identifier, not something a reader needs to see. There's no
              separate "View Evidence" link any more — the whole card is the
              link now — so every link left here stops propagation to avoid
              also triggering that card-level navigation. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 border-t border-slate-100/80">
            <span className="text-xs text-slate-500">
              <span className="text-slate-400">{labels.targetEntityLabel}: </span>
              {metadata.targetEntity}
            </span>
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 ms-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {(metadata.sourceUrl ?? metadata.fileUrl) && (
                <a
                  href={metadata.sourceUrl ?? metadata.fileUrl ?? ''}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                >
                  {labels.viewSource}
                  <span aria-hidden="true">↗</span>
                </a>
              )}
              {metadata.trackedUrlId && (
                <Link
                  href={`/forensics/${metadata.trackedUrlId}`}
                  className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800 hover:underline transition-colors"
                >
                  {labels.viewDiffHistory}
                  <span aria-hidden="true">&#x2197;</span>
                </Link>
              )}
              {/* No "citing investigations" link here — there's no public
                  destination for it today: /theses is the researcher-only
                  builder, and /call (the public investigations list) doesn't
                  support filtering by evidence. Removed rather than pointed
                  at the wrong audience; revisit once that view exists. */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified vertical timeline / results list
// ---------------------------------------------------------------------------

export function UnifiedTimeline({
  records,
  labels,
  onPromoted,
}: {
  records: TimelineRecord[];
  labels: NodeLabels & { getPerspectiveLabel: (p?: string) => string };
  onPromoted: (fileHash: string) => void;
}) {
  return (
    <div>
      {records.map((record, i) => (
        <TimelineNode
          key={record.metadata.fileHash}
          record={record}
          index={i}
          labels={{ ...labels, perspective: labels.getPerspectiveLabel(record.metadata.evidencePerspective) }}
          onPromoted={onPromoted}
        />
      ))}
    </div>
  );
}

export function TimelineSkeleton() {
  return (
    <SkeletonRows
      rows={4}
      headerBarWidths={['w-20', 'w-28']}
      bodyLineWidths={['', 'w-5/6', 'w-4/6']}
    />
  );
}
