'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

export type FoiaModalState =
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

export function FoiaModal({
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
  const resolvedText = manualText ?? resolveLetter(rawLetter, requesterName);

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
    @bottom-left { content: ''; }
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

        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/icon_foia.png" alt="" width={24} height={24} className="w-6 h-6 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">{t('foiaModalTitle')}</h2>
            </div>
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
            <div className="flex-1 overflow-y-auto">
              <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 space-y-1">
                <label className="text-xs font-semibold text-slate-600 block">
                  {t('foiaNameLabel')}
                </label>
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => {
                    setRequesterName(e.target.value);
                    if (manualText !== null) setManualText(null);
                  }}
                  placeholder={t('foiaNamePlaceholder')}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <p className="text-xs text-slate-400">{t('foiaNameHint')}</p>
              </div>

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
