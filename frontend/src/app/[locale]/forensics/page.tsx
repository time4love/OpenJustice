'use client';

import { useState, useRef, useCallback, useEffect, FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { TopNav } from '@/components/TopNav';
import { apiUrl } from '@/lib/api';
import { ClaimBlock } from '@/components/ClaimBlock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScanStatus = 'IDLE' | 'SCANNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';

interface ActiveJob {
  id: string;
  status: string;
  totalSnapshots: number;
  processedSnapshots: number;
  updatedAt: string;
}

interface TrackedUrlStatusResponse {
  id: string;
  url: string;
  status: ScanStatus;
  activeJob: ActiveJob | null;
  liveDiffs: SnapshotDiff[];
}

interface DiffItem {
  summary: string;
  exactQuote: string;
}

interface SnapshotDiff {
  id: string;
  beforeDate: string;
  date: string;
  snapshotUrl: string;
  deletedItems: DiffItem[];
  addedItems: DiffItem[];
  rawDeletedChunks: string[];
  rawAddedChunks: string[];
  legalSignificance: string;
}

interface TrackedUrlResult {
  trackedUrlId: string;
  url: string;
  title: string | null;
  count: number;
  diffs: SnapshotDiff[];
}

interface TrackedUrlItem {
  id: string;
  url: string;
  title: string | null;
  status: ScanStatus;
  createdAt: string;
  totalDiffs: number;
}

interface ScrapeJob {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  fromDate: string | null;
  totalSnapshots: number;
  processedSnapshots: number;
  createdAt: string;
}

type Phase = 'idle' | 'creating' | 'polling' | 'paused' | 'fetching' | 'done' | 'error';

const POLL_INTERVAL_MS = 3_000;
const STALL_THRESHOLD_MS = 35_000;

// ---------------------------------------------------------------------------
// Locale switcher
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-20 border border-dashed border-slate-200 rounded-xl bg-white shadow-sm">
      <div className="text-3xl mb-4 text-slate-300">&#x26B2;</div>
      <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
      <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{sub}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress state — shown while TrackedUrl is SCANNING
// ---------------------------------------------------------------------------

function ProgressState({
  total,
  processed,
  stalled,
  pausing,
  resuming,
  processingLabel,
  progressLabel,
  stalledLabel,
  resumeBtn,
  resumingBtn,
  pauseBtn,
  pausingBtn,
  onResume,
  onPause,
}: {
  total: number;
  processed: number;
  stalled: boolean;
  pausing: boolean;
  resuming: boolean;
  processingLabel: string;
  progressLabel: string;
  stalledLabel: string;
  resumeBtn: string;
  resumingBtn: string;
  pauseBtn: string;
  pausingBtn: string;
  onResume: () => void;
  onPause: () => void;
}) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16 border border-slate-200 rounded-xl bg-white shadow-sm gap-5">
      {/* Spinner */}
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
        <div className="absolute inset-0 rounded-full border-2 border-t-red-500 animate-spin" />
      </div>

      {/* Label */}
      <p className="text-sm font-medium text-slate-700">{processingLabel}</p>

      {/* Progress bar */}
      <div className="w-full max-w-xs space-y-1.5">
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-red-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 font-mono">{progressLabel}</p>
      </div>

      {/* Stall warning + resume */}
      {stalled ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-amber-600">{stalledLabel}</p>
          <button
            onClick={onResume}
            disabled={resuming}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {resuming ? resumingBtn : resumeBtn}
          </button>
        </div>
      ) : (
        <button
          onClick={onPause}
          disabled={pausing}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          {pausing ? pausingBtn : pauseBtn}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paused state — shown when TrackedUrl is PAUSED
// ---------------------------------------------------------------------------

function PausedState({
  total,
  processed,
  progressLabel,
  pausedLabel,
  pausedSub,
  resumeBtn,
  resuming,
  onResume,
}: {
  total: number;
  processed: number;
  progressLabel: string;
  pausedLabel: string;
  pausedSub: string;
  resumeBtn: string;
  resuming: boolean;
  onResume: () => void;
}) {
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16 border border-amber-200 rounded-xl bg-amber-50/40 shadow-sm gap-5">
      {/* Paused icon */}
      <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center">
        <span className="text-amber-600 text-lg font-bold">⏸</span>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-amber-800">{pausedLabel}</p>
        <p className="text-xs text-amber-600 max-w-xs">{pausedSub}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs space-y-1.5">
        <div className="h-2 rounded-full bg-amber-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-amber-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-amber-500 font-mono">{progressLabel}</p>
      </div>

      <button
        onClick={onResume}
        disabled={resuming}
        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {resumeBtn}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diff node — a single legally significant change
// ---------------------------------------------------------------------------

function DiffNode({
  diff,
  index,
  labels,
}: {
  diff: SnapshotDiff;
  index: number;
  labels: {
    deletionsLabel: string;
    additionsLabel: string;
    forensicLabel: string;
    viewSnapshot: string;
  };
}) {
  return (
    <div className="flex gap-3 sm:gap-4 mb-5 last:mb-0">
      {/* Spine */}
      <div className="flex flex-col items-center shrink-0">
        <div className="w-3 h-3 rounded-full ring-2 ring-slate-50 shadow-sm mt-[1.125rem] shrink-0 bg-red-500" />
        <div className="w-px flex-1 bg-slate-200 mt-1.5 min-h-8" />
      </div>

      {/* Card */}
      <div className="flex-1 min-w-0 rounded-xl border border-red-200 shadow-sm overflow-hidden bg-red-50/30">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 border-b border-red-100 bg-red-50">
          <span className="font-mono text-xs text-slate-500 font-medium shrink-0">{diff.date}</span>
          <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-300 uppercase tracking-wide">
            Silent Edit Detected
          </span>
          <span className="ms-auto text-xs text-slate-300 font-mono shrink-0">#{index + 1}</span>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {(diff.deletedItems.length > 0 || diff.rawDeletedChunks.length > 0) && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-red-600 uppercase tracking-widest">
                {labels.deletionsLabel}
              </span>
              <div className="space-y-2">
                {diff.deletedItems.length > 0
                  ? diff.deletedItems.map((item, i) => (
                      <ClaimBlock
                        key={`del-${i}`}
                        claim={item.summary}
                        rawChunk={item.exactQuote || undefined}
                        type="deleted"
                      />
                    ))
                  : diff.rawDeletedChunks.map((chunk, i) => (
                      <ClaimBlock key={`del-raw-${i}`} claim={null} rawChunk={chunk} type="deleted" />
                    ))}
              </div>
            </div>
          )}

          {(diff.addedItems.length > 0 || diff.rawAddedChunks.length > 0) && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">
                {labels.additionsLabel}
              </span>
              <div className="space-y-2">
                {diff.addedItems.length > 0
                  ? diff.addedItems.map((item, i) => (
                      <ClaimBlock
                        key={`add-${i}`}
                        claim={item.summary}
                        rawChunk={item.exactQuote || undefined}
                        type="added"
                      />
                    ))
                  : diff.rawAddedChunks.map((chunk, i) => (
                      <ClaimBlock key={`add-raw-${i}`} claim={null} rawChunk={chunk} type="added" />
                    ))}
              </div>
            </div>
          )}

          {diff.legalSignificance && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {labels.forensicLabel}
              </span>
              <p
                className="text-sm text-slate-700 leading-relaxed border-s-2 border-slate-300 ps-3"
                dir="auto"
              >
                {diff.legalSignificance}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end pt-1 border-t border-red-100/60">
            <a
              href={diff.snapshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              {labels.viewSnapshot}
              <span aria-hidden="true">&#x2197;</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge — used for both TrackedUrl and ScrapeJob statuses
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  SCANNING:    'bg-blue-100 text-blue-700 border-blue-200',
  PAUSED:      'bg-amber-100 text-amber-700 border-amber-200',
  COMPLETED:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  FAILED:      'bg-red-100 text-red-700 border-red-200',
  IDLE:        'bg-slate-100 text-slate-500 border-slate-200',
  PENDING:     'bg-amber-100 text-amber-700 border-amber-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// History entry — one TrackedUrl row, expandable to show scrape job batches
// ---------------------------------------------------------------------------

function HistoryEntry({
  item,
  labels,
  onDeleted,
  onResume,
  scanning,
}: {
  item: TrackedUrlItem;
  labels: {
    viewBtn: string;
    diffsCount: string;
    batchCount: string;
    deleteBtn: string;
    deletingBtn: string;
    deleteConfirm: string;
    deleteError: string;
    expandBatches: string;
    collapseBatches: string;
    batchLabel: (n: number) => string;
    batchFrom: (date: string) => string;
    batchStart: string;
    batchSnapshots: (p: number, t: number) => string;
    jobsLoading: string;
    jobsError: string;
    resumeBtn: string;
  };
  onDeleted: (id: string) => void;
  onResume: (item: TrackedUrlItem) => void;
  scanning: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [jobs, setJobs] = useState<ScrapeJob[] | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadJobs() {
    if (jobs !== null) return; // already loaded
    try {
      const res = await fetch(apiUrl(`/api/forensics/tracked/${item.id}/jobs`));
      const data = (await res.json()) as { jobs?: ScrapeJob[]; message?: string };
      if (!res.ok) { setJobsError(data.message ?? labels.jobsError); return; }
      setJobs(data.jobs ?? []);
    } catch {
      setJobsError(labels.jobsError);
    }
  }

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadJobs();
  }

  async function handleDelete() {
    if (!window.confirm(labels.deleteConfirm)) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(apiUrl(`/api/forensics/tracked/${item.id}`), { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setDeleteError(data.message ?? labels.deleteError);
        return;
      }
      onDeleted(item.id);
    } catch {
      setDeleteError(labels.deleteError);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
        {/* Expand toggle */}
        <button
          onClick={handleToggle}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
          aria-label={expanded ? labels.collapseBatches : labels.expandBatches}
        >
          <span className={`text-xs transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>
            &#x25B6;
          </span>
        </button>

        {/* URL + meta */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-xs font-mono text-slate-700 truncate" title={item.url} dir="ltr">
            {item.url}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={item.status} />
            <span className="text-xs text-slate-400">{labels.diffsCount}</span>
            <span className="text-slate-200">·</span>
            <span className="text-xs text-slate-400">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </div>
          {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!scanning && (item.status === 'PAUSED' || item.status === 'SCANNING') && (
            <button
              onClick={() => onResume(item)}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              {labels.resumeBtn}
            </button>
          )}
          <Link
            href={`/forensics/${item.id}`}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-700 transition-colors"
          >
            {labels.viewBtn}
          </Link>
          <button
            onClick={() => { void handleDelete(); }}
            disabled={deleting}
            className="px-3 py-1 rounded-lg text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            {deleting ? labels.deletingBtn : labels.deleteBtn}
          </button>
        </div>
      </div>

      {/* Expanded jobs panel */}
      {expanded && (
        <div className="px-4 pb-3 ms-8">
          {jobsError && (
            <p className="text-xs text-red-600 py-2">{jobsError}</p>
          )}
          {!jobsError && jobs === null && (
            <p className="text-xs text-slate-400 py-2">{labels.jobsLoading}</p>
          )}
          {jobs !== null && jobs.length === 0 && (
            <p className="text-xs text-slate-400 py-2 italic">—</p>
          )}
          {jobs !== null && jobs.length > 0 && (
            <table className="w-full text-xs border-collapse">
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job, i) => (
                  <tr key={job.id} className="text-slate-600">
                    <td className="py-1.5 pe-3 font-medium text-slate-500 whitespace-nowrap">
                      {labels.batchLabel(i + 1)}
                    </td>
                    <td className="py-1.5 pe-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-1.5 pe-3 font-mono text-slate-400 whitespace-nowrap">
                      {job.fromDate
                        ? labels.batchFrom(job.fromDate.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))
                        : labels.batchStart}
                    </td>
                    <td className="py-1.5 font-mono text-slate-400 whitespace-nowrap">
                      {labels.batchSnapshots(job.processedSnapshots, job.totalSnapshots)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ForensicsPage() {
  const t = useTranslations('forensics');
  const tc = useTranslations('common');

  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [trackedUrlId, setTrackedUrlId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ total: number; processed: number } | null>(null);
  const [liveDiffs, setLiveDiffs] = useState<SnapshotDiff[]>([]);
  const [result, setResult] = useState<TrackedUrlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [history, setHistory] = useState<TrackedUrlItem[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastJobUpdatedAtRef = useRef<string | null>(null);
  const lastUpdateTimeRef = useRef<number | null>(null);
  const trackedUrlIdRef = useRef<string | null>(null);
  const pollStatusRef = useRef<((id: string) => Promise<void>) | null>(null);

  const loadHistory = useCallback(() => {
    fetch(apiUrl('/api/forensics/tracked'))
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { items: TrackedUrlItem[] };
        setHistory(data.items);
      })
      .catch(() => { /* non-fatal */ });
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const fetchResults = useCallback(
    async (id: string) => {
      setPhase('fetching');
      try {
        const res = await fetch(apiUrl(`/api/forensics/tracked/${id}`));
        const data = (await res.json()) as TrackedUrlResult & { error?: string; message?: string };
        if (!res.ok) throw new Error(data.message ?? data.error ?? `Error ${res.status}`);
        setResult(data);
        setPhase('done');
        loadHistory();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
        setPhase('error');
      }
    },
    [loadHistory],
  );

  const startPolling = useCallback(
    (id: string) => {
      stopPolling();
      pollIntervalRef.current = setInterval(() => {
        void pollStatusRef.current?.(id);
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  const pollStatus = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(apiUrl(`/api/forensics/tracked/${id}/status`));
        if (!res.ok) return;
        const data = (await res.json()) as TrackedUrlStatusResponse;

        // Update progress bar and live diffs
        if (data.activeJob) {
          setScanProgress({
            total: data.activeJob.totalSnapshots,
            processed: data.activeJob.processedSnapshots,
          });

          // Stall detection — compare activeJob.updatedAt
          if (data.activeJob.updatedAt !== lastJobUpdatedAtRef.current) {
            lastJobUpdatedAtRef.current = data.activeJob.updatedAt;
            lastUpdateTimeRef.current = Date.now();
            setStalled(false);
          } else if (
            lastUpdateTimeRef.current !== null &&
            Date.now() - lastUpdateTimeRef.current > STALL_THRESHOLD_MS
          ) {
            setStalled(true);
          }
        }

        if (data.liveDiffs.length > 0) {
          setLiveDiffs(data.liveDiffs);
        }

        if (data.status === 'COMPLETED') {
          stopPolling();
          await fetchResults(id);
        } else if (data.status === 'FAILED') {
          stopPolling();
          setError('Scan job failed on the server.');
          setPhase('error');
        } else if (data.status === 'PAUSED') {
          stopPolling();
          setPausing(false);
          setPhase('paused');
          loadHistory();
        }
      } catch {
        // Network blip — keep polling
      }
    },
    [stopPolling, fetchResults],
  );

  useEffect(() => { pollStatusRef.current = pollStatus; }, [pollStatus]);

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }

    stopPolling();
    setPhase('creating');
    setError(null);
    setResult(null);
    setTrackedUrlId(null);
    trackedUrlIdRef.current = null;
    setScanProgress(null);
    setLiveDiffs([]);
    setStalled(false);
    lastJobUpdatedAtRef.current = null;
    lastUpdateTimeRef.current = null;

    try {
      const res = await fetch(apiUrl('/api/forensics/scan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as { trackedUrlId?: string; error?: string; message?: string };
      if (!res.ok || !data.trackedUrlId) {
        setError(data.message ?? data.error ?? `Error ${res.status}`);
        setPhase('error');
        return;
      }

      setTrackedUrlId(data.trackedUrlId);
      trackedUrlIdRef.current = data.trackedUrlId;
      setPhase('polling');
      lastUpdateTimeRef.current = Date.now();
      startPolling(data.trackedUrlId);
    } catch {
      setError('Could not reach the backend. Is the server running?');
      setPhase('error');
    }
  }

  async function handlePause() {
    const id = trackedUrlIdRef.current;
    if (!id) return;
    setPausing(true);
    try {
      await fetch(apiUrl(`/api/forensics/pause/${id}`), { method: 'POST' });
      // Polling will detect PAUSED status and transition phase
    } catch {
      setPausing(false);
    }
  }

  async function handleResume() {
    const id = trackedUrlIdRef.current;
    if (!id) return;
    setResuming(true);
    setStalled(false);
    setPausing(false);
    lastUpdateTimeRef.current = Date.now();
    setPhase('polling');
    try {
      // Re-POST scan — server handles SCANNING and PAUSED TrackedUrls (resumes existing)
      void fetch(apiUrl('/api/forensics/scan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!pollIntervalRef.current) startPolling(id);
    } finally {
      setResuming(false);
    }
  }

  async function handleResumeFromHistory(item: TrackedUrlItem) {
    setUrl(item.url);
    trackedUrlIdRef.current = item.id;
    setResuming(true);
    setStalled(false);
    setPausing(false);
    lastUpdateTimeRef.current = Date.now();
    setPhase('polling');
    try {
      void fetch(apiUrl('/api/forensics/scan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url }),
      });
      if (!pollIntervalRef.current) startPolling(item.id);
    } finally {
      setResuming(false);
    }
  }

  const scanning = phase === 'creating' || phase === 'polling' || phase === 'fetching';

  const diffLabels = {
    deletionsLabel: t('deletionsLabel'),
    additionsLabel: t('additionsLabel'),
    forensicLabel: t('forensicLabel'),
    viewSnapshot: t('viewSnapshot'),
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-lg">&#x29C6;</span>
            <div>
              <span className="font-mono text-sm font-semibold tracking-widest text-slate-900 uppercase">
                {tc('appName')}
              </span>
              <span className="ms-3 text-xs text-slate-400 tracking-wide hidden sm:inline">
                {t('tagline')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 hidden sm:flex">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {tc('operational')}
            </span>
            <TopNav current="forensics" />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Scanner panel */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-1">{t('scanHeading')}</h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed max-w-2xl">
            {t('scanDescription')}
          </p>

          <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label htmlFor="forensic-url" className="sr-only">
                {t('urlLabel')}
              </label>
              <input
                ref={inputRef}
                id="forensic-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('urlPlaceholder')}
                disabled={scanning}
                required
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={scanning || !url.trim()}
              className="shrink-0 px-5 py-2.5 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scanning ? t('scanningBtn') : t('scanBtn')}
            </button>
          </form>
        </div>

        {/* Previously Scanned URLs */}
        {history.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">
                {t('historyHeading')}
              </h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {history.map((item) => (
                <HistoryEntry
                  key={item.id}
                  item={item}
                  labels={{
                    viewBtn: t('historyViewBtn'),
                    diffsCount: t('historyDiffsCount', { count: item.totalDiffs }),
                    batchCount: t('historyBatchCount', { count: item.totalDiffs }),
                    deleteBtn: t('historyDeleteBtn'),
                    deletingBtn: t('historyDeletingBtn'),
                    deleteConfirm: t('historyDeleteConfirm'),
                    deleteError: t('historyDeleteError'),
                    expandBatches: t('historyExpandBatches'),
                    collapseBatches: t('historyCollapseBatches'),
                    batchLabel: (n) => t('historyBatchLabel', { n }),
                    batchFrom: (date) => t('historyBatchFrom', { date }),
                    batchStart: t('historyBatchStart'),
                    batchSnapshots: (processed, total) => t('historyBatchSnapshots', { processed, total }),
                    jobsLoading: t('historyJobsLoading'),
                    jobsError: t('historyJobsError'),
                    resumeBtn: t('resumeBtn'),
                  }}
                  onDeleted={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
                  onResume={(item) => { void handleResumeFromHistory(item); }}
                  scanning={scanning}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700">{t('errorTitle')}</p>
              <p className="text-xs text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Creating scan */}
        {phase === 'creating' && (
          <div className="flex flex-col items-center justify-center text-center px-8 py-20 border border-slate-200 rounded-xl bg-white shadow-sm">
            <div className="relative w-10 h-10 mb-5">
              <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
              <div className="absolute inset-0 rounded-full border-2 border-t-red-500 animate-spin" />
            </div>
            <p className="text-xs text-slate-500">{t('creatingJob')}</p>
          </div>
        )}

        {/* Polling — TrackedUrl SCANNING */}
        {phase === 'polling' && (
          <>
            <ProgressState
              total={scanProgress?.total ?? 0}
              processed={scanProgress?.processed ?? 0}
              stalled={stalled}
              pausing={pausing}
              resuming={resuming}
              processingLabel={t('processingSnapshots')}
              progressLabel={t('snapshotProgress', {
                processed: scanProgress?.processed ?? 0,
                total: scanProgress?.total ?? 0,
              })}
              stalledLabel={t('jobStalled')}
              resumeBtn={t('resumeBtn')}
              resumingBtn={t('resumingBtn')}
              pauseBtn={t('pauseBtn')}
              pausingBtn={t('pausingBtn')}
              onResume={() => { void handleResume(); }}
              onPause={() => { void handlePause(); }}
            />

            {/* Live findings — significant diffs found so far */}
            {liveDiffs.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    {t('liveFindings', { count: liveDiffs.length })}
                  </span>
                </div>
                {liveDiffs.map((diff, i) => (
                  <DiffNode key={diff.id} diff={diff} index={i} labels={diffLabels} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Paused */}
        {phase === 'paused' && (
          <>
            <PausedState
              total={scanProgress?.total ?? 0}
              processed={scanProgress?.processed ?? 0}
              progressLabel={t('snapshotProgress', {
                processed: scanProgress?.processed ?? 0,
                total: scanProgress?.total ?? 0,
              })}
              pausedLabel={t('scanPaused')}
              pausedSub={t('scanPausedSub')}
              resumeBtn={t('resumeBtn')}
              resuming={resuming}
              onResume={() => { void handleResume(); }}
            />
            {liveDiffs.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    {t('liveFindings', { count: liveDiffs.length })}
                  </span>
                </div>
                {liveDiffs.map((diff, i) => (
                  <DiffNode key={diff.id} diff={diff} index={i} labels={diffLabels} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Fetching results */}
        {phase === 'fetching' && (
          <div className="flex flex-col items-center justify-center text-center px-8 py-20 border border-slate-200 rounded-xl bg-white shadow-sm">
            <div className="relative w-10 h-10 mb-5">
              <div className="absolute inset-0 rounded-full border-2 border-slate-200" />
              <div className="absolute inset-0 rounded-full border-2 border-t-red-500 animate-spin" />
            </div>
            <p className="text-xs text-slate-500">{t('fetchingResults')}</p>
          </div>
        )}

        {/* Results */}
        {phase === 'done' && result !== null && (
          <>
            {result.count === 0 ? (
              <EmptyState title={t('noChangesTitle')} sub={t('noChangesSub')} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {t('resultsHeading', { count: result.count })}
                  </span>
                  <span
                    className="text-xs text-slate-400 font-mono truncate max-w-xs"
                    title={result.url}
                  >
                    {result.url}
                  </span>
                  <Link
                    href={`/forensics/${result.trackedUrlId}`}
                    className="ms-auto flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                  >
                    {t('drillDownLink')}
                    <span aria-hidden="true">&#x2192;</span>
                  </Link>
                </div>
                <div>
                  {result.diffs.map((diff, i) => (
                    <DiffNode key={diff.id} diff={diff} index={i} labels={diffLabels} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
