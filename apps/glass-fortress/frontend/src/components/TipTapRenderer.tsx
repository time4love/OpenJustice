'use client';

import React, { useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import { truncateLabel } from '@/lib/format';
import { buildEvidenceCitationNumbers } from '@/lib/citations';

export type EvidenceInfo = {
  evidenceId?: string;     // UUID — used for /evidence/:id links
  summary?: string;
  investigativeCategories?: string[];
  evidenceTier?: string;
  evidenceType?: string;   // 'DOCUMENT' | 'FORENSIC_DIFF'
  trackedUrlId?: string | null; // populated for FORENSIC_DIFF evidence
};
type TipTapNodeObj = Record<string, unknown>;

interface Props {
  doc: Record<string, unknown>;
  evidenceMap?: Record<string, EvidenceInfo>;
}

function renderInline(
  node: TipTapNodeObj,
  index: number,
  evidenceMap: Record<string, EvidenceInfo>,
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

function renderNode(
  node: TipTapNodeObj,
  index: number,
  evidenceMap: Record<string, EvidenceInfo>,
  citationNumbers: Map<string, number>,
): React.ReactElement | null {
  const content = node.content as TipTapNodeObj[] | undefined;
  switch (node.type) {
    case 'paragraph': {
      if (!content?.length) return <div key={index} className="h-3" />;
      return (
        <p key={index} className="text-slate-700 text-sm leading-relaxed mb-3">
          {content.map((c, i) => renderInline(c, i, evidenceMap, citationNumbers))}
        </p>
      );
    }
    case 'heading': {
      const level = Number((node.attrs as TipTapNodeObj | undefined)?.['level'] ?? 1);
      const children = (content ?? []).map((c, i) => renderInline(c, i, evidenceMap, citationNumbers));
      if (level === 1)
        return <h1 key={index} className="text-xl font-bold text-slate-900 mb-3 mt-6 first:mt-0">{children}</h1>;
      if (level === 2)
        return <h2 key={index} className="text-base font-semibold text-slate-800 mb-2 mt-4">{children}</h2>;
      return <h3 key={index} className="text-sm font-semibold text-slate-700 mb-2 mt-3">{children}</h3>;
    }
    case 'bulletList':
      return (
        <ul key={index} className="list-disc list-inside space-y-1 mb-3 ms-2">
          {(content ?? []).map((c, i) => renderNode(c, i, evidenceMap, citationNumbers))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={index} className="list-decimal list-inside space-y-1 mb-3 ms-2">
          {(content ?? []).map((c, i) => renderNode(c, i, evidenceMap, citationNumbers))}
        </ol>
      );
    case 'listItem': {
      const para = content?.[0] as TipTapNodeObj | undefined;
      const inlines = (para?.content as TipTapNodeObj[] | undefined) ?? [];
      return (
        <li key={index} className="text-slate-700 text-sm">
          {inlines.map((c, i) => renderInline(c, i, evidenceMap, citationNumbers))}
        </li>
      );
    }
    default:
      return null;
  }
}

export function TipTapRenderer({ doc, evidenceMap = {} }: Props) {
  const citationNumbers = useMemo(() => buildEvidenceCitationNumbers(doc), [doc]);
  const content = doc.content as TipTapNodeObj[] | undefined;
  return (
    <div>{(content ?? []).map((child, i) => renderNode(child, i, evidenceMap, citationNumbers))}</div>
  );
}
