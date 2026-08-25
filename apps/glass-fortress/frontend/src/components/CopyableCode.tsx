'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type CopyState = 'idle' | 'copied' | 'failed';

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * A value the reader is meant to paste somewhere, with a copy button.
 *
 * The failure branch is the point. `navigator.clipboard` is undefined on any
 * non-secure origin that is not localhost, and permission can be refused even
 * where it exists — so a button that reports "copied" unconditionally reports
 * success for something that did not happen. It says so instead, and the text
 * stays selectable, which is the fallback a reader can actually act on.
 */
export function CopyableCode({ value }: { value: string }) {
  const tc = useTranslations('common');
  const [state, setState] = useState<CopyState>('idle');

  // Self-cancelling, so an unmount mid-timeout cannot set state on a dead component.
  useEffect(() => {
    if (state === 'idle') return;
    const id = window.setTimeout(() => setState('idle'), 2500);
    return () => window.clearTimeout(id);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable on this origin');
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  const label =
    state === 'copied' ? tc('copied') : state === 'failed' ? tc('copyFailed') : tc('copy');

  return (
    <div>
      <div className="flex items-stretch gap-2 bg-slate-900 rounded-lg overflow-hidden">
        <code
          dir="ltr"
          className="flex-1 min-w-0 text-emerald-400 text-xs sm:text-sm font-mono px-3 py-2.5 overflow-x-auto text-left whitespace-nowrap"
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={label}
          title={label}
          className={`shrink-0 px-3 flex items-center justify-center border-s transition-colors ${
            state === 'copied'
              ? 'border-emerald-800 text-emerald-400'
              : state === 'failed'
                ? 'border-amber-800 text-amber-400'
                : 'border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>

      {/* Announced to assistive tech, and shown outright when the copy failed —
          silence would leave the reader believing it worked. */}
      <p
        role="status"
        aria-live="polite"
        className={state === 'failed' ? 'mt-2 text-xs text-amber-400' : 'sr-only'}
      >
        {state === 'idle' ? '' : label}
      </p>
    </div>
  );
}
