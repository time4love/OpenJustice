'use client';

import { useState, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { apiUrl } from '@/lib/api';
import { stripMetadata, encryptFile, uint8ToBase64 } from '@/lib/documentVault';
import type { EvidenceGap } from '@/types/thesis';
import { CategoryBadges } from '@/components/CategoryBadges';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface EncryptedFile {
  ciphertext: string;   // base64
  aesKey: JsonWebKey;
  filename: string;
  mimeType: string;
}

interface PreviewItem {
  filename: string;
  summary: string;
  investigativeCategories: string[];
  evidenceDate: string | null;
  keyFigures: string[];
  evidenceRole: string;
  isRelevant: boolean;
}

interface Submission {
  evidenceId: string;
  filename: string;
  summary: string;
  duplicate: boolean;
  ipfsCid: string | null;
}

type Stage = 'idle' | 'encrypting' | 'previewing' | 'review' | 'submitting' | 'done';

// ─── Component ─────────────────────────────────────────────────────────────────

export function WhistleblowerModal({
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
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState(false);
  const [noFilesError, setNoFilesError] = useState(false);

  const [encryptedFiles, setEncryptedFiles] = useState<EncryptedFile[]>([]);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [previewToken, setPreviewToken] = useState<string>('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (next.length >= 10) break;
      if (!next.some((e) => e.name === f.name && e.size === f.size)) next.push(f);
    }
    setFiles(next);
    setNoFilesError(false);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function startFlow() {
    if (files.length === 0) { setNoFilesError(true); return; }
    setError(false);
    setNoFilesError(false);

    // ── Phase 1: encrypt in browser ──────────────────────────────────────────
    setStage('encrypting');
    let encrypted: EncryptedFile[];
    try {
      encrypted = await Promise.all(
        files.map(async (file) => {
          const { file: stripped } = await stripMetadata(file);
          const { ciphertext, aesKeyJwk } = await encryptFile(stripped);
          return {
            ciphertext: uint8ToBase64(ciphertext),
            aesKey: aesKeyJwk,
            filename: file.name,
            mimeType: file.type as EncryptedFile['mimeType'],
          };
        }),
      );
    } catch {
      setError(true);
      setStage('idle');
      return;
    }
    setEncryptedFiles(encrypted);

    // ── Phase 2: preview (analyse, no store) ─────────────────────────────────
    setStage('previewing');
    try {
      const res = await fetch(
        apiUrl(`/api/thesis/${thesisId}/gaps/${gapIndex}/whistleblower/preview`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: encrypted }),
        },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { previews: PreviewItem[]; previewToken: string };
      setPreviews(data.previews);
      setPreviewToken(data.previewToken);
      setStage('review');
    } catch {
      setError(true);
      setStage('idle');
    }
  }

  async function confirm() {
    setStage('submitting');
    try {
      const res = await fetch(
        apiUrl(`/api/thesis/${thesisId}/gaps/${gapIndex}/whistleblower`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: encryptedFiles, previewToken }),
        },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { submissions: Submission[] };
      setSubmissions(data.submissions);
      setStage('done');
    } catch {
      setError(true);
      setStage('review');
    }
  }

  const busy = stage === 'encrypting' || stage === 'previewing' || stage === 'submitting';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-bold text-slate-900">🔒 {t('tipModalTitle')}</h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-30 text-xl leading-none transition-colors p-1"
            aria-label="Close"
          >✕</button>
        </div>

        {/* ── Done ────────────────────────────────────────────────────────── */}
        {stage === 'done' && (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-8 space-y-4 text-center">
            <div className="text-4xl">✓</div>
            <h3 className="text-sm font-bold text-emerald-700">{t('tipModalSuccessTitle')}</h3>
            <p className="text-xs text-slate-600">{t('tipModalSuccessSub')}</p>
            <ul className="text-start space-y-2 mt-2">
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
            >{t('tipModalCloseBtn')}</button>
          </div>
        )}

        {/* ── Review / Preview ────────────────────────────────────────────── */}
        {stage === 'review' && (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-900">{t('tipModalPreviewTitle')}</h3>
              <p className="text-xs text-slate-500 leading-snug">{t('tipModalPreviewSub')}</p>
            </div>

            {previews.map((p, i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3" dir={locale === 'he' ? 'rtl' : 'ltr'}>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">{p.filename.endsWith('.pdf') ? '📄' : '🖼️'}</span>
                  <span className="text-xs font-semibold text-slate-700 truncate">{p.filename}</span>
                  {!p.isRelevant && (
                    <span className="ms-auto shrink-0 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                      {t('tipModalNotRelevant')}
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-semibold text-slate-600">{t('tipModalSummaryLabel')}: </span>
                    <span className="text-slate-700 leading-snug">{p.summary}</span>
                  </div>
                  {p.evidenceDate && (
                    <div>
                      <span className="font-semibold text-slate-600">{t('tipModalDateLabel')}: </span>
                      <span className="text-slate-700">{p.evidenceDate}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-semibold text-slate-600">{t('tipModalCategoryLabel')}: </span>
                    <CategoryBadges categories={p.investigativeCategories} max={2} />
                  </div>
                  {p.keyFigures.length > 0 && (
                    <div>
                      <span className="font-semibold text-slate-600">{t('tipModalFiguresLabel')}: </span>
                      <span className="text-slate-700">{p.keyFigures.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {error && <p className="text-xs text-red-600">{t('tipModalError')}</p>}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 pb-2">
              <button
                onClick={() => void confirm()}
                disabled={stage !== 'review'}
                className="flex-1 px-4 py-3 sm:py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors active:scale-95"
              >{t('tipModalPreviewApprove')}</button>
              <button
                onClick={() => setStage('idle')}
                className="flex-1 px-4 py-3 sm:py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition-colors active:scale-95"
              >{t('tipModalPreviewBack')}</button>
            </div>
          </div>
        )}

        {/* ── Loading (encrypting / previewing / submitting) ───────────────── */}
        {(stage === 'encrypting' || stage === 'previewing' || stage === 'submitting') && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16 px-6">
            <div className="w-8 h-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
            <p className="text-sm text-slate-500 font-medium">
              {stage === 'encrypting' ? t('tipModalEncrypting')
                : stage === 'previewing' ? t('tipModalAnalyzing')
                : t('tipModalSubmittingBtn')}
            </p>
          </div>
        )}

        {/* ── Idle (file selection) ────────────────────────────────────────── */}
        {stage === 'idle' && (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-4">
            <div
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
              dir={locale === 'he' ? 'rtl' : 'ltr'}
            >
              <p className="text-xs font-semibold text-amber-700 mb-1">{t('tipModalContext')}</p>
              <p className="text-sm text-amber-800 leading-snug">{gap.description}</p>
            </div>

            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>🔒</span>
              {t('tipModalPrivacyNote')}
            </p>

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
              >+ {t('tipModalFilesBtn')}</button>

              {files.length > 0 && (
                <ul className="space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <span className="text-slate-400 shrink-0 text-sm">{f.type === 'application/pdf' ? '📄' : '🖼️'}</span>
                      <span className="flex-1 text-xs text-slate-700 truncate min-w-0">{f.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button
                        onClick={() => removeFile(i)}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                        aria-label={`Remove ${f.name}`}
                      >✕</button>
                    </li>
                  ))}
                </ul>
              )}

              {files.length === 0 && (
                <p className="text-xs text-slate-400 text-center">{t('tipModalFilesEmpty')}</p>
              )}
            </div>

            {noFilesError && <p className="text-xs text-amber-600">{t('tipModalNoFilesError')}</p>}
            {error && <p className="text-xs text-red-600">{t('tipModalError')}</p>}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-1 pb-2">
              <button
                onClick={() => void startFlow()}
                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-violet-700 hover:bg-violet-600 text-white text-sm font-semibold rounded-xl transition-colors active:scale-95"
              >{t('tipModalSubmitBtn')}</button>
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-semibold text-slate-700 transition-colors active:scale-95"
              >{t('tipModalCloseBtn')}</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
