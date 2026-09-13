import { posix, relative } from 'node:path';
import { SRC, codeOf, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// NOTHING READS THE LEGACY REGISTER — R45, THE REGISTER CORRECTION, WIDENED AT R45-B.
//
// `UrlSnapshot` carried two registers. The CURRENT one — `text`, `textHash`,
// `textExtractionVersion` — is what every diff and trajectory is derived from
// (docs/gf-interaction-flows.md A2; docs/gf-evidence-flows.md A3 CURRENT(capture)), and
// evidence identity is `documentHash` (evidence A1). The LEGACY one — `fullText`,
// Readability's article, its `contentHash`, and the stored viewer `snapshotUrl` — was
// read by trajectories and `verify_claim_text` until R45-A, and the step-19 staging walk
// found the cost: a trajectory asserted the FDA sentence absent at 20220805053301 while
// the page and the current `text` both held it (docs/gf-thesis-step-19-2026-09-12.md §3).
// R45-B's migration dropped the three columns and the old path's `comparedToSnapshotId`
// on `CdxIndexEntry`. This holds that no module names them again.
//
// TWO HALVES, AND NEITHER IMPLIES THE OTHER:
//
//   PAYLOAD      a legacy column named as a KEY inside a call's arguments on its model's
//                delegate — select, data, where, orderBy, include, at any depth — or
//                inside a constant such a call spreads or passes by name as one of those
//                keys, declared in the same module or imported from another through a
//                relative specifier (followed through the constants IT spreads or names),
//                or inside an object declared `satisfies Prisma.<Model>…`.
//   MEMBER       the member access `.fullText` anywhere in a module's code.
//
// The member half is `.fullText` ALONE, deliberately. `contentHash` is a live column of
// `ThesisVersion`, and `snapshotUrl` a computed field of the archive and trajectory
// reads, so a name-wide member scan for either would fire on correct code. A member
// read of either off a CAPTURE row is held elsewhere: the generated client no longer
// types the column, so `tsc` refuses a typed row's `.contentHash` / `.snapshotUrl`; and
// `retired-names` (test/walk/retiredNames.test.ts) holds, field by field, that the
// schema does not carry them again.
//
// Nested reads inside an `include` are reported whatever relation they follow — the
// conservative reading: no other model carries these names on those delegates' payloads.
//
// WHAT NEITHER HALF SEES, stated so nobody trusts it further: a select built by a
// function; raw SQL.
//
// THE ALLOW-LISTS ARE EMPTY. The writer stopped composing the register in the commit
// that dropped it, and the custody instrument that read it retired whole.
// ---------------------------------------------------------------------------

/** Each model's legacy columns, keyed by the delegate that names the model in a call. */
const LEGACY: readonly { delegate: string; model: string; columns: readonly string[] }[] = [
  { delegate: 'urlSnapshot', model: 'UrlSnapshot', columns: ['fullText', 'contentHash', 'snapshotUrl'] },
  { delegate: 'cdxIndexEntry', model: 'CdxIndexEntry', columns: ['comparedToSnapshotId'] },
];

const PAYLOAD_ALLOWED: readonly string[] = [];
const MEMBER_ALLOWED: readonly string[] = [];

const keyOf = (column: string): RegExp => new RegExp(`(?:^|[{,\\s])${column}\\s*(?::|,|\\})`);
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
 * Every payload of one model in a module's code: call arguments on its delegate; every
 * constant they spread or pass by name as `select` / `data` / `where` / `orderBy` /
 * `include`, from this module or imported from another; and objects declared
 * `satisfies Prisma.<Model>…`.
 */
export function payloadsOf(
  delegate: string,
  model: string,
  code: string,
  file = '',
  read: ModuleReader = () => undefined,
): string[] {
  const payloads: string[] = [];
  for (const call of code.matchAll(new RegExp(`\\.${delegate}\\.\\w+\\s*\\(\\s*\\{`, 'g'))) {
    const args = objectAt(code, call.index + call[0].length - 1);
    if (args === null) continue;
    payloads.push(args, ...followedFrom(args, code, file, read, new Set()));
  }
  for (const typed of code.matchAll(new RegExp(`\\}\\s*satisfies\\s+Prisma\\.${model}\\w*`, 'g'))) {
    const object = objectEndingAt(code, typed.index);
    if (object !== null) payloads.push(object);
  }
  return payloads;
}

/** Every legacy column a module names as a payload key, as `Model.column`. */
export const legacyKeysIn = (code: string, file = '', read: ModuleReader = () => undefined): string[] =>
  LEGACY.flatMap(({ delegate, model, columns }) => {
    const payloads = payloadsOf(delegate, model, code, file, read);
    return columns.filter((column) => payloads.some((p) => keyOf(column).test(p))).map((column) => `${model}.${column}`);
  });
export const readsFullTextAsMember = (code: string): boolean => MEMBER.test(code);

const modules = (): { file: string; code: string }[] =>
  tsFiles(SRC).map((file) => ({ file: relative(SRC, file).split('\\').join('/'), code: readCode(file) }));

describe('nothing reads the legacy register off a capture or an index entry — R45', () => {
  const all = modules();
  const byFile = new Map(all.map(({ file, code }) => [file, code]));
  const read: ModuleReader = (file) => byFile.get(file);

  it('parsed the modules at all — the vacuity check', () => {
    expect(all.length).toBeGreaterThan(150);
    for (const { delegate, model } of LEGACY) {
      const found = all.flatMap(({ file, code }) => payloadsOf(delegate, model, code, file, read)).length;
      expect({ delegate, atLeastTwo: found >= 2 }).toEqual({ delegate, atLeastTwo: true });
    }
  });

  it('no module outside the allow-list reads a legacy column', () => {
    const offenders = all
      .map(({ file, code }) => ({ file, keys: legacyKeysIn(code, file, read) }))
      .filter(({ file, keys }) => keys.length > 0 && !PAYLOAD_ALLOWED.includes(file));
    expect(offenders).toEqual([]);
  });

  it('the allow-list is empty', () => {
    expect(PAYLOAD_ALLOWED).toEqual([]);
  });

  // One decoy per key shape for `fullText`, and one per column for the rest.
  const planted: readonly (readonly [string, string, string])[] = [
    ['UrlSnapshot.fullText', 'select', 'await prisma.urlSnapshot.findMany({ where: { id }, select: { id: true, fullText: true } });'],
    ['UrlSnapshot.fullText', 'data', 'await tx.urlSnapshot.create({ data: { trackedUrlId, fullText: text } });'],
    ['UrlSnapshot.fullText', 'where', "await prisma.urlSnapshot.findFirst({ where: { fullText: { contains: phrase } } });"],
    ['UrlSnapshot.fullText', 'orderBy', "await client.urlSnapshot.findMany({ orderBy: { fullText: 'asc' } });"],
    ['UrlSnapshot.fullText', 'include', 'await prisma.urlSnapshot.findUnique({ where: { id }, include: { cdxIndexEntry: { select: { fullText: true } } } });'],
    ['UrlSnapshot.fullText', 'shorthand', 'await tx.urlSnapshot.create({ data: { trackedUrlId, fullText, text } });'],
    ['UrlSnapshot.fullText', 'spread', 'const LEGACY_SELECT = { id: true, fullText: true } as const;\nawait prisma.urlSnapshot.findMany({ select: { ...LEGACY_SELECT } });'],
    ['UrlSnapshot.fullText', 'satisfies', 'const S = { fullText: true } satisfies Prisma.UrlSnapshotSelect;'],
    ['UrlSnapshot.fullText', 'byName', 'const S = { fullText: true } as const;\nawait prisma.urlSnapshot.findMany({ select: S });'],
    ['UrlSnapshot.contentHash', 'select', 'await prisma.urlSnapshot.findMany({ where: { id }, select: { id: true, contentHash: true } });'],
    ['UrlSnapshot.contentHash', 'satisfies', 'const S = { contentHash: true, documentHash: true } satisfies Prisma.UrlSnapshotSelect;'],
    ['UrlSnapshot.snapshotUrl', 'data', 'await tx.urlSnapshot.create({ data: { trackedUrlId, snapshotUrl: viewer } });'],
    ['CdxIndexEntry.comparedToSnapshotId', 'data', 'await prisma.cdxIndexEntry.updateMany({ where, data: { status, comparedToSnapshotId: id } });'],
    ['CdxIndexEntry.comparedToSnapshotId', 'where', 'await tx.cdxIndexEntry.findMany({ where: { comparedToSnapshotId: { not: null } } });'],
  ];
  for (const [column, shape, code] of planted) {
    it(`DETECTS a planted read of ${column} (${shape})`, () => {
      expect(legacyKeysIn(code)).toContain(column);
    });
  }

  it('DETECTS a legacy column in an IMPORTED constant, resolved through the relative specifier', () => {
    const virtual: Record<string, string> = {
      'services/reader.ts':
        "import { LEGACY_SELECT } from '../lib/legacySelect';\nawait prisma.urlSnapshot.findMany({ where: { id }, select: LEGACY_SELECT });",
      'lib/legacySelect.ts': 'export const LEGACY_SELECT = { id: true, contentHash: true } as const;',
    };
    expect(legacyKeysIn(virtual['services/reader.ts'] ?? '', 'services/reader.ts', (f) => virtual[f])).toEqual([
      'UrlSnapshot.contentHash',
    ]);
  });

  it('does not fire on a comment, a string, a longer name, another model, or the live successor columns', () => {
    expect(legacyKeysIn(codeOf('// fullText left at R45\nawait prisma.urlSnapshot.findMany({ select: { text: true } });'))).toEqual([]);
    expect(legacyKeysIn("await prisma.urlSnapshot.findMany({ where: { note: 'fullText: gone' }, select: { text: true } });")).toEqual([]);
    expect(legacyKeysIn('await prisma.urlSnapshot.findMany({ select: { text: true, fullTextHash: true } });')).toEqual([]);
    expect(legacyKeysIn('await prisma.evidence.findMany({ select: { fullText: true } });')).toEqual([]);
    // `ThesisVersion.contentHash` is a live column; `CdxIndexEntry.comparedTo` is the walk's successor.
    expect(legacyKeysIn('await tx.thesisVersion.create({ data: { thesisId, text, contentHash } });')).toEqual([]);
    expect(legacyKeysIn('await tx.cdxIndexEntry.update({ where: { id }, data: { comparedTo: previous } });')).toEqual([]);
    // A column is legacy on ITS model's delegate only: a capture payload naming the index entry's column is not scanned.
    expect(legacyKeysIn('await prisma.urlSnapshot.findMany({ where: { comparedToSnapshotId: id } });')).toEqual([]);
  });

  it('no module outside the member-access allow-list reads .fullText off a row', () => {
    const offenders = all.filter(({ file, code }) => readsFullTextAsMember(code) && !MEMBER_ALLOWED.includes(file));
    expect(offenders.map(({ file }) => file)).toEqual([]);
  });

  it('the member-access allow-list is empty', () => {
    expect(MEMBER_ALLOWED).toEqual([]);
  });

  it('DETECTS a planted member access — and a comment and a longer name do not fire', () => {
    expect(readsFullTextAsMember('const t = row.fullText;')).toBe(true);
    expect(readsFullTextAsMember(codeOf('// row.fullText left at R45\nconst x = 1;'))).toBe(false);
    expect(readsFullTextAsMember('const h = row.fullTextHash;')).toBe(false);
  });
});
