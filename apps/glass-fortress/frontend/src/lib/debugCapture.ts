/**
 * In-memory capture of console output, uncaught errors, and fetch calls, for
 * the staging-only debug console (`DebugConsolePanel`). Lets someone on a
 * device with no attached devtools (a phone) see what actually happened —
 * e.g. a fetch silently failing and the UI falling back to zero, which reads
 * as "the DB is broken" with nothing on screen to say otherwise.
 *
 * Only ever installed from `DebugConsolePanel`, which is only ever rendered
 * by the server-gated `StagingDebugConsole` — never imported unconditionally,
 * so this never patches anything in production.
 */

export type DebugEntryKind = 'log' | 'info' | 'warn' | 'error' | 'network' | 'exception' | 'rejection';

export interface DebugEntry {
  id: number;
  ts: number;
  kind: DebugEntryKind;
  message: string;
  detail?: string;
}

const MAX_ENTRIES = 300;

let entries: DebugEntry[] = [];
let nextId = 1;
let installed = false;
const listeners = new Set<() => void>();

function push(kind: DebugEntryKind, message: string, detail?: string) {
  entries.push({ id: nextId++, ts: Date.now(), kind, message, detail });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  listeners.forEach((l) => l());
}

function safeStringify(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error'] as const;

export function installDebugCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  for (const level of CONSOLE_LEVELS) {
    const original = console[level].bind(console);
    console[level] = ((...args: unknown[]) => {
      original(...args);
      push(level, safeStringify(args));
    }) as Console[typeof level];
  }

  window.addEventListener('error', (e) => {
    push('exception', e.message, `${e.filename}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    push('rejection', e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : String(e.reason));
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const start = Date.now();
    try {
      const res = await originalFetch(input, init);
      push('network', `${method} ${url} → ${res.status}`, `${Date.now() - start}ms`);
      return res;
    } catch (err) {
      push('network', `${method} ${url} → FAILED`, err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}

// Installed eagerly at module-evaluation time, not from a useEffect — a
// useEffect only fires after the whole tree commits, which is *after*
// page-level effects (like the homepage's own data fetch) have already run.
// This must be active before anything else's effects fire, or it misses
// exactly the initial-load failures it exists to catch.
installDebugCapture();

export function getDebugEntries(): DebugEntry[] {
  return entries;
}

export function subscribeDebugEntries(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function clearDebugEntries(): void {
  entries = [];
  listeners.forEach((l) => l());
}
