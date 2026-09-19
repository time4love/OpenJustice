// ---------------------------------------------------------------------------
// WHAT THIS BROWSER HAS OPENED — docs/gf-ui-refactor-plan.md §9 :1084–:1085; docs/gf-ui-flows.md §39 :922
// (a per-viewer convenience is the browser's, never the backend's) and §8 :329–:343 (one read per page).
//
// NO READ, NO WRITE. The sidebar's two lists cost the platform nothing: they are not a query, not a column and
// not a session. Nothing here records that a page was VIEWED for anyone but this browser's own reader (§39
// :925–:927), and no flow anywhere reads this key.
//
// THIS MODULE IMPORTS NOTHING, and that is a rule rather than an accident: a pure module never gains a
// dependency (the researcher, 2026-09-11). `test/recentsAreLocal.test.tsx` asserts the import list is empty.
//
// THE LABEL IS STORED, NEVER DERIVED. A thesis is its claim's first words, a page its domain and path, a
// record „צילום · <date>” — so the sidebar renders text it was handed and can never print a cuid, a 64-hex
// name or a 14-digit stamp by accident (§4 :167–:178). If the label were computed at render from the href,
// every caller would have to be trusted separately; stored, the rule holds in one place.
//
// NOTHING IN `src/` WRITES IT AT UI-4b. The pages that will — the ones that render a thesis, a page or a
// record — are KEEP this round (§9 :1092–:1094), so both categories are empty on every live route and UI-5's
// re-brief lands the writer. The reader ships first because the sidebar is the shell's, not the page's.
// ---------------------------------------------------------------------------

export type RecentKind = 'thesis' | 'page' | 'record';

export interface Recent {
  kind: RecentKind;
  /** Where the item is, locale-relative — `/theses/<id>`, `/corpus?page=<id>`, `/records/<hash>`. */
  href: string;
  /** What a person recognises it by. Stored, never derived. */
  label: string;
  /** When it was last watched, epoch milliseconds. The order is newest first. */
  at: number;
}

/** ONE key. Versioned, so a shape change never has to read a shape it does not understand. */
export const RECENTS_KEY = 'gf.recents.v1';

/**
 * How many of each kind the sidebar remembers. PER KIND rather than in total, so a reader who opens twenty
 * records does not lose the thesis they are reading. An operational parameter (ui-flows A6 :1093–:1097), not
 * a judgement.
 */
export const RECENTS_PER_KIND = 8;

const KINDS: readonly RecentKind[] = ['thesis', 'page', 'record'];

function isRecent(value: unknown): value is Recent {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<Record<keyof Recent, unknown>>;
  return (
    typeof entry.kind === 'string' &&
    (KINDS as readonly string[]).includes(entry.kind) &&
    typeof entry.href === 'string' &&
    typeof entry.label === 'string' &&
    entry.label.trim() !== '' &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at)
  );
}

/**
 * Every entry this browser holds, newest watched first. A missing, malformed or unreadable value answers an
 * EMPTY list: the sidebar renders its categories with nothing under them, which is a real state of the page
 * and not an error. `localStorage` itself throws in a private window and in a browser with site data blocked,
 * so the access is guarded rather than assumed.
 */
export function readRecents(): Recent[] {
  let raw: string | null = null;
  try {
    raw = globalThis.localStorage.getItem(RECENTS_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isRecent).sort((a, b) => b.at - a.at);
}

/**
 * Record that this browser opened something. A second visit MOVES the entry rather than duplicating it — the
 * list is what is open, not a history — and each kind is capped independently.
 */
export function noteRecent(entry: { kind: RecentKind; href: string; label: string; at?: number }): void {
  const now = entry.at ?? Date.now();
  const kept = readRecents().filter((existing) => existing.href !== entry.href);
  const next = [{ kind: entry.kind, href: entry.href, label: entry.label, at: now }, ...kept]
    .sort((a, b) => b.at - a.at)
    .filter((candidate, _index, all) => all.filter((other) => other.kind === candidate.kind).indexOf(candidate) < RECENTS_PER_KIND);
  try {
    globalThis.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // A browser that will not store it renders correctly without it; there is nothing to report and nothing
    // to retry. The list is a convenience, and §39 :922 says a page must work when it is absent.
  }
}

/** The entries of one kind, newest watched first — what one sidebar category renders. */
export function recentsOfKind(kind: RecentKind, entries: readonly Recent[]): Recent[] {
  return entries.filter((entry) => entry.kind === kind);
}
