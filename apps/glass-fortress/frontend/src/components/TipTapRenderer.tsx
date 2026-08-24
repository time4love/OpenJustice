'use client';

import React, { useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import { truncateLabel } from '@/lib/format';
import { buildCitationNumbers, collapseCoMovementRuns } from '@/lib/citations';

export type EvidenceInfo = {
  evidenceId?: string;     // UUID — used for /evidence/:id links
  summary?: string;
  investigativeCategories?: string[];
  evidenceTier?: string;
  evidenceType?: string;   // 'DOCUMENT' | 'FORENSIC_DIFF'
  trackedUrlId?: string | null; // populated for FORENSIC_DIFF evidence
};
/**
 * What the server resolved for one cited claim trajectory.
 *
 * Note what this describes: presence in the archived TEXT EXTRACTION of each
 * capture, not presence on the page. The extraction discards part of every
 * page, so the two are different claims — see the caveat rendered beside the
 * detail list on the thesis page.
 */
export type TrajectoryInfo = {
  claimText: string;
  url: string;
  trackedUrlId: string;
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
  changes: { snapshotDate: string; present: boolean; snapshotUrl: string }[];
  observations: { snapshotDate: string; present: boolean; snapshotUrl: string }[];
  /** Identity of the movement — members of one co-movement share it. */
  coMovementKey: string;
  coMovementCount: number;
  coMovementCitedCount: number;
  computedAt: string;
  sourceStateHash: string;
  currency: { state: string; difference?: string };
};
type TipTapNodeObj = Record<string, unknown>;

interface Props {
  doc: Record<string, unknown>;
  evidenceMap?: Record<string, EvidenceInfo>;
  trajectoryMap?: Record<string, TrajectoryInfo>;
}

function renderInline(
  node: TipTapNodeObj,
  index: number,
  evidenceMap: Record<string, EvidenceInfo>,
  trajectoryMap: Record<string, TrajectoryInfo>,
  citationNumbers: Map<string, number>,
): React.ReactElement | null {
  if (node.type === 'text') {
    const text = String(node.text ?? '');
    const marks = node.marks as Array<{ type: string }> | undefined;
    let el: React.ReactElement | string = text;
    if (marks?.some((m) => m.type === 'italic')) el = <em key={`i${index}`}>{el}</em>;
    if (marks?.some((m) => m.type === 'bold')) el = <strong key={`b${index}`}>{el}</strong>;
    return <span key={index}>{el}</span>;
  }
  if (node.type === 'evidenceMention') {
    const attrs = node.attrs as TipTapNodeObj | undefined;
    const id = String(attrs?.['id'] ?? '');
    const info = evidenceMap[id];
    const isForensic = info?.evidenceType === 'FORENSIC_DIFF';
    const number = citationNumbers.get(id);
    const href = info?.evidenceId
      ? `/evidence/${info.evidenceId}`
      : isForensic && info?.trackedUrlId
        ? `/forensics/${info.trackedUrlId}`
        : `/evidence?hash=${encodeURIComponent(id)}`;
    // Footnote-style marker, not an inline text chip: embedding a 30+ character
    // evidence summary mid-sentence broke paragraph readability (user feedback,
    // GF mobile UX polish). The full summary lives in the evidence list below
    // instead — this is just the pointer to it.
    return (
      <Link
        key={index}
        href={href}
        title={info?.summary ? truncateLabel(info.summary, 80) : undefined}
        className={`text-[0.7em] font-semibold align-super mx-0.5 hover:underline ${
          isForensic ? 'text-red-600' : 'text-amber-700'
        }`}
      >
        [{number ?? '?'}]
      </Link>
    );
  }
  if (node.type === 'trajectoryMention') {
    const attrs = node.attrs as TipTapNodeObj | undefined;
    const id = String(attrs?.['id'] ?? '');
    const info = trajectoryMap[id];
    const number = citationNumbers.get(id);
    // Same footnote marker as evidence, in the deterministic layer's colour: a
    // trajectory is a string search anyone can re-run, and the detail — the
    // captures, the flips, and what the extraction can and cannot show — lives
    // in the list below rather than mid-sentence.
    return (
      <Link
        key={index}
        href={info ? `/forensics/${info.trackedUrlId}` : '#'}
        title={info ? truncateLabel(info.claimText, 80) : undefined}
        className="text-[0.7em] font-semibold align-super mx-0.5 hover:underline text-teal-700"
      >
        [{number ?? '?'}]
      </Link>
    );
  }
  if (node.type === 'keyFigureMention') {
    const attrs = node.attrs as TipTapNodeObj | undefined;
    const raw = String(attrs?.['label'] ?? attrs?.['id'] ?? '');
    const label = raw.startsWith('@') ? raw.slice(1) : raw;
    return (
      <Link
        key={index}
        href={`/evidence?entity=${encodeURIComponent(label)}`}
        className="inline-block bg-violet-100 hover:bg-violet-200 text-violet-700 text-xs font-medium px-2 py-0.5 rounded-full mx-0.5 transition-colors"
      >
        @{label}
      </Link>
    );
  }
  return null;
}

function renderInlineChildren(
  content: TipTapNodeObj[] | undefined,
  evidenceMap: Record<string, EvidenceInfo>,
  trajectoryMap: Record<string, TrajectoryInfo>,
  citationNumbers: Map<string, number>,
): (React.ReactElement | null)[] {
  return collapseCoMovementRuns(content ?? [], (id) => trajectoryMap[id]?.coMovementKey || id).map((c, i) =>
    renderInline(c, i, evidenceMap, trajectoryMap, citationNumbers),
  );
}

function renderNode(
  node: TipTapNodeObj,
  index: number,
  evidenceMap: Record<string, EvidenceInfo>,
  trajectoryMap: Record<string, TrajectoryInfo>,
  citationNumbers: Map<string, number>,
): React.ReactElement | null {
  const content = node.content as TipTapNodeObj[] | undefined;
  switch (node.type) {
    case 'paragraph': {
      if (!content?.length) return <div key={index} className="h-3" />;
      return (
        <p key={index} className="text-slate-700 text-sm leading-relaxed mb-3">
          {renderInlineChildren(content, evidenceMap, trajectoryMap, citationNumbers)}
        </p>
      );
    }
    case 'heading': {
      const level = Number((node.attrs as TipTapNodeObj | undefined)?.['level'] ?? 1);
      const children = renderInlineChildren(content, evidenceMap, trajectoryMap, citationNumbers);
      if (level === 1)
        return <h1 key={index} className="text-xl font-bold text-slate-900 mb-3 mt-6 first:mt-0">{children}</h1>;
      if (level === 2)
        return <h2 key={index} className="text-base font-semibold text-slate-800 mb-2 mt-4">{children}</h2>;
      return <h3 key={index} className="text-sm font-semibold text-slate-700 mb-2 mt-3">{children}</h3>;
    }
    case 'bulletList':
      return (
        <ul key={index} className="list-disc list-inside space-y-1 mb-3 ms-2">
          {(content ?? []).map((c, i) => renderNode(c, i, evidenceMap, trajectoryMap, citationNumbers))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={index} className="list-decimal list-inside space-y-1 mb-3 ms-2">
          {(content ?? []).map((c, i) => renderNode(c, i, evidenceMap, trajectoryMap, citationNumbers))}
        </ol>
      );
    case 'listItem': {
      const para = content?.[0] as TipTapNodeObj | undefined;
      const inlines = (para?.content as TipTapNodeObj[] | undefined) ?? [];
      return (
        <li key={index} className="text-slate-700 text-sm">
          {renderInlineChildren(inlines, evidenceMap, trajectoryMap, citationNumbers)}
        </li>
      );
    }
    default:
      return null;
  }
}

const NO_TRAJECTORIES: Record<string, TrajectoryInfo> = {};

export function TipTapRenderer({ doc, evidenceMap = {}, trajectoryMap = NO_TRAJECTORIES }: Props) {
  // Members of one co-movement share a footnote number, and only the first of a
  // run renders a marker — eight cited rows are one finding.
  const citationNumbers = useMemo(
    () => buildCitationNumbers(doc, (id) => trajectoryMap[id]?.coMovementKey || id),
    [doc, trajectoryMap],
  );
  const content = doc.content as TipTapNodeObj[] | undefined;
  return (
    <div>
      {(content ?? []).map((child, i) => renderNode(child, i, evidenceMap, trajectoryMap, citationNumbers))}
    </div>
  );
}
