'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/Sheet';
import { CopyableCode } from '@/components/CopyableCode';
import type { RequestItem } from '@/types/thesis';

// ---------------------------------------------------------------------------
// THE LETTER — docs/gf-ui-design-session-2026-09-16.md §1.6 (decisions 1–6, RULED as the boards draw
// them); canvas page 3 boards B and D; docs/gf-ui-refactor-plan.md §10 :1124–:1125.
//
// R56's F3 IS FIXED HERE, BY CONSTRUCTION. A published request's text MAY carry `{{REQUESTER_NAME}}`
// and `{{DATE}}` — thesis A2 :1325–:1326 makes the text OPAQUE and T4 :672 lets the researcher amend
// them away, so both shapes are lawful. What is NOT lawful is either shape reaching a reader: the
// landed pages served EIGHT raw tokens each, four in text nodes and four in a COPY control's value.
// `resolveLetter` runs ONCE, here, and its output is what the body, the copy control and the printed
// document all read. There is no path by which the raw text is rendered.
//
// THE SIX DECISIONS, each where it lands:
//   1. ONE name field; blank falls back to `theses.foiaNameFallback` — the legacy printer's behaviour,
//      now a message rather than a literal in nobody's catalog.
//   2. THE DATE IS THE DOWNLOAD DATE — `new Date()` at render, in the page's locale. Never the
//      publication date, never a stored value: the reader sends it today.
//   3. PARAGRAPHS RENDER PLAIN, split on a blank line, with NO colon heuristic — the legacy printer
//      had none either, and a heuristic would silently promote a sentence to a heading.
//   4. `restsOn` IS ON THE CARD, NOT IN THE LETTER (the card renders them as dated ticks). A letter
//      carrying record names would be asking a clerk to read a 64-hex string.
//   5. is the card's, not this file's — the muted call.
//   6. A DIALOG ON THE DESKTOP, A FULL-SCREEN SHEET ON THE PHONE, and ONE primitive for both:
//      `components/Sheet.tsx` is KEEP and its four behaviours are REUSED, never re-implemented —
//      Escape closes, focus is trapped and RETURNED to the opener, the body's scroll is locked and
//      restored to its previous value, and `role="dialog"`/`aria-modal` are set by it and by nothing
//      else. `sheet-primitive`'s scan holds that last one over every file under `components/`.
//
// NOTHING LEAVES THE BROWSER. The download writes an HTML document, opens it and calls `print()` — the
// legacy printer's technique, kept: no PDF library, no dependency, no request. Its `@page` rules, its
// orphans/widows and its escaping are carried over because they were correct.
// ---------------------------------------------------------------------------

const TEMPLATE = /\{\{(REQUESTER_NAME|DATE)\}\}/g;

/** A run of the letter, and whether the PLATFORM filled it in rather than the researcher writing it. */
export interface LetterRun {
  text: string;
  filled: boolean;
}

/**
 * The letter, split into runs, with every substitution marked.
 *
 * THE MARKING IS THE POINT, not decoration (the researcher's Q5, ruled „א+ג” 2026-09-17): a reader has
 * to be able to see WHICH words the platform put in their letter, because those are the two they may
 * want to change. Both cues ride on the same span — the `--letter-fill` surface AND a `--line`
 * underline — because the fill is 1.118:1 in luminance against paper (239 against 252 in greyscale) and
 * therefore works by HUE ALONE, while the underline is 23 greyscale steps but only 1 px. Neither alone
 * serves both a colour reader and a greyscale one. The asymmetry that decided it: the NAME already
 * carries its square brackets as a second cue and the DATE carried none.
 *
 * RE-MEASURED 2026-09-18 and BOTH figures had gone stale, not one. The fill read 1.074:1 (238 against
 * 247) against the OLD paper `#FAF7F1`, and the underline's 26 greyscale steps were against the OLD
 * `--line` `#E4DCCF`; the palette moved the paper to `#FCFCFB` and the line to `#E6E5E2`, so the fill is
 * now 1.118:1 and the underline 23 steps. The RULING is untouched — both cues still ride the same span,
 * and the fill still works by hue alone — and `--letter-fill` itself does not move. Text on it stays
 * legible: ink 14.91:1, `--ink-muted` 8.05:1 (§1.8 :42's amendment).
 */
export function letterRuns(raw: string, name: string, today: string, fallback: string): LetterRun[] {
  const runs: LetterRun[] = [];
  let at = 0;
  for (const match of raw.matchAll(TEMPLATE)) {
    if (match.index > at) runs.push({ text: raw.slice(at, match.index), filled: false });
    runs.push({ text: match[1] === 'DATE' ? today : name.trim() === '' ? fallback : name.trim(), filled: true });
    at = match.index + match[0].length;
  }
  if (at < raw.length) runs.push({ text: raw.slice(at), filled: false });
  return runs;
}

/** The letter as one string — for the clipboard and for the printed document. */
export function resolveLetter(raw: string, name: string, today: string, fallback: string): string {
  return letterRuns(raw, name, today, fallback)
    .map((run) => run.text)
    .join('');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The print document: the legacy printer's CSS, which nothing about the redesign improves on — with one
 * correction. It used to carry `#111` and `#666` as literals, and a printed letter in colours nobody
 * chose is the same defect as a page in them. A window opened with `about:blank` inherits NO stylesheet,
 * so the values cannot be `var(--ink)`; they are READ from the live token block instead, which keeps one
 * definition and lets `tokens-only` stay true over this file.
 */
function tokenValue(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

function printLetter(resolved: string, authority: string, title: string): void {
  const paragraphs = resolved
    .split(/\n\n+/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  const ink = tokenValue('--ink', 'black');
  const muted = tokenValue('--ink-muted', 'gray');
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>${escapeHtml(title)} — ${escapeHtml(authority)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; direction: rtl; text-align: right; font-size: 12pt; line-height: 1.9; color: ${ink}; }
  p { margin-bottom: 0.75em; break-inside: avoid; orphans: 3; widows: 3; }
  @page { size: A4; margin: 2.5cm; @bottom-right { content: counter(page) ' / ' counter(pages); font-size: 9pt; color: ${muted}; } }
</style></head><body>${paragraphs}</body></html>`;
  const win = window.open('', '_blank', 'width=860,height=1050');
  if (win === null) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.setTimeout(() => {
    win.print();
  }, 300);
}

export function LetterDialog({ request, open, onClose, openerId, id, locale }: { request: RequestItem; open: boolean; onClose: () => void; openerId: string; id: string; locale: string }) {
  const t = useTranslations('theses');
  const [name, setName] = useState('');
  // DECISION 2: the download date, computed at render in the page's locale.
  const today = new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const fallback = t('foiaNameFallback');
  const resolved = resolveLetter(request.text, name, today, fallback);
  // DECISION 3: split on a blank line, NO colon heuristic. The runs keep their marking across the split.
  const paragraphs = letterRuns(request.text, name, today, fallback).reduce<LetterRun[][]>(
    (acc, run) => {
      const pieces = run.text.split(/\n\n+/);
      pieces.forEach((piece, index) => {
        if (index > 0) acc.push([]);
        if (piece !== '') (acc.at(-1) ?? []).push({ text: piece, filled: run.filled });
      });
      return acc;
    },
    [[]],
  );

  return (
    <Sheet id={id} open={open} onClose={onClose} labelledBy={openerId} className="letter-dialog">
      <p className="letter-authority">{request.authority}</p>

      <label className="letter-field">
        <span className="letter-field-label">{t('foiaNameLabel')}</span>
        <input
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder={t('foiaNamePlaceholder')}
          className="letter-input"
        />
        <span className="letter-field-hint">{t('foiaNameHint')}</span>
      </label>

      {/* DECISION 3: plain paragraphs. The resolved runs are marked with BOTH cues the researcher ruled
          (Q5 „א+ג”): the `--letter-fill` surface AND a `--line` underline, because the fill is 1.118:1
          against paper and works by hue alone, while the underline is 1 px. Neither alone serves both a
          colour reader and a greyscale one. */}
      <div data-letter className="letter-body">
        {paragraphs.map((runs, paragraph) => (
          <p key={`p${String(paragraph)}`}>
            {runs.map((run, index) =>
              run.filled ? (
                <mark key={`r${String(index)}`} data-letter-filled className="letter-fill">
                  {run.text}
                </mark>
              ) : (
                <span key={`r${String(index)}`}>{run.text}</span>
              ),
            )}
          </p>
        ))}
      </div>

      <p className="letter-addresses">
        {request.addresses.map((address) => (
          <bdi dir="ltr" key={address} className="me-2">
            {address}
          </bdi>
        ))}
      </p>

      <p className="letter-buttons">
        <button
          type="button"
          onClick={() => {
            printLetter(resolved, request.authority, t('foiaModalTitle'));
          }}
          className="letter-button"
        >
          {t('foiaDownloadBtn')}
        </button>
        <CopyableCode value={resolved} label={t('foiaCopyBtn')} />
        <button type="button" onClick={onClose} className="letter-button letter-button-quiet">
          {t('foiaCloseBtn')}
        </button>
      </p>
    </Sheet>
  );
}
