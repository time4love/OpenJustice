'use client';

import { useEffect, useState } from 'react';
import {
  getDebugEntries,
  subscribeDebugEntries,
  clearDebugEntries,
  type DebugEntry,
  type DebugEntryKind,
} from '@/lib/debugCapture'; // imported for its module-level installDebugCapture() side effect too

// Deliberately not run through next-intl: this is a technical debugging tool
// for whoever has staging access, not user-facing product copy, and the
// captured log lines themselves are raw technical strings regardless of locale.

const KIND_STYLES: Record<DebugEntryKind, string> = {
  log: 'text-slate-300',
  info: 'text-blue-300',
  warn: 'text-amber-300',
  error: 'text-red-300',
  exception: 'text-red-300',
  rejection: 'text-red-300',
  network: 'text-emerald-300',
};

function isFailedNetwork(entry: DebugEntry): boolean {
  if (entry.kind !== 'network') return false;
  return /→ (FAILED|4\d\d|5\d\d)/.test(entry.message);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

export function DebugConsolePanel() {
  const [open, setOpen] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => subscribeDebugEntries(() => bump((n) => n + 1)), []);

  const entries = getDebugEntries();
  const errorCount = entries.filter((e) => e.kind === 'error' || e.kind === 'exception' || e.kind === 'rejection' || isFailedNetwork(e)).length;

  function copyAll() {
    const text = entries
      .map((e) => `[${formatTime(e.ts)}] ${e.kind.toUpperCase()} ${e.message}${e.detail ? `  (${e.detail})` : ''}`)
      .join('\n');
    void navigator.clipboard?.writeText(text);
  }

  return (
    <>
      {open && (
        <div className="fixed inset-x-2 bottom-16 sm:inset-x-auto sm:start-3 sm:w-[440px] max-h-[70vh] z-50 flex flex-col bg-slate-950 border border-slate-700 rounded-xl shadow-2xl overflow-hidden font-mono text-xs">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
            <span className="text-slate-200 font-semibold tracking-wide">Debug Console</span>
            <div className="flex items-center gap-2">
              <button
                onClick={copyAll}
                className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => clearDebugEntries()}
                className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                aria-label="Close debug console"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 px-3 py-2 space-y-1">
            {entries.length === 0 && (
              <p className="text-slate-500">No log entries yet.</p>
            )}
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`leading-snug break-all ${
                  isFailedNetwork(entry) ? 'text-red-300' : KIND_STYLES[entry.kind]
                }`}
              >
                <span className="text-slate-500">[{formatTime(entry.ts)}]</span>{' '}
                <span className="uppercase text-[10px] opacity-70">{entry.kind}</span>{' '}
                {entry.message}
                {entry.detail && <span className="text-slate-500"> ({entry.detail})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-16 start-3 z-50 w-10 h-10 rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-700 transition-colors flex items-center justify-center font-mono text-sm"
        aria-label="Toggle staging debug console"
      >
        {errorCount > 0 ? (
          <span className="relative">
            🐞
            <span className="absolute -top-2 -end-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center">
              {errorCount > 9 ? '9+' : errorCount}
            </span>
          </span>
        ) : (
          '🐞'
        )}
      </button>
    </>
  );
}
