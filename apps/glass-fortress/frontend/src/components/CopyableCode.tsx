'use client';

import { useEffect, useState } from 'react';

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
 * THE COPY CONTROL — docs/gf-ui-flows.md §4 :170–:176. One per thing, carrying the CHAT-READY form of a value,
 * and **labelled by what the value is FOR, never by what it is**: "copy for a new conversation", not "copy id".
 *
 * `showValue` decides whether the value is also READ. A URL is read; a hash, a cuid or a wayback timestamp is not
 * (§4 :167–:170) — a COPY control and the VERIFY disclosure are their only two homes, and `no-id-as-text` holds it.
 *
 * The failure branch is the point, as before: `navigator.clipboard` is undefined on a non-secure origin and
 * permission can be refused, so a button that always says "copied" reports success for something that did not
 * happen. It says so, and the value stays selectable.
 */
export function CopyableCode({ value, label, showValue = false }: { value: string; label: string; showValue?: boolean }) {
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

  return (
    <span data-copy className="inline-flex items-center gap-2">
      {showValue ? (
        <code data-copy-value={value} dir="ltr" className="min-w-0 overflow-x-auto rounded bg-ink px-2 py-1 font-mono text-value text-paper">
          {value}
        </code>
      ) : null}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        title={label}
        {...(showValue ? {} : { 'data-copy-value': value })}
        className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-ink hover:bg-paper-deep"
      >
        {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
        {label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'idle' ? '' : label}
      </span>
    </span>
  );
}
