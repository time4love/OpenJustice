import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from './detectionVersionPinned.test';
import { SRC, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// THE CALLER-COUNT SCANS, AS COUNTS — docs/gf-document-refactor-plan.md §4 :408, §6 :468–:469.
//
// "The registry's `submit` has one caller, the anchoring module; the module has exactly two, the walk's anchoring on
// ACQUIRED and one document-anchoring function; that function has exactly three callers — the intake receipt,
// `add_document`, the standing pass — each named." The first clause is `test/evidence/scans.test.ts` :370 (KEEP) and
// `test/anchorSnapshots.test.ts`' "calls it once"; this file holds the other two as COUNTS, per FILE, where a planted
// third caller of the module or an unnamed caller of the function goes RED BY NAME.
//
// THE CONTRACT'S OWN DECOY CASE (`test/document/scans.test.ts` :54) asserts only that `addDocument.ts` spells no
// `submit`, so it cannot catch a third caller; its title was conformed to what it asserts, and the count is here.
//
// SCOPE: `src/` and `scripts/` — the standing pass is an operational script, and a caller there is a caller.
// ---------------------------------------------------------------------------

const BACKEND = join(SRC, '..');
const SCRIPTS = join(BACKEND, 'scripts');

/** A CALL, never the definition and never a member access: `x.anchorDocument(` is not this module's function. */
const callOf = (name: string): RegExp => new RegExp(`(?<![\\w.]|function\\s)${name}\\s*\\(`, 'g');

/** Calls of `name` per file, relative to the backend, comments stripped; files with none are omitted. */
function callersIn(files: readonly string[], read: (file: string) => string, name: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    const calls = [...stripComments(read(file)).matchAll(callOf(name))].length;
    if (calls > 0) counts[file.slice(BACKEND.length + 1)] = calls;
  }
  return counts;
}

const scope = (): string[] => [...tsFiles(SRC), ...tsFiles(SCRIPTS)];
const fromDisk = (file: string): string => readFileSync(file, 'utf8');
const onDisk = (name: string): Record<string, number> => callersIn(scope(), fromDisk, name);

/** A planted tree for a decoy: backend-relative path → source. Returns `callersIn`'s first two arguments. */
function planted(tree: Readonly<Record<string, string>>): [string[], (file: string) => string] {
  return [Object.keys(tree).map((f) => join(BACKEND, f)), (file) => tree[file.slice(BACKEND.length + 1)] ?? ''];
}

describe('plan §4 :408 — the anchoring module has EXACTLY TWO callers, each named', () => {
  it('scans src/ and scripts/ at all — a silent zero would make every count below vacuous', () => {
    expect(tsFiles(SRC).length).toBeGreaterThan(0);
    expect(tsFiles(SCRIPTS).length).toBeGreaterThan(0);
  });

  it('the walk’s anchoring on ACQUIRED is called from the store alone, at its two sites', () => {
    expect(onDisk('anchorAcquiredCapture')).toEqual({ 'src/services/recordCapture.ts': 2 });
  });

  it('the document entry of the module is called from the ONE document-anchoring function, once', () => {
    expect(onDisk('anchorDocumentCommitment')).toEqual({ 'src/services/anchorDocuments.ts': 1 });
  });

  it('DETECTS a planted third caller of the module — the definition and a comment are not calls', () => {
    const found = callersIn(...planted({
      'src/services/anchorSnapshots.ts': 'export async function anchorDocumentCommitment(window, c) {}',
      'src/services/anchorDocuments.ts': '// anchorDocumentCommitment( in prose\nawait anchorDocumentCommitment(window, c);',
      'src/services/readDocument.ts': 'await anchorDocumentCommitment(window, commitment);',
    }), 'anchorDocumentCommitment');
    expect(found).toEqual({ 'src/services/anchorDocuments.ts': 1, 'src/services/readDocument.ts': 1 });
  });
});

// ---------------------------------------------------------------------------
// THE IMPORTERS — a CALL count cannot see a call it cannot spell (REVIEW, chunk 2 round 1, two MEDIUM decoys BLIND):
// `import { anchorDocumentCommitment as pay }` → `pay(…)`, and `import * as anchoring` → `anchoring.x(…)`. What every
// such call has in common is an IMPORT of the anchoring module, and an import has only four spellings. So the module is
// reached ONLY by named imports, and each entry that writes is imported by exactly the file plan §4 :408 names.
// ---------------------------------------------------------------------------

/**
 * The module's PATH in any of the three quotes TypeScript accepts — ', " or a backtick (a dynamic `import()`). The
 * backend's eslint has no `quotes` rule, so all three are legal; the first version matched single quotes only and a
 * double-quoted import was invisible (REVIEW's P5, P6). NON-CAPTURING, so NAMED_IMPORT's group 1 is still the names.
 */
const MODULE = String.raw`(?:'[^']*/anchorSnapshots'|"[^"]*/anchorSnapshots"|` + '`[^`]*/anchorSnapshots`)';
const NAMED_IMPORT = new RegExp(String.raw`(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*${MODULE}`, 'g');
/** Namespace, default, `export *`, dynamic `import()` and `require()` — every spelling that is not a list of names. */
const UNNAMED_IMPORT = new RegExp(
  String.raw`import\s+(?:\*\s+as\s+\w+|\w+)\s+from\s*${MODULE}|export\s+\*\s+(?:as\s+\w+\s+)?from\s*${MODULE}|(?:import|require)\s*\(\s*${MODULE}\s*\)`,
);

/** The ORIGINAL names a source imports from the anchoring module — `x as y` counts as `x`; `type` imports are not. */
function namesImported(source: string): string[] {
  return [...stripComments(source).matchAll(NAMED_IMPORT)].flatMap((m) =>
    (m[1] ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '' && !part.startsWith('type '))
      .map((part) => part.split(/\s+as\s+/).at(0) ?? part),
  );
}

function importersOf(files: readonly string[], read: (file: string) => string, name: string): string[] {
  return files.filter((file) => namesImported(read(file)).includes(name)).map((file) => file.slice(BACKEND.length + 1)).sort();
}

function unnamedImporters(files: readonly string[], read: (file: string) => string): string[] {
  return files.filter((file) => UNNAMED_IMPORT.test(stripComments(read(file)))).map((file) => file.slice(BACKEND.length + 1)).sort();
}

const REVIEW_DECOYS = {
  alias: "import { anchorDocumentCommitment as pay } from './anchorSnapshots';\nexport const x = (w, c) => pay(w, c);",
  namespace: "import * as anchoring from '../services/anchorSnapshots';\nexport const y = (w, c) => anchoring.anchorDocumentCommitment(w, c);",
  required: "const anchoring = require('./anchorSnapshots');\nanchoring.anchorDocumentCommitment(w, c);",
  window: "import { openRegistryWindow as open } from './anchorSnapshots';\nexport const w = open(() => new Web3Service(), () => true);",
  // REVIEW's P5 and P6 (chunk 2 round 2): the backend's eslint has no `quotes` rule, so a DOUBLE-quoted path is legal
  // and was invisible to a pattern that matched single quotes only. A backtick is the dynamic import's third spelling.
  aliasDoubleQuoted: 'import { anchorDocumentCommitment as pay } from "./anchorSnapshots";\nexport const x = (w, c) => pay(w, c);',
  namespaceDoubleQuoted: 'import * as anchoring from "./anchorSnapshots";\nexport const y = (w, c) => anchoring.anchorDocumentCommitment(w, c);',
  dynamicBacktick: 'const anchoring = await import(`./anchorSnapshots`);\nawait anchoring.anchorDocumentCommitment(w, c);',
};

describe('plan §4 :408, §6 :468–:469 — the anchoring module is reached only by NAMED imports, each write entry by its named file', () => {
  it('the FLOOR: the scan finds the module’s known importers — an unmatched pattern would report none', () => {
    const importers = [...tsFiles(SRC), ...tsFiles(SCRIPTS)].filter((f) => namesImported(fromDisk(f)).length > 0);
    expect(importers.length).toBeGreaterThanOrEqual(3);
  });

  it('NO module imports it by namespace, default, `export *`, `import()` or `require()`', () => {
    expect(unnamedImporters(scope(), fromDisk)).toEqual([]);
  });

  it('anchorDocumentCommitment is imported by exactly the document-anchoring function', () => {
    expect(importersOf(scope(), fromDisk, 'anchorDocumentCommitment')).toEqual(['src/services/anchorDocuments.ts']);
  });

  it('anchorAcquiredCapture is imported by exactly the store', () => {
    expect(importersOf(scope(), fromDisk, 'anchorAcquiredCapture')).toEqual(['src/services/recordCapture.ts']);
  });

  it('openRegistryWindow is imported by NO module — the only windows are the ones the module builds from the environment', () => {
    expect(importersOf(scope(), fromDisk, 'openRegistryWindow')).toEqual([]);
  });

  it('WHY THIS SCAN EXISTS: the call count alone is BLIND to an alias and a namespace', () => {
    const [files, read] = planted({ 'src/services/a.ts': REVIEW_DECOYS.alias, 'src/services/n.ts': REVIEW_DECOYS.namespace });
    expect(callersIn(files, read, 'anchorDocumentCommitment')).toEqual({});
  });

  it('DETECTS an ALIASED import — REVIEW’s decoy', () => {
    expect(importersOf(...planted({ 'src/services/a.ts': REVIEW_DECOYS.alias }), 'anchorDocumentCommitment')).toEqual(['src/services/a.ts']);
  });

  it('DETECTS a NAMESPACE import and a require() — REVIEW’s decoy, and its sibling', () => {
    expect(unnamedImporters(...planted({ 'src/services/n.ts': REVIEW_DECOYS.namespace, 'src/services/r.ts': REVIEW_DECOYS.required }))).toEqual([
      'src/services/n.ts',
      'src/services/r.ts',
    ]);
  });

  it('DETECTS a second window builder importing openRegistryWindow under another name', () => {
    expect(importersOf(...planted({ 'src/services/w.ts': REVIEW_DECOYS.window }), 'openRegistryWindow')).toEqual(['src/services/w.ts']);
  });

  it('DETECTS a DOUBLE-QUOTED aliased import — REVIEW’s P5', () => {
    expect(importersOf(...planted({ 'src/services/a.ts': REVIEW_DECOYS.aliasDoubleQuoted }), 'anchorDocumentCommitment')).toEqual(['src/services/a.ts']);
  });

  it('DETECTS a DOUBLE-QUOTED namespace import — REVIEW’s P6 — and a BACKTICKED dynamic import()', () => {
    expect(unnamedImporters(...planted({ 'src/services/n.ts': REVIEW_DECOYS.namespaceDoubleQuoted, 'src/services/d.ts': REVIEW_DECOYS.dynamicBacktick }))).toEqual([
      'src/services/d.ts',
      'src/services/n.ts',
    ]);
  });

  it('a `type` import is not an import of the function, and a comment is not an import', () => {
    const source = "import { type RegistryWindow } from './anchorSnapshots';\n// import * as anchoring from './anchorSnapshots';";
    expect([namesImported(source), unnamedImporters(...planted({ 'src/t.ts': source }))]).toEqual([[], []]);
  });
});

describe('plan §4 :408 — the document-anchoring function’s callers are NAMED', () => {
  // THIS ROUND'S SET IS TWO — `add_document` and the standing pass; the intake receipt is step 32's (contract
  // `test/document/scans.test.ts` :47). The pass's loop is `documentAnchorPass.ts`, the service its script prints; the
  // script itself calls the service, never the function.
  const NAMED: Readonly<Record<string, number>> = {
    'src/services/addDocument.ts': 1,
    'src/services/documentAnchorPass.ts': 1,
  };

  it('the FLOOR: EXACTLY the named callers call it — each of them, once', () => {
    expect(onDisk('anchorDocument')).toEqual(NAMED);
  });

  it('and exactly the named files IMPORT it — an alias cannot hide a third', () => {
    const importers = scope()
      .filter((file) => /import\s*\{[^}]*\banchorDocument\b[^}]*\}\s*from\s*(?:'[^']*\/anchorDocuments'|"[^"]*\/anchorDocuments")/.test(stripComments(fromDisk(file))))
      .map((file) => file.slice(BACKEND.length + 1))
      .sort();
    expect(importers).toEqual(Object.keys(NAMED).sort());
  });

  it('every caller of anchorDocument is a named one, calling it once', () => {
    for (const [file, calls] of Object.entries(onDisk('anchorDocument'))) {
      expect([file, calls]).toEqual([file, NAMED[file]]);
    }
  });

  it('DETECTS an unnamed caller — proven against a decoy', () => {
    const found = callersIn(...planted({ 'src/services/readDocument.ts': 'const a = await anchorDocument(window, commitment);' }), 'anchorDocument');
    expect(Object.entries(found).filter(([file]) => NAMED[file] === undefined)).toEqual([['src/services/readDocument.ts', 1]]);
  });

  it('does not count anchorDocumentCommitment as anchorDocument — the two names share a prefix', () => {
    expect(callersIn(...planted({ 'src/x.ts': 'await anchorDocumentCommitment(window, c);' }), 'anchorDocument')).toEqual({});
  });
});
