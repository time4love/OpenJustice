'use client';

import { useState, useEffect } from 'react';
import { apiUrl } from '@/lib/api';

// ---------------------------------------------------------------------------
// Claim trajectories, on the page that already shows the diffs.
//
// The timeline below this shows diffs — each one a comparison of two snapshots.
// A trajectory follows a single assertion across ALL of them, which is the only
// way "removed, restored, removed again" becomes visible: every diff containing
// that claim sees just its own step.
//
// It belongs in the UI and not only in the research tooling because it is the
// one artifact here a reader can check WITHOUT trusting this platform. Every
// finding ships the archived snapshot URLs it was computed from, and the
// computation is a string search anyone can repeat against web.archive.org.
// Rendering the pattern without those links would turn the strongest evidence in
// the system into one more assertion to be taken on faith.
// ---------------------------------------------------------------------------

interface Change {
  snapshotDate: string;
  snapshotUrl: string;
  present: boolean;
}

interface Finding {
  patternHash: string;
  transitions: number;
  finalState: 'PRESENT' | 'REMOVED';
  claimCount: number;
  changes: Change[];
  claims: { claimHash: string; claimText: string }[];
}

interface TrajectoryResponse {
  state?: 'COMPUTED' | 'NOT_COMPUTED';
  findingCount: number;
  claimsTracked: number;
  snapshotsExamined: number;
  candidatesNotFoundInArchive: number;
  findings: Finding[];
  error?: string;
}

export interface TrajectoryLabels {
  heading: string;
  explainer: string;
  empty: string;
  notComputed: string;
  movedTogether: (count: number) => string;
  flips: (count: number) => string;
  present: string;
  removed: string;
  finalRemoved: string;
  finalPresent: string;
  openSnapshot: string;
  showClaims: (count: number) => string;
  hideClaims: string;
  verifyHint: string;
}

export function TrajectoryPanel({
  trackedUrlId,
  labels,
}: {
  trackedUrlId: string;
  labels: TrajectoryLabels;
}) {
  const [data, setData] = useState<TrajectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/forensics/tracked/${trackedUrlId}/trajectories`));
        const json = (await res.json()) as TrajectoryResponse;
        if (!cancelled) setData(res.ok && !json.error ? json : null);
      } catch {
        // A trajectory panel must never take the diff timeline down with it.
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackedUrlId]);

  if (loading) {
    return <div className="h-24 rounded-xl bg-white border border-slate-200 animate-pulse" />;
  }
  if (!data) return null;

  // "Not detected yet" and "nothing oscillated" are opposite answers that look
  // identical if both render as an absent panel — the same error the API avoids
  // by returning NOT_COMPUTED instead of an empty result.
  if (data.state === 'NOT_COMPUTED') {
    return (
      <p className="text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl px-5 py-3">
        {labels.notComputed}
      </p>
    );
  }

  // Nothing to say is said by saying nothing — an empty panel above a populated
  // timeline reads as a broken feature.
  if (data.findingCount === 0) return null;

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 overflow-hidden">
      <div className="px-5 py-4 border-b border-indigo-200/70">
        <h2 className="text-sm font-semibold text-indigo-900">{labels.heading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-indigo-800/80">{labels.explainer}</p>
      </div>

      <ul className="divide-y divide-indigo-200/60">
        {data.findings.map((f) => {
          const isOpen = expanded === f.patternHash;
          return (
            <li key={f.patternHash} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {labels.movedTogether(f.claimCount)}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white text-slate-600 border border-slate-200">
                  {labels.flips(f.transitions)}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    f.finalState === 'REMOVED'
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {f.finalState === 'REMOVED' ? labels.finalRemoved : labels.finalPresent}
                </span>
              </div>

              {/* The pattern itself. Every point is a link to the archived
                  capture, because "open this and search for the text" is the
                  entire claim being made. */}
              <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
                {f.changes.map((c, i) => (
                  <li key={c.snapshotDate} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-400 text-xs px-1">→</span>}
                    <a
                      href={c.snapshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={labels.openSnapshot}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-mono border transition-colors hover:ring-2 hover:ring-indigo-300 ${
                        c.present
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-red-50 text-red-800 border-red-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${c.present ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      {c.snapshotDate}
                      <span className="font-sans">{c.present ? labels.present : labels.removed}</span>
                    </a>
                  </li>
                ))}
              </ol>

              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : f.patternHash)}
                className="mt-3 text-xs font-medium text-indigo-700 hover:text-indigo-900 transition-colors"
              >
                {isOpen ? labels.hideClaims : labels.showClaims(f.claimCount)}
              </button>

              {isOpen && (
                <ul className="mt-2 space-y-2">
                  {f.claims.map((c) => (
                    <li
                      key={c.claimHash}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700"
                    >
                      {c.claimText}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <p className="px-5 py-3 border-t border-indigo-200/70 text-[11px] leading-relaxed text-indigo-800/70">
        {labels.verifyHint}
      </p>
    </section>
  );
}
