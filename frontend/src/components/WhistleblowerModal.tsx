'use client';

import { useState, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { apiUrl } from '@/lib/api';
import type { EvidenceGap } from '@/types/thesis';

interface WhistleblowerSubmission {
  evidenceId: string;
  filename: string;
  summary: string;
  duplicate: boolean;
}

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
              >
                + {t('tipModalFilesBtn')}
              </button>

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
