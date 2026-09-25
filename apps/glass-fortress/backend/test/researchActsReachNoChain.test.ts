import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// NO RESEARCH ACT REACHES THE CHAIN — THROUGH ANY CHAIN OF IMPORTS. Evidence §5 ("no research act writes to the chain"),
// document flows A7 :1603–:1604, document plan step 33 :257–:258; the R81 sketch's [R1-2].
//
// WHY A SECOND SCAN, AND WHY TRANSITIVE. `test/evidence/scans.test.ts` :590–:618 (KEEP) holds its twelve research-act
// modules against a DIRECT, single-quoted import of `Web3Service` or `anchorSnapshots`. Step 33 puts document reads on
// the research path, and ANCHORED(d) is a chain read (document A3 :1366): a module that imported one that imported the
// anchoring module would pass that scan and still make the chain reachable from a debate. This scan walks every RUNTIME
// import from each subject, breadth first, and fails naming the subject AND the chain of files that reaches a target.
//
// WHAT IS AN EDGE — READ FROM THE TYPESCRIPT AST, never from text (R81 chunk 2, REVIEW's MEDIUM 1: a regex that stripped
// comments swallowed the code between a string holding "/*" and a later "*/", and an import there went unseen). An
// ImportDeclaration (a bare `import '…'` included), an ExportDeclaration with a specifier (a RE-EXPORT, `export *` too —
// the importer can reach what it forwards), an ImportEqualsDeclaration (`import W = require('…')`), and a call of
// `import(…)` or `require(…)` with a literal argument — resolved to a file under `src/`. `import type`, `export type` and
// `import type W = require(…)` are NOT edges (`isTypeOnly`): erased at runtime, they cannot make a call. A comment is not
// a node, so a sentence naming a path is never an import.
//
// FAIL CLOSED ON A LOAD NO STATIC READER CAN NAME (R81 chunk 2 round 2, REVIEW's MEDIUM, Entry 24). An `import(…)` or
// `require(…)` whose argument is not a string literal — a variable, a template with a substitution, a concatenation —
// could load the chain and nothing here can say it does not. Such a file, anywhere in a subject's closure, is an OFFENDER
// in itself, reported by its chain and "a non-literal load"; the edge is never silently dropped.
//
// ITS OWN WALKER, deliberately: the suite's one import scan (`test/documentAnchoringCallers.test.ts` :82–:106) is direct
// only and its helpers are not exported, and `test/helpers/` is off-limits. The walker runs over an abstract file map so
// each decoy is planted in memory and the real tree is never written.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/** The research-act modules of `test/evidence/scans.test.ts` :590–:609, verbatim, and the document modules step 33 adds. */
const SUBJECTS = [
  'services/openDebate.ts',
  'services/respondInDebate.ts',
  'services/promoteFromDebate.ts',
  'services/promotionAssessor.ts',
  'services/debateState.ts',
  'services/debatePassage.ts',
  'services/reviewEvidence.ts',
  'services/evidenceReviews.ts',
  'mcp/tools/reviewEvidence.ts',
  'mcp/tools/listEvidenceReviews.ts',
  'services/evidenceChecks.ts',
  'services/auditTheses.ts',
  // DOCUMENT STEP 33. `debateAudit.ts` joins this list in chunk 4, which creates it — the floor below would fail on a
  // subject that does not exist yet, which is the point of it.
  'services/documentCitation.ts',
  'services/verifyDocumentPhrase.ts',
] as const;

/** A module that reads or writes the registry. Reached from a subject by any chain of imports, the scan fails. */
const TARGET = /(?:^|\/)(?:Web3Service|anchorSnapshots)\.ts$/;

/** A file set the walker reads: path relative to `src/` → its source, or undefined for a file that is not there. */
type Tree = (path: string) => string | undefined;

const onDisk: Tree = (path) => {
  const file = join(SRC, path);
  return existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : undefined;
};

/** A string literal's text — the only specifier form a static reader can resolve. */
const literal = (node: ts.Node | undefined): string | null =>
  node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;

/** What a module loads at runtime: every literal specifier, and whether any load names its target by anything else. */
interface Loads {
  specifiers: string[];
  nonLiteral: boolean;
}

/** Every runtime specifier `code` imports or forwards, read from its syntax tree — and any load it cannot name. */
function loadsOf(code: string): Loads {
  const source = ts.createSourceFile('module.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: (string | null)[] = [];
  let nonLiteral = false;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly !== true) found.push(literal(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly) found.push(literal(node.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) found.push(literal(node.moduleReference.expression));
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const loads = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require');
      if (loads) {
        const target = literal(node.arguments.at(0));
        if (target === null) nonLiteral = true;
        else found.push(target);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { specifiers: found.filter((specifier): specifier is string => specifier !== null), nonLiteral };
}

const specifiersOf = (code: string): string[] => loadsOf(code).specifiers;

/** A relative specifier resolved against its importer to a file of `tree`, or null for a package or a missing file. */
function resolveSpecifier(tree: Tree, from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = normalize(join(dirname(from), specifier));
  for (const candidate of [`${base}.ts`, join(base, 'index.ts'), base]) {
    if (candidate.endsWith('.ts') && tree(candidate) !== undefined) return candidate;
  }
  return null;
}

/** A chain of files from a subject, subject first, ending at a target — or at a file holding a non-literal load. */
interface Reach {
  chain: string[];
  nonLiteral: boolean;
}

/** The first chain from `subject` to a target or to a load no static reader can name — or null when there is none. */
function chainToTarget(tree: Tree, subject: string): Reach | null {
  const parent = new Map<string, string | null>([[subject, null]]);
  const chainTo = (file: string): string[] => {
    const chain: string[] = [];
    for (let at: string | null | undefined = file; at != null; at = parent.get(at)) chain.unshift(at);
    return chain;
  };
  const queue = [subject];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    if (file !== subject && TARGET.test(file)) return { chain: chainTo(file), nonLiteral: false };
    const code = tree(file);
    if (code === undefined) continue;
    const loads = loadsOf(code);
    if (loads.nonLiteral) return { chain: chainTo(file), nonLiteral: true };
    for (const specifier of loads.specifiers) {
      const next = resolveSpecifier(tree, file, specifier);
      if (next !== null && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

/** Every subject that reaches a target, with its chain — the scan's one verdict. */
function offenders(tree: Tree, subjects: readonly string[]): string[] {
  return subjects.flatMap((subject) => {
    const reach = chainToTarget(tree, subject);
    return reach === null ? [] : [`${reach.chain.join(' → ')}${reach.nonLiteral ? ' (a non-literal load)' : ''}`];
  });
}

describe('no research act reaches the chain, through ANY chain of imports (evidence §5; document A7 :1603–:1604)', () => {
  it('finds every subject on disk — the floor: a renamed module cannot pass by vanishing', () => {
    expect(SUBJECTS.filter((subject) => onDisk(subject) === undefined)).toEqual([]);
    expect(SUBJECTS.length).toBeGreaterThanOrEqual(14);
  });

  it('no subject reaches Web3Service or anchorSnapshots', () => {
    expect(offenders(onDisk, SUBJECTS)).toEqual([]);
  });

  it('THE POSITIVE CONTROL — readDocument.ts, which reads the chain, IS reported: the walker sees', () => {
    const reach = chainToTarget(onDisk, 'services/readDocument.ts');
    expect(reach?.chain.at(0)).toBe('services/readDocument.ts');
    expect([reach?.chain.at(-1), reach?.nonLiteral]).toEqual([expect.stringMatching(TARGET), false]);
  });

  it('THE SECOND CONTROL — documentStanding.ts, V’s `verified`, reaches the chain, and no subject imports it', () => {
    expect(chainToTarget(onDisk, 'services/documentStanding.ts')?.chain.at(-1)).toMatch(TARGET);
    const all = listSources(SRC);
    const importers = all.filter((path) =>
      specifiersOf(onDisk(path) ?? '').some((s) => resolveSpecifier(onDisk, path, s) === 'services/documentStanding.ts'),
    );
    expect(importers).toEqual(['mcp/tools/getThesisContext.ts']);
  });
});

/** Every `.ts` under `root`, as a path relative to `src/`. */
function listSources(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const full = join(root, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return name.endsWith('.ts') ? [relative(SRC, full)] : [];
  });
}

describe('THE DECOYS — each spelling planted in memory, and the scan names it', () => {
  const SUBJECT = 'services/openDebate.ts';
  /** A tree of three files: the subject's decoy source, an intermediary, and the targets. */
  const planted =
    (files: Readonly<Record<string, string>>): Tree =>
    (path) =>
      files[path] ?? (TARGET.test(path) ? 'export const x = 1;' : undefined);

  const spellings: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
    ['an ALIAS', { [SUBJECT]: "import { Web3Service as W } from './Web3Service';" }],
    ['a NAMESPACE', { [SUBJECT]: "import * as anchoring from './anchorSnapshots';" }],
    ['a DOUBLE-QUOTED path', { [SUBJECT]: 'import { anchorSnapshots } from "./anchorSnapshots";' }],
    ['a BACKTICK path', { [SUBJECT]: 'const m = require(`./Web3Service`);' }],
    [
      'a RE-EXPORT through an intermediary',
      { [SUBJECT]: "import { x } from './forwarder';", 'services/forwarder.ts': "export { x } from './anchorSnapshots';" },
    ],
    [
      'ONE HOP — the subject imports a module that imports the chain',
      { [SUBJECT]: "import { y } from './hop';", 'services/hop.ts': "import { x } from './Web3Service';\nexport const y = x;" },
    ],
    ['a DYNAMIC import', { [SUBJECT]: "export const later = () => import('./anchorSnapshots');" }],
    ['a MULTI-LINE named import', { [SUBJECT]: "import {\n  a,\n  b,\n} from './anchorSnapshots';" }],
    ['an import from ANOTHER directory', { [SUBJECT]: "import { W } from '../services/Web3Service';" }],
    // R81 chunk 2, REVIEW's S4, S1, S2 (Entry 22): a regex strip swallowed code between a string holding "/*" and a
    // later "*/"; `export *` and `import = require()` are spellings the AST names and a pattern must be taught.
    [
      'a DYNAMIC import after a string holding "/*" and before a doc comment',
      {
        [SUBJECT]:
          "const g = 'src/*';\nexport const later = () => import('./anchorSnapshots');\n/** a doc comment, closing */\nexport const z = g;",
      },
    ],
    ['an `export *` re-export', { [SUBJECT]: "export * from './anchorSnapshots';" }],
    ['an `import = require()`', { [SUBJECT]: "import W = require('./Web3Service');\nexport const w = W;" }],
  ];

  for (const [spelling, files] of spellings) {
    it(`${spelling} is REPORTED`, () => {
      expect(offenders(planted(files), [SUBJECT])).toEqual([expect.stringMatching(/(?:Web3Service|anchorSnapshots)\.ts$/)]);
    });
  }

  it('`import type`, `export type` and `import type … = require()` are NOT edges — erased at runtime, they cannot make a call', () => {
    const files = {
      [SUBJECT]:
        "import type { W } from './Web3Service';\nexport type { R } from './anchorSnapshots';\nimport type V = require('./Web3Service');",
    };
    expect(offenders(planted(files), [SUBJECT])).toEqual([]);
  });

  // FAIL CLOSED (R81 chunk 2 round 2, REVIEW's MEDIUM, Entry 24): a load whose target no static reader can name is an
  // offender in itself — the scan cannot say it is not the chain, so it says so rather than dropping the edge.
  it('a NON-LITERAL import() of a variable holding the chain’s path is REPORTED, naming the file and "a non-literal load"', () => {
    const files = { [SUBJECT]: "const CHAIN_MODULE = './anchorSnapshots';\nexport const later = () => import(CHAIN_MODULE);" };
    expect(offenders(planted(files), [SUBJECT])).toEqual([`${SUBJECT} (a non-literal load)`]);
  });

  it('a TEMPLATE with a substitution is REPORTED as a non-literal load', () => {
    const files = { [SUBJECT]: 'export const load = (name: string) => import(`./${name}`);' };
    expect(offenders(planted(files), [SUBJECT])).toEqual([`${SUBJECT} (a non-literal load)`]);
  });

  it('a CONCATENATED path is REPORTED as a non-literal load', () => {
    const files = { [SUBJECT]: "export const m = require('./anchor' + 'Snapshots');" };
    expect(offenders(planted(files), [SUBJECT])).toEqual([`${SUBJECT} (a non-literal load)`]);
  });

  it('a non-literal load ONE HOP away is REPORTED at the file that holds it', () => {
    const files = {
      [SUBJECT]: "import { hop } from './hop';\nexport const h = hop;",
      'services/hop.ts': "export const hop = (m: string) => require(m);",
    };
    expect(offenders(planted(files), [SUBJECT])).toEqual([`${SUBJECT} → services/hop.ts (a non-literal load)`]);
  });

  it('THE CONTROL — a LITERAL import() of a module off the chain stays clean', () => {
    const files = { [SUBJECT]: "export const later = () => import('./debatePassage');", 'services/debatePassage.ts': 'export const p = 1;' };
    expect(offenders(planted(files), [SUBJECT])).toEqual([]);
  });

  it('a COMMENT naming the path is not an import', () => {
    const files = { [SUBJECT]: "// the anchoring module lives at import { x } from './anchorSnapshots';\nexport const z = 1;" };
    expect(offenders(planted(files), [SUBJECT])).toEqual([]);
  });
});
