import { posix, relative } from 'node:path';
import { SRC, codeOf, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// NOTHING READS THE LEGACY REGISTER OFF A CAPTURE — R45, THE REGISTER CORRECTION.
//
// `UrlSnapshot` carries two registers. The CURRENT one — `text`, `textHash`,
// `textExtractionVersion` — is what every diff and trajectory is derived from
// (docs/gf-interaction-flows.md A2; docs/gf-evidence-flows.md A3 CURRENT(capture)).
// The LEGACY one — `fullText`, Readability's article — was what trajectories and
// `verify_claim_text` still read until R45, and the step-19 staging walk found the
// cost: a trajectory asserted the FDA sentence absent at 20220805053301 while the
// page and the current `text` both held it (docs/gf-thesis-step-19-2026-09-12.md §3).
// R45 moved those readers; this holds that no module drifts back.
//
// TWO HALVES, AND NEITHER IMPLIES THE OTHER:
//
//   PAYLOAD      `fullText` named as a KEY inside a `urlSnapshot` call's arguments —
//                select, data, where, orderBy, include, at any depth — or inside a
//                constant such a call spreads or passes by name as one of those keys,
//                declared in the same module or imported from another through a
//                relative specifier (followed through the constants IT spreads or
//                names), or inside an object declared `satisfies Prisma.UrlSnapshot…`.
//   MEMBER       the member access `.fullText` anywhere in a module's code.
//
// The payload half alone cannot see a whole-row read (no select) followed by
// `row.fullText` — the exact shape that hid a live read of `TrackedUrl.status` from a
// select grep. The member half alone cannot see a select that is never dereferenced
// by that name (a destructure, a bracket read). Nested reads inside an `include` are
// reported whatever relation they follow: only `UrlSnapshot` has a `fullText` field.
//
// WHAT NEITHER HALF SEES, stated so nobody trusts it further: a select built by a
// function; raw SQL. The other legacy columns —
// `contentHash`, `snapshotUrl`, `comparedToSnapshotId` — are not scanned here; their
// readers move with the columns in R45's migration, where this widens and both
// allow-lists empty.
//
// THE ALLOW-LISTS ARE EXACTLY THE ENTRIES THAT FIRE. An entry that matches nothing
// is a hole (test/migrationsOneTransaction.test.ts), so each half has its own list
// and a case holding that every entry still fires.
// ---------------------------------------------------------------------------

/** The writer composes `fullText` into the capture row until the migration drops it. */
const RECORD_CAPTURE = 'services/recordCapture.ts';
/** The extractor-equality instrument (evidence A7) reads it until the migration retires it. */
const MEASURE_CUSTODY = 'services/measureCaptureCustody.ts';

const PAYLOAD_ALLOWED: readonly string[] = [RECORD_CAPTURE, MEASURE_CUSTODY];
// `recordCapture.ts` writes a local variable and never dereferences `.fullText`, so it
// does not fire on this half and is not listed.
const MEMBER_ALLOWED: readonly string[] = [MEASURE_CUSTODY];

const KEY = /(?:^|[{,\s])fullText\s*(?::|,|\})/;
const MEMBER = /\.fullText\b/;

/** The substring from the brace at `open` to its matching close, or null when unbalanced. */
function objectAt(code: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return null;
}

/** The object literal that CLOSES at `close`, walking back to its opening brace. */
function objectEndingAt(code: string, close: number): string | null {
  let depth = 0;
  for (let i = close; i >= 0; i -= 1) {
    if (code[i] === '}') depth += 1;
    else if (code[i] === '{') {
      depth -= 1;
      if (depth === 0) return code.slice(i, close + 1);
    }
  }
  return null;
}

/** A module's code by its path under `src/` (`services/x.ts`), or undefined when there is none. */
type ModuleReader = (fileUnderSrc: string) => string | undefined;

/** A constant or a spread NAMED inside a payload — by name, never by position. */
const NAMED_VALUE = /\b(?:select|data|where|orderBy|include)\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}\n])/g;
const SPREAD = /\.\.\.([A-Za-z_$][\w$]*)/g;

/** The module a relative specifier names, as a path under `src/`. */
function resolveSpecifier(file: string, specifier: string): string[] {
  const base = posix.normalize(posix.join(posix.dirname(file), specifier));
  return [`${base}.ts`, `${base}/index.ts`];
}

/**
 * The object literal a NAME refers to from `file`: a same-module `const NAME = {`,
 * else the constant an import binds it to, read from the module its relative
 * specifier resolves to (`import { X as NAME } from './y'` included). Every object it
 * spreads or names in a payload key is followed too; `seen` stops a cycle.
 */
function constantsNamed(name: string, code: string, file: string, read: ModuleReader, seen: Set<string>): string[] {
  const key = `${file}#${name}`;
  if (seen.has(key)) return [];
  seen.add(key);

  const declared = new RegExp(`\\bconst\\s+${name.replace(/\$/g, '\\$')}\\s*(?::[^=]*)?=\\s*\\{`).exec(code);
  if (declared !== null) {
    const object = objectAt(code, declared.index + declared[0].length - 1);
    return object === null ? [] : [object, ...followedFrom(object, code, file, read, seen)];
  }

  for (const imported of code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^']+)'/g)) {
    const [, bindings, specifier] = imported;
    if (bindings === undefined || specifier === undefined) continue;
    for (const binding of bindings.split(',')) {
      const [exported, local] = binding.trim().split(/\s+as\s+/);
      if ((local ?? exported) !== name || exported === undefined) continue;
      for (const target of resolveSpecifier(file, specifier)) {
        const targetCode = read(target);
        if (targetCode !== undefined) return constantsNamed(exported, targetCode, target, read, seen);
      }
    }
  }
  return [];
}

/** The constants an object spreads or names as a payload value, resolved from `file`. */
function followedFrom(object: string, code: string, file: string, read: ModuleReader, seen: Set<string>): string[] {
  const names = [...object.matchAll(SPREAD), ...object.matchAll(NAMED_VALUE)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
  return names.flatMap((name) => constantsNamed(name, code, file, read, seen));
}

/**
 * Every `urlSnapshot` payload in a module's code: call arguments; every constant they
 * spread or pass by name as `select` / `data` / `where` / `orderBy` / `include`, from
 * this module or imported from another; and objects declared `satisfies Prisma.UrlSnapshot…`.
 */
export function urlSnapshotPayloads(code: string, file = '', read: ModuleReader = () => undefined): string[] {
  const payloads: string[] = [];
  for (const call of code.matchAll(/\.urlSnapshot\.\w+\s*\(\s*\{/g)) {
    const args = objectAt(code, call.index + call[0].length - 1);
    if (args === null) continue;
    payloads.push(args, ...followedFrom(args, code, file, read, new Set()));
  }
  for (const typed of code.matchAll(/\}\s*satisfies\s+Prisma\.UrlSnapshot\w*/g)) {
    const object = objectEndingAt(code, typed.index);
    if (object !== null) payloads.push(object);
  }
  return payloads;
}

export const readsFullTextAsKey = (code: string, file = '', read: ModuleReader = () => undefined): boolean =>
  urlSnapshotPayloads(code, file, read).some((p) => KEY.test(p));
export const readsFullTextAsMember = (code: string): boolean => MEMBER.test(code);

const modules = (): { file: string; code: string }[] =>
  tsFiles(SRC).map((file) => ({ file: relative(SRC, file).split('\\').join('/'), code: readCode(file) }));

describe('nothing reads the legacy register (`fullText`) off a capture — R45', () => {
  const all = modules();
  const byFile = new Map(all.map(({ file, code }) => [file, code]));
  const read: ModuleReader = (file) => byFile.get(file);

  it('parsed the modules at all — the vacuity check', () => {
    expect(all.length).toBeGreaterThan(150);
    expect(all.flatMap(({ file, code }) => urlSnapshotPayloads(code, file, read)).length).toBeGreaterThanOrEqual(2);
  });

  it('no module outside the allow-list reads fullText off a capture', () => {
    const offenders = all.filter(({ file, code }) => readsFullTextAsKey(code, file, read) && !PAYLOAD_ALLOWED.includes(file));
    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it('each allow-list entry still fires — an entry that matches nothing is a hole', () => {
    const firing = all.filter(({ file, code }) => readsFullTextAsKey(code, file, read)).map(({ file }) => file);
    expect(PAYLOAD_ALLOWED.filter((entry) => !firing.includes(entry))).toEqual([]);
  });

  it('DETECTS a planted read of each key kind', () => {
    const planted: Record<string, string> = {
      select: 'await prisma.urlSnapshot.findMany({ where: { id }, select: { id: true, fullText: true } });',
      data: 'await tx.urlSnapshot.create({ data: { trackedUrlId, fullText: text } });',
      where: "await prisma.urlSnapshot.findFirst({ where: { fullText: { contains: phrase } } });",
      orderBy: "await client.urlSnapshot.findMany({ orderBy: { fullText: 'asc' } });",
      include: 'await prisma.urlSnapshot.findUnique({ where: { id }, include: { cdxIndexEntry: { select: { fullText: true } } } });',
      shorthand: 'await tx.urlSnapshot.create({ data: { trackedUrlId, fullText, text } });',
      spread: 'const LEGACY_SELECT = { id: true, fullText: true } as const;\nawait prisma.urlSnapshot.findMany({ select: { ...LEGACY_SELECT } });',
      satisfies: 'const S = { fullText: true } satisfies Prisma.UrlSnapshotSelect;',
      byName: 'const S = { fullText: true } as const;\nawait prisma.urlSnapshot.findMany({ select: S });',
    };
    for (const [kind, code] of Object.entries(planted)) {
      expect({ kind, fires: readsFullTextAsKey(code) }).toEqual({ kind, fires: true });
    }
    // An IMPORTED constant, resolved through the importing file's relative specifier.
    const virtual: Record<string, string> = {
      'services/reader.ts':
        "import { LEGACY_SELECT } from '../lib/legacySelect';\nawait prisma.urlSnapshot.findMany({ where: { id }, select: LEGACY_SELECT });",
      'lib/legacySelect.ts': 'export const LEGACY_SELECT = { id: true, fullText: true } as const;',
    };
    const imported = readsFullTextAsKey(virtual['services/reader.ts'] ?? '', 'services/reader.ts', (f) => virtual[f]);
    expect({ kind: 'imported', fires: imported }).toEqual({ kind: 'imported', fires: true });
  });

  it('does not fire on a comment, a string, or another model', () => {
    expect(readsFullTextAsKey(codeOf('// fullText left at R45\nawait prisma.urlSnapshot.findMany({ select: { text: true } });'))).toBe(false);
    expect(readsFullTextAsKey("await prisma.urlSnapshot.findMany({ where: { note: 'fullText: gone' }, select: { text: true } });")).toBe(false);
    expect(readsFullTextAsKey('await prisma.urlSnapshot.findMany({ select: { text: true, fullTextHash: true } });')).toBe(false);
    expect(readsFullTextAsKey('await prisma.evidence.findMany({ select: { fullText: true } });')).toBe(false);
  });

  it('no module outside the member-access allow-list reads .fullText off a row', () => {
    const offenders = all.filter(({ file, code }) => readsFullTextAsMember(code) && !MEMBER_ALLOWED.includes(file));
    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it('the member-access allow-list entry still fires', () => {
    const firing = all.filter(({ code }) => readsFullTextAsMember(code)).map(({ file }) => file);
    expect(MEMBER_ALLOWED.filter((entry) => !firing.includes(entry))).toEqual([]);
  });

  it('DETECTS a planted member access — and a comment and a longer name do not fire', () => {
    expect(readsFullTextAsMember('const t = row.fullText;')).toBe(true);
    expect(readsFullTextAsMember(codeOf('// row.fullText left at R45\nconst x = 1;'))).toBe(false);
    expect(readsFullTextAsMember('const h = row.fullTextHash;')).toBe(false);
  });
});
