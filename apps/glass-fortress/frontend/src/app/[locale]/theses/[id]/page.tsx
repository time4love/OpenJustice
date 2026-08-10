'use client';

import { useState, useEffect, useRef, Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl } from '@/lib/api';
import { TipTapRenderer, type EvidenceInfo } from '@/components/TipTapRenderer';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import type { EvidenceGap, CounterArgument, AIAnalysis } from '@/types/thesis';

// ---------------------------------------------------------------------------
// Types matching the versioned thesis API
// ---------------------------------------------------------------------------

interface ThesisMention {
  id: string;
  type: 'KEY_FIGURE' | 'EVIDENCE' | 'TRACKED_URL';
  refId: string;
}


interface HeadVersion {
  id: string;
  status: 'PENDING_AI' | 'COMPLETE';
  contentHash: string;
  userContent: Record<string, unknown>;
  aiAnalysis: AIAnalysis | null;
  mentions: ThesisMention[];
  createdAt: string;
}

interface Thesis {
  id: string;
  headVersionId: string | null;
  createdAt: string;
  headVersion: HeadVersion | null;
}

interface GapResolution {
  gapIndex: number;
  evidenceId: string;
  evidence: { summary: string; category: string; evidenceTier: string };
  createdAt: string;
}


// ---------------------------------------------------------------------------
// GapSearchPanel — inline vault search + Add to Thesis action
// ---------------------------------------------------------------------------

interface VaultHit {
  fileHash: string;
  summary: string;
  category: string;
  tier: string;
  evidenceDate: string;
  targetEntity: string;
}

const GAP_TIER_DOT: Record<string, string> = {
  '1': 'bg-red-500', '2': 'bg-orange-500', '3': 'bg-yellow-500', '4': 'bg-slate-400',
};
function gapTierDot(tier: string) {
  const num = tier?.match(/\d/)?.[0] ?? '';
  return GAP_TIER_DOT[num] ?? 'bg-slate-300';
}

function appendEvidenceMention(
  doc: Record<string, unknown>,
  fileHash: string,
  label: string,
): Record<string, unknown> {
  const content = [...((doc.content as unknown[]) ?? [])];
  content.push({
    type: 'paragraph',
    content: [{ type: 'evidenceMention', attrs: { id: fileHash, label: label.slice(0, 30) } }],
  });
  return { ...doc, content };
}

function GapSearchPanel({
  gap, gapIndex, thesisId, thesisContent, resolution, onVersionAdded, onResolved, onGenerateFoia, onSubmitTip,
}: {
  gap: EvidenceGap;
  gapIndex: number;
  thesisId: string;
  thesisContent: Record<string, unknown>;
  resolution: GapResolution | null;
  onVersionAdded: () => void;
  onResolved: () => void;
  onGenerateFoia: () => void;
  onSubmitTip: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<VaultHit[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<string | null>(null); // fileHash being resolved
  const [unresolving, setUnresolving] = useState(false);

  async function search() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (hits.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/evidence/search?q=${encodeURIComponent(gap.suggestedSearch)}&limit=5`));
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { results: { metadata: VaultHit }[] };
      setHits((data.results ?? []).map(r => r.metadata));
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  async function addToThesis(hit: VaultHit) {
    setAdding(prev => new Set(prev).add(hit.fileHash));
    try {
      const newContent = appendEvidenceMention(thesisContent, hit.fileHash, hit.summary);
      const res = await fetch(apiUrl(`/api/thesis/${thesisId}/version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: newContent }),
      });
      if (!res.ok) throw new Error();
      setAdded(prev => new Set(prev).add(hit.fileHash));
      onVersionAdded();
    } finally {
      setAdding(prev => { const s = new Set(prev); s.delete(hit.fileHash); return s; });
    }
  }

  async function markResolved(hit: VaultHit) {
    setResolving(hit.fileHash);
    try {
      const res = await fetch(apiUrl(`/api/thesis/${thesisId}/gaps/${gapIndex}/resolve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId: hit.fileHash }),
      });
      if (!res.ok) throw new Error();
      onResolved();
    } finally {
      setResolving(null);
    }
  }

  async function unresolve() {
    setUnresolving(true);
    try {
      await fetch(apiUrl(`/api/thesis/${thesisId}/gaps/${gapIndex}/resolve`), { method: 'DELETE' });
      onResolved();
    } finally {
      setUnresolving(false);
    }
  }

  const isResolved = !!resolution;
  const headerBg = isResolved ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200';
  const headerText = isResolved ? 'text-emerald-800' : 'text-amber-800';

  return (
    <div className={`border rounded-xl overflow-hidden ${isResolved ? 'border-emerald-200' : 'border-amber-200'}`}>
      <div className={`${headerBg} p-4 flex items-start justify-between gap-4`}>
        <div className="flex-1 space-y-2 min-w-0">
          <p className={`text-sm ${headerText}`}>{gap.description}</p>
          {isResolved && (
            <p className="text-xs text-emerald-600 font-medium truncate">
              ✓ {resolution.evidence.summary.slice(0, 80)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onGenerateFoia}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-100 hover:bg-sky-200 active:bg-sky-300 text-sky-700 transition-colors"
            >
              📄 FOIA
            </button>
            <button
              onClick={onSubmitTip}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 transition-colors"
            >
              🔒 Tip
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isResolved && (
            <button
              onClick={() => void unresolve()}
              disabled={unresolving}
              className="text-xs font-semibold px-3 py-1.5 bg-emerald-100 hover:bg-red-100 text-emerald-700 hover:text-red-600 rounded-lg transition-colors"
            >
              {unresolving ? '…' : 'Unresolve'}
            </button>
          )}
          <button
            onClick={search}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              isResolved
                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
            }`}
          >
            {open ? 'Hide' : 'Search Vault'}
          </button>
        </div>
      </div>

      {open && (
        <div className="bg-white border-t border-amber-200">
          {gap.suggestedSearch && (
            <p className="text-xs text-slate-400 px-4 pt-3 pb-1 font-mono">{gap.suggestedSearch}</p>
          )}
          {loading && <p className="text-xs text-slate-500 px-4 py-3">Searching vault…</p>}
          {!loading && hits.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-3">
              No matching evidence in vault — submit new evidence via MCP or the evidence form.
            </p>
          )}
          {!loading && hits.map(hit => (
            <div key={hit.fileHash} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
              <span className={`mt-1 shrink-0 w-2 h-2 rounded-full ${gapTierDot(hit.tier)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700 leading-snug">{hit.summary.slice(0, 120)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{hit.category} · {hit.evidenceDate}</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  disabled={added.has(hit.fileHash) || adding.has(hit.fileHash)}
                  onClick={() => void addToThesis(hit)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    added.has(hit.fileHash)
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : adding.has(hit.fileHash)
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-violet-100 hover:bg-violet-200 text-violet-700'
                  }`}
                >
                  {added.has(hit.fileHash) ? 'Added ✓' : adding.has(hit.fileHash) ? '…' : 'Add to Thesis'}
                </button>
                <button
                  disabled={resolving === hit.fileHash || resolution?.evidenceId === hit.fileHash}
                  onClick={() => void markResolved(hit)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                    resolution?.evidenceId === hit.fileHash
                      ? 'bg-emerald-100 text-emerald-700 cursor-default'
                      : resolving === hit.fileHash
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                  }`}
                >
                  {resolution?.evidenceId === hit.fileHash ? 'Resolved ✓' : resolving === hit.fileHash ? '…' : 'Mark Resolved'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// FoiaModal + WhistleblowerModal are also exported from src/components/ for
// use by the call page. The local definitions below remain the source of truth
// for this page until a full extraction is done.

type FoiaModalState =
  | { status: 'loading'; gapIndex: number }
  | {
      status: 'ready';
      gapIndex: number;
      letterText: string;
      targetMinistry: string;
      legalBasis: string;
      targetEmail?: string;
      targetAddress?: string;
    };

function resolveLetter(raw: string, name: string): string {
  const today = new Date().toLocaleDateString('he-IL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return raw
    .replace(/\{\{REQUESTER_NAME\}\}/g, name.trim() || '[שם מגיש/ת הבקשה]')
    .replace(/\{\{DATE\}\}/g, today);
}

function FoiaModal({
  state,
  onClose,
}: {
  state: FoiaModalState;
  onClose: () => void;
}) {
  const t = useTranslations('theses');
  const [requesterName, setRequesterName] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [manualText, setManualText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rawLetter = state.status === 'ready' ? state.letterText : '';

  // The text shown in preview and used for copy/download
  const resolvedText = manualText ?? resolveLetter(rawLetter, requesterName);

  // When entering edit mode, pre-fill textarea with the current resolved text
  const [editBuffer, setEditBuffer] = useState('');
  function enterEdit() {
    setEditBuffer(resolvedText);
    setEditMode(true);
  }
  function applyEdit() {
    setManualText(editBuffer);
    setEditMode(false);
  }
  function cancelEdit() {
    setEditMode(false);
  }

  function copy() {
    void navigator.clipboard.writeText(resolvedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadPdf() {
    if (state.status !== 'ready') return;

    // Split into paragraphs so each block can carry break-inside: avoid,
    // preventing numbered request items from being torn across page boundaries.
    const paragraphs = resolvedText
      .split(/\n\n+/)
      .map((para) => {
        const esc = para
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
        return `<p>${esc}</p>`;
      })
      .join('\n');

    const ministryEscaped = state.targetMinistry
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<title>בקשת חופש מידע — ${ministryEscaped}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    direction: rtl;
    text-align: right;
    font-size: 12pt;
    line-height: 1.9;
    color: #111;
  }
  p {
    margin-bottom: 0.75em;
    break-inside: avoid;
    orphans: 3;
    widows: 3;
  }
  @page {
    size: A4;
    margin: 2.5cm;
    /* Suppress the URL/about:blank in the bottom-left margin box. */
    @bottom-left { content: ''; }
    /* Explicit page numbers — more reliable than relying on browser injection. */
    @bottom-right {
      content: counter(page) ' / ' counter(pages);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      color: #666;
    }
  }
</style>
</head>
<body>${paragraphs}</body>
</html>`;

    const win = window.open('', '_blank', 'width=860,height=1050');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !editMode) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">📄 {t('foiaModalTitle')}</h2>
            {state.status === 'ready' && (
              <p className="text-xs text-slate-500 mt-0.5">{state.targetMinistry}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none transition-colors p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {state.status === 'loading' ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center space-y-3">
              <div className="animate-spin text-3xl">⏳</div>
              <p className="text-slate-500 text-sm">{t('foiaGenerating')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto">

              {/* Name personalisation */}
              <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">
                  {t('foiaNameLabel')}
                </label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => {
                    setRequesterName(e.target.value);
                    // If user has NOT manually edited the letter text, keep auto-resolve
                    if (manualText !== null) setManualText(null);
                  }}
                  placeholder={t('foiaNamePlaceholder')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <p className="text-xs text-slate-400">{t('foiaNameHint')}</p>
              </div>

              {/* Letter */}
              <div className="px-5 sm:px-6 pt-4 pb-3">
                {editMode ? (
                  <div className="space-y-2">
                    <textarea
                      value={editBuffer}
                      onChange={(e) => setEditBuffer(e.target.value)}
                      className="w-full border border-violet-300 rounded-xl p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-300 min-h-[360px] resize-y"
                      dir="rtl"
                      spellCheck={false}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={applyEdit}
                        className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-xs font-semibold rounded-lg transition-colors active:scale-95"
                      >
                        Apply Changes
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Formatted letter preview — official document styling */}
                    <div
                      className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 sm:px-8 py-7 text-sm text-slate-800 leading-[1.85] whitespace-pre-wrap"
                      style={{ fontFamily: '"Arial", sans-serif' }}
                      dir="rtl"
                    >
                      {resolvedText}
                    </div>
                    <button
                      onClick={enterEdit}
                      className="text-xs text-violet-600 hover:text-violet-800 font-semibold underline underline-offset-2 transition-colors"
                    >
                      ✏️ Edit letter text
                    </button>
                  </div>
                )}
              </div>

              {/* Ministry contact strip */}
              {(state.targetEmail || state.targetAddress) && (
                <div className="mx-5 sm:mx-6 mb-4 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 space-y-1.5 text-xs">
                  {state.targetEmail && (
                    <div className="flex items-start gap-2">
                      <span className="shrink-0">📧</span>
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-700">{t('foiaEmailLabel')}: </span>
                        <a
                          href={`mailto:${state.targetEmail}`}
                          className="text-sky-700 hover:text-sky-900 underline break-all"
                        >
                          {state.targetEmail}
                        </a>
                        <span className="text-amber-600 ms-2">⚠ {t('foiaEmailVerify')}</span>
                      </div>
                    </div>
                  )}
                  {state.targetAddress && (
                    <div className="flex items-start gap-2">
                      <span className="shrink-0">📮</span>
                      <div>
                        <span className="font-semibold text-slate-700">{t('foiaAddressLabel')}: </span>
                        <span className="text-slate-600" dir="rtl">{state.targetAddress}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-slate-100 px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={downloadPdf}
                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-semibold rounded-xl transition-colors active:scale-95"
              >
                ⬇ {t('foiaDownloadBtn')}
              </button>
              <button
                onClick={copy}
                className={`flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-xl text-sm font-semibold transition-colors active:scale-95 ${
                  copied
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {copied ? t('foiaCopiedBtn') : t('foiaCopyBtn')}
              </button>
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-sm font-semibold text-slate-500 transition-colors active:scale-95"
              >
                {t('foiaCloseBtn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhistleblowerModal — anonymous internal document submission scoped to a gap
// ---------------------------------------------------------------------------

interface WhistleblowerSubmission {
  evidenceId: string;
  filename: string;
  summary: string;
  duplicate: boolean;
}

function WhistleblowerModal({
  gapIndex,
  gap,
  thesisId,
  onClose,
}: {
  gapIndex: number;
  gap: EvidenceGap;
  thesisId: string;
  onClose: () => void;
}) {
  const t = useTranslations('theses');
  const locale = useLocale();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [noFilesError, setNoFilesError] = useState(false);
  const [submissions, setSubmissions] = useState<WhistleblowerSubmission[] | null>(null);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (next.length >= 10) break;
      if (!next.some((existing) => existing.name === f.name && existing.size === f.size)) {
        next.push(f);
      }
    }
    setFiles(next);
    setNoFilesError(false);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (submitting) return;
    if (files.length === 0) { setNoFilesError(true); return; }
    setSubmitting(true);
    setError(false);
    setNoFilesError(false);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const res = await fetch(
        apiUrl(`/api/thesis/${thesisId}/gaps/${gapIndex}/whistleblower`),
        { method: 'POST', body: formData },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { submissions: WhistleblowerSubmission[] };
      setSubmissions(data.submissions);
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-bold text-slate-900">🔒 {t('tipModalTitle')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none transition-colors p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {submissions ? (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-8 space-y-4 text-center">
            <div className="text-4xl">✓</div>
            <h3 className="text-sm font-bold text-emerald-700">{t('tipModalSuccessTitle')}</h3>
            <p className="text-xs text-slate-600">{t('tipModalSuccessSub')}</p>
            <ul className="text-left space-y-2 mt-2">
              {submissions.map((s) => (
                <li key={s.evidenceId} className="bg-slate-50 rounded-xl px-3 py-2 space-y-0.5">
                  <p className="text-xs font-semibold text-slate-700 truncate">{s.filename}</p>
                  <p className="text-xs text-slate-500 leading-snug line-clamp-2">{s.summary}</p>
                  <p className="text-xs font-mono text-slate-400">{s.evidenceId.slice(0, 16)}…</p>
                </li>
              ))}
            </ul>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold text-slate-700 transition-colors active:scale-95"
            >
              {t('tipModalCloseBtn')}
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            {/* Gap context */}
            <div
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
              dir={locale === 'he' ? 'rtl' : 'ltr'}
            >
              <p className="text-xs font-semibold text-amber-700 mb-1">{t('tipModalContext')}</p>
              <p className="text-sm text-amber-800 leading-snug">{gap.description}</p>
            </div>

            {/* Privacy notice */}
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>🔒</span>
              {t('tipModalPrivacyNote')}
            </p>

            {/* File picker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600">{t('tipModalFilesLabel')}</label>
                <span className="text-xs text-slate-400">{t('tipModalFilesHint')}</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.pdf"
                className="sr-only"
                onChange={(e) => addFiles(e.target.files)}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-200 hover:border-violet-300 active:border-violet-400 rounded-xl py-5 text-sm font-semibold text-slate-500 hover:text-violet-600 transition-colors"
              >
                + {t('tipModalFilesBtn')}
              </button>

              {/* File list */}
              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                    >
                      <span className="text-slate-400 shrink-0 text-sm">
                        {f.type === 'application/pdf' ? '📄' : '🖼️'}
                      </span>
                      <span className="flex-1 text-xs text-slate-700 truncate min-w-0">{f.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">
                        {(f.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                      <button
                        onClick={() => removeFile(i)}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                        aria-label={`Remove ${f.name}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {files.length === 0 && (
                <p className="text-xs text-slate-400 text-center">{t('tipModalFilesEmpty')}</p>
              )}
            </div>

            {noFilesError && (
              <p className="text-xs text-amber-600">{t('tipModalNoFilesError')}</p>
            )}
            {error && (
              <p className="text-xs text-red-600">{t('tipModalError')}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 pb-2">
              <button
                onClick={() => void submit()}
                disabled={submitting}
                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors active:scale-95"
              >
                {submitting ? t('tipModalSubmittingBtn') : t('tipModalSubmitBtn')}
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl text-sm font-semibold text-slate-700 transition-colors active:scale-95"
              >
                {t('tipModalCloseBtn')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STRENGTH_STYLES: Record<string, string> = {
  WEAK: 'bg-red-50 border-red-200 text-red-700',
  MODERATE: 'bg-amber-50 border-amber-200 text-amber-700',
  STRONG: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  COMPELLING: 'bg-violet-50 border-violet-200 text-violet-700',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ThesisPageInner({ id }: { id: string }) {
  const t = useTranslations('theses');
  const tc = useTranslations('common');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const historicalVersionId = searchParams.get('v');
  const isHistorical = !!historicalVersionId;

  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<string, EvidenceInfo>>({});
  const [gapResolutions, setGapResolutions] = useState<GapResolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  type RevisionState =
    | null
    | 'loading'
    | { suggestedContent: Record<string, unknown>; revisionsExplained: string; newEvidenceCount: number };

  const [revision, setRevision] = useState<RevisionState>(null);
  const [savingRevision, setSavingRevision] = useState(false);
  const [foiaModal, setFoiaModal] = useState<FoiaModalState | null>(null);
  const [tipModalGapIndex, setTipModalGapIndex] = useState<number | null>(null);
  const [foiaError, setFoiaError] = useState<number | null>(null); // gapIndex of failed FOIA gen

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function loadThesis() {
    const url = historicalVersionId
      ? apiUrl(`/api/thesis/${id}/versions/${historicalVersionId}`)
      : apiUrl(`/api/thesis/${id}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = (await res.json()) as {
      thesis: Thesis;
      evidenceMap: Record<string, EvidenceInfo>;
      gapResolutions?: GapResolution[];
    };
    setThesis(data.thesis);
    setEvidenceMap(data.evidenceMap ?? {});
    setGapResolutions(data.gapResolutions ?? []);
    return data.thesis;
  }

  useEffect(() => {
    loadThesis()
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, historicalVersionId]);

  async function runRevision() {
    setRevision('loading');
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/suggest-revision`), { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        suggestedContent: Record<string, unknown>;
        revisionsExplained: string;
        newEvidenceCount: number;
      };
      setRevision(data);
    } catch {
      setRevision(null);
    }
  }

  async function acceptRevision() {
    if (!revision || revision === 'loading') return;
    setSavingRevision(true);
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/version`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userContent: revision.suggestedContent }),
      });
      if (!res.ok) throw new Error();
      setRevision(null);
      await loadThesis();
    } finally {
      setSavingRevision(false);
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      await fetch(apiUrl(`/api/thesis/${id}/analyze`), { method: 'POST' });
      pollRef.current = setInterval(async () => {
        try {
          const thesis = await loadThesis();
          if (thesis.headVersion?.status === 'COMPLETE') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setAnalyzing(false);
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch {
      setAnalyzing(false);
    }
  }

  async function generateFoia(gapIndex: number) {
    setFoiaError(null);
    setFoiaModal({ status: 'loading', gapIndex });
    try {
      const res = await fetch(apiUrl(`/api/thesis/${id}/foia-request`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gapIndex }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        letterText: string;
        targetMinistry: string;
        legalBasis: string;
        targetEmail?: string;
        targetAddress?: string;
      };
      setFoiaModal({ status: 'ready', gapIndex, ...data });
    } catch {
      setFoiaError(gapIndex);
      setFoiaModal(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">{t('savingBtn')}</p>
      </div>
    );
  }

  if (error || !thesis) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-600">{t('errorEvaluate')}</p>
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
        </div>
      </div>
    );
  }

  const hv = thesis.headVersion;
  const analysis = hv?.aiAnalysis ?? null;
  const keyFigureMentions = hv?.mentions.filter(m => m.type === 'KEY_FIGURE') ?? [];
  const evidenceMentions = hv?.mentions.filter(m => m.type === 'EVIDENCE') ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/theses" className="text-slate-600 hover:text-slate-900 text-sm transition-colors">
            ← {t('pageTitle')}
          </Link>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 text-xs">{tc('appName')}</span>
          <div className="ms-auto flex items-center gap-2">
            {isHistorical ? (
              <Link
                href={`/theses/${id}/history`}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors"
              >
                {t('historyBtn')}
              </Link>
            ) : (
              <>
                <Link
                  href={`/theses/${id}/edit`}
                  className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 rounded-lg text-xs font-medium text-white transition-colors"
                >
                  {t('editBtn')}
                </Link>
                <Link
                  href={`/theses/${id}/history`}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700 transition-colors"
                >
                  {t('historyBtn')}
                </Link>
              </>
            )}
            <Link
              href={`/call/${id}`}
              className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 rounded-lg text-xs font-semibold text-amber-800 transition-colors"
            >
              {t('callForWitnessesBtn')}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* Historical version banner */}
        {isHistorical && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <span>📋</span>
            <span>{locale === 'he' ? 'צפייה בגרסה היסטורית — לקריאה בלבד' : 'Viewing historical version — read only'}</span>
            <Link href={`/theses/${id}`} className="ms-auto font-medium text-amber-900 hover:underline shrink-0">
              {locale === 'he' ? 'לגרסה הנוכחית ←' : 'Current version →'}
            </Link>
          </div>
        )}

        {/* Status + date */}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span
            className={`font-semibold px-3 py-1 rounded-full border ${
              hv?.status === 'COMPLETE'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                : 'bg-amber-100 text-amber-700 border-amber-300'
            }`}
          >
            {hv?.status === 'COMPLETE' ? 'AI reviewed' : 'Pending AI'}
          </span>
          <span>
            {new Date(thesis.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
          </span>
        </div>

        {/* Thesis body */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {hv ? <TipTapRenderer doc={hv.userContent} evidenceMap={evidenceMap} /> : null}
        </div>

        {/* Mentioned key figures */}
        {keyFigureMentions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('keyFiguresLabel')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {keyFigureMentions.map(m => (
                <span
                  key={m.id}
                  className="bg-violet-100 text-violet-700 text-xs px-3 py-1 rounded-full"
                >
                  @{m.refId}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mentioned evidence */}
        {evidenceMentions.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {t('evidenceSuggestion')} ({evidenceMentions.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {evidenceMentions.map(m => {
                const info = evidenceMap[m.refId];
                const tierDotClass = gapTierDot(info?.evidenceTier ?? '');
                const label = info?.summary?.slice(0, 35) || m.refId.slice(0, 8);
                return (
                  <Link
                    key={m.id}
                    href={`/timeline?hash=${m.refId}`}
                    className="inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs px-3 py-1 rounded-full transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${tierDotClass}`} />
                    #{label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* AI analysis — DevilsAdvocate */}
        {analysis && (
          <section className="space-y-5 pt-4 border-t border-slate-200">
            <LegalDisclaimer />
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">{t('aiAnalysisTitle')}</h2>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                  STRENGTH_STYLES[analysis.overallStrengthAssessment] ?? ''
                }`}
              >
                {analysis.overallStrengthAssessment}
              </span>
            </div>

            {/* Hebrew summary */}
            {analysis.summaryHe && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4" dir="rtl">
                <p className="text-sm text-slate-700 leading-relaxed">{analysis.summaryHe}</p>
              </div>
            )}

            {/* Counter-arguments */}
            {analysis.counterArguments.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('counterArgumentsLabel')}
                </h3>
                {analysis.counterArguments.map((ca, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm"
                  >
                    <p className="text-sm text-slate-900 font-medium">{ca.claim}</p>
                    <p className="text-sm text-red-700">{ca.rebuttal}</p>
                    <span className="inline-block text-xs text-slate-400 font-medium">
                      {ca.strength}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Evidence gaps */}
            {analysis.evidenceGaps.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('evidenceGapsLabel')}
                </h3>
                {analysis.evidenceGaps.map((gap, i) => {
                  const resolution = gapResolutions.find(r => r.gapIndex === i) ?? null;
                  return isHistorical
                    ? (
                      <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                        <p className="text-sm text-slate-800 font-medium">{gap.description}</p>
                        {gap.suggestedSearch && (
                          <p className="text-xs text-slate-500 font-mono">{gap.suggestedSearch}</p>
                        )}
                      </div>
                    )
                    : (
                      <GapSearchPanel
                        key={i}
                        gap={gap}
                        gapIndex={i}
                        thesisId={id}
                        thesisContent={hv?.userContent ?? {}}
                        resolution={resolution}
                        onVersionAdded={() => { void loadThesis(); }}
                        onResolved={() => { void loadThesis(); }}
                        onGenerateFoia={() => { void generateFoia(i); }}
                        onSubmitTip={() => { setTipModalGapIndex(i); }}
                      />
                    );
                })}
              </div>
            )}

            {/* Alternative interpretations */}
            {analysis.alternativeInterpretations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('alternativeInterpretationsLabel')}
                </h3>
                <ul className="space-y-1.5">
                  {analysis.alternativeInterpretations.map((interp, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-slate-400 shrink-0">↔</span>
                      <span>{interp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggest Revision button — hidden for historical versions */}
            {!isHistorical && revision === null && (
              <div className="pt-2">
                <button
                  onClick={() => void runRevision()}
                  className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Suggest Revision
                </button>
              </div>
            )}

            {/* Revision loading */}
            {revision === 'loading' && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-center gap-3 text-violet-700 text-sm">
                <span className="animate-spin">⏳</span>
                <span>Drafting revision… this takes ~30 seconds</span>
              </div>
            )}

            {/* Revision preview */}
            {revision !== null && revision !== 'loading' && (
              <div className="space-y-4 border border-violet-200 rounded-2xl overflow-hidden">
                <div className="bg-violet-50 px-5 py-4 space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-bold text-violet-900">Suggested Revision</h3>
                    {revision.newEvidenceCount > 0 && (
                      <span className="text-xs bg-violet-200 text-violet-800 px-2 py-0.5 rounded-full font-semibold">
                        +{revision.newEvidenceCount} evidence
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-violet-800 leading-relaxed">{revision.revisionsExplained}</p>
                </div>

                <div className="bg-white border-t border-violet-100 px-5 py-4">
                  <TipTapRenderer doc={revision.suggestedContent} evidenceMap={evidenceMap} />
                </div>

                <div className="bg-slate-50 border-t border-violet-200 px-5 py-3 flex gap-3">
                  <button
                    disabled={savingRevision}
                    onClick={() => void acceptRevision()}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    {savingRevision ? 'Saving…' : 'Accept & Save'}
                  </button>
                  <button
                    disabled={savingRevision}
                    onClick={() => setRevision(null)}
                    className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Pending AI notice + trigger button — hidden for historical versions */}
        {!isHistorical && hv?.status === 'PENDING_AI' && !analyzing && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-amber-700 text-sm">{t('pendingAiNotice')}</p>
            <button
              onClick={runAnalysis}
              className="shrink-0 px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Run AI Analysis
            </button>
          </div>
        )}
        {analyzing && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-amber-700 text-sm">
            <span className="animate-spin">⏳</span>
            <span>Running Devil&apos;s Advocate analysis… this takes ~30 seconds</span>
          </div>
        )}
      </main>

      {/* FOIA Modal */}
      {foiaModal !== null && (
        <FoiaModal state={foiaModal} onClose={() => setFoiaModal(null)} />
      )}

      {/* Whistleblower Modal */}
      {tipModalGapIndex !== null && analysis?.evidenceGaps[tipModalGapIndex] && (
        <WhistleblowerModal
          gapIndex={tipModalGapIndex}
          gap={analysis.evidenceGaps[tipModalGapIndex]!}
          thesisId={id}
          onClose={() => setTipModalGapIndex(null)}
        />
      )}

      {/* FOIA generation error toast */}
      {foiaError !== null && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto sm:w-80 z-40 bg-red-600 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3">
          <span>{t('foiaError')}</span>
          <button
            onClick={() => setFoiaError(null)}
            className="text-white/80 hover:text-white leading-none shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ThesisPageInner id={id} />
    </Suspense>
  );
}
