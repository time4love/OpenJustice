import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// SOURCE-SCAN HELPERS FOR THE FRONTEND'S INSTRUMENTS (docs/gf-ui-refactor-plan.md
// UI-1; design docs/gf-ui-flows.md A5).
//
// A source scan is a test, not a review note (refactor plan §4): it holds a rule
// over every file, including the one added tomorrow. Two disciplines, inherited
// from the backend's test/walk/scan.ts and sharpened here:
//
// - IT READS NODES, NEVER TEXT. A literal is a node, an import is a node, and a
//   comment is never either — so no scan here excludes comments by finding them.
//   A walk that looked for comments missed `{/* … */}` inside JSX, whose trivia
//   belongs to the closing brace token (R51's first measurement).
// - IT TAKES ITS SUBJECTS AS A VALUE AND FAILS ON AN EMPTY SET. A scan that
//   examined nothing is not a pass; `requireSubjects` is the one guard.
//
// ONE HELPER PER KIND: every later source scan reads this module rather than
// growing its own reader (plan §4).
// ---------------------------------------------------------------------------

/** The frontend workspace, `apps/glass-fortress/frontend`. Every scan's paths are relative to it. */
export const FRONTEND = join(__dirname, '..');
/** `src/` — the subject of every source scan. */
export const SRC = join(FRONTEND, 'src');
/** `messages/` — one catalog per locale, `<locale>.json`. */
export const MESSAGES = join(FRONTEND, 'messages');

/**
 * The vacuity guard. Called by every scan before it reads a subject: by both UI-1 instruments
 * (`name-never-glass-fortress`, `messages-parity`), by `test/render.tsx`' `textNodes`, and by every
 * instrument after them (plan §5).
 */
export function requireSubjects<T>(what: string, subjects: readonly T[]): readonly T[] {
  if (subjects.length === 0) {
    throw new Error(`${what}: an empty subject set — a scan that examined nothing is not a pass`);
  }
  return subjects;
}

/**
 * Every file under `dir` with one of `extensions`, recursively, absolute and sorted.
 * Callers: `name-never-glass-fortress` (UI-1), the harness' H-9 and H-10; `nav-is-the-map` (UI-4),
 * `filter-is-a-query` (UI-7), `no-write-from-research` (UI-8), `mcp-url-from-deployment` (UI-9),
 * `retired-names` (UI-10).
 */
export function sourceFiles(dir: string, extensions: readonly ('.ts' | '.tsx')[]): string[] {
  const walk = (at: string): string[] =>
    readdirSync(at).flatMap((entry) => {
      const full = join(at, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return extensions.some((extension) => entry.endsWith(extension)) ? [full] : [];
    });
  return [...requireSubjects(`source files under ${relative(FRONTEND, dir) || '.'}`, existsSync(dir) ? walk(dir) : [])].sort();
}

function parse(file: string): ts.SourceFile {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
}

export interface SourceString {
  text: string;
  line: number;
  kind: 'string' | 'template' | 'jsx-text';
}

/**
 * Every string a file's code carries: string literals (JSX attribute strings among them), template
 * text, JSX text. Comments are not nodes, so they are never read.
 * Callers: `name-never-glass-fortress` (UI-1); `mcp-url-from-deployment` (UI-9); `retired-names` (UI-10).
 */
export function stringsIn(file: string): SourceString[] {
  const source = parse(file);
  const found: SourceString[] = [];
  const at = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      found.push({ text: node.text, line: at(node), kind: ts.isStringLiteral(node) ? 'string' : 'template' });
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push({ text: node.text, line: at(node), kind: 'template' });
    } else if (ts.isJsxText(node)) {
      found.push({ text: node.text, line: at(node), kind: 'jsx-text' });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export interface Catalog {
  /** The file's basename — `he`, `en`. The locale list itself is `src/i18n/routing.ts`', never spelled here. */
  locale: string;
  /** The file, relative to the frontend: `messages/he.json`. */
  file: string;
  /** The parsed catalog, whole. */
  messages: Record<string, unknown>;
  /** Every leaf: a value that is not a plain object, at its path of keys. */
  leaves: { path: readonly string[]; value: unknown }[];
}

function leavesOf(value: unknown, path: readonly string[]): Catalog['leaves'] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => leavesOf(child, [...path, key]));
  }
  return [{ path, value }];
}

/**
 * Every catalog under `messages/`, read from disk on every call — so a decoy planted on disk is what a scan sees.
 * Callers: `name-never-glass-fortress`, `messages-parity` (UI-1); `test/render.tsx`' `messagesFor`;
 * `retired-names` (UI-10).
 */
export function messageCatalogs(): Catalog[] {
  const files = readdirSync(MESSAGES).filter((entry) => entry.endsWith('.json')).sort();
  return [...requireSubjects('message catalogs under messages/', files)].map((entry) => {
    const file = join(MESSAGES, entry);
    const messages = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    return { locale: entry.replace(/\.json$/, ''), file: relative(FRONTEND, file), messages, leaves: leavesOf(messages, []) };
  });
}

export interface Import {
  specifier: string;
  /** The file it resolves to, relative to the frontend (`src/lib/x.ts`) — `null` only for a package. */
  module: string | null;
}

const RESOLUTIONS = ['', '.ts', '.tsx', '.js', '.json', '/index.ts', '/index.tsx'];

function isLocal(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('@/');
}

/**
 * Every module a file imports, RESOLVED — never a regex over the specifier (the walk's rule,
 * backend `test/walk/retiredNames.test.ts` :26–:36). Reads every import declaration including the
 * side-effect form (`import '@/lib/stagingApiAuth'`, which a `from '…'` regex misses), `import type`,
 * re-exports, and `import()` / `require()` with a literal argument. A local specifier — relative, `@/`, or an
 * absolute path, taken as that path — that resolves to no file THROWS; `module` is `null` only for a package.
 * Callers: the harness' H-6, H-9, H-10 (UI-1); `nav-is-the-map` (UI-4); `no-model-voice-public` (UI-5);
 * `one-stream-two-doors` (UI-8); `retired-names` (UI-10).
 */
export function importsOf(file: string): Import[] {
  const source = parse(file);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node)) {
      const argument = node.arguments.at(0);
      const callee = node.expression;
      const isLoader = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require');
      if (isLoader && argument !== undefined && ts.isStringLiteralLike(argument)) specifiers.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers.map((specifier) => {
    if (!isLocal(specifier)) return { specifier, module: null };
    const base = specifier.startsWith('@/')
      ? join(SRC, specifier.slice(2))
      : isAbsolute(specifier)
        ? specifier
        : join(dirname(file), specifier);
    const hit = RESOLUTIONS.map((suffix) => base + suffix).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (hit === undefined) {
      throw new Error(
        `importsOf: ${relative(FRONTEND, file)} imports '${specifier}', which resolves to no file under apps/glass-fortress/frontend`,
      );
    }
    return { specifier, module: relative(FRONTEND, hit) };
  });
}

export interface JsxTag {
  /** An intrinsic element's tag — `html`, `a`, `form`. Components (capitalised or dotted) are not listed. */
  tag: string;
  line: number;
  /**
   * Each attribute's source: a string value as its text (`rtl`), an expression as the expression's source
   * (`DIRECTION[locale]`), a bare attribute as `true`. Spread attributes are not listed.
   */
  attributes: Record<string, string>;
}

/**
 * Every INTRINSIC JSX element a file renders, with its attributes — read from the AST, so `'<html'` inside a string is not a tag.
 * Callers: the locale document's cases (UI-4: one file renders `<html>`, and its `dir` is the direction map's);
 * UI-5 `no-door-before-it-exists` (`<a>`, `<form>`); UI-8 `no-write-from-research` (`<form>`).
 */
export function jsxTagsIn(file: string): JsxTag[] {
  const source = parse(file);
  const found: JsxTag[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && /^[a-z]/.test(node.tagName.text)) {
      const attributes: Record<string, string> = {};
      for (const property of node.attributes.properties) {
        if (!ts.isJsxAttribute(property)) continue;
        const { initializer } = property;
        attributes[property.name.getText(source)] =
          initializer === undefined
            ? 'true'
            : ts.isStringLiteral(initializer)
              ? initializer.text
              : ts.isJsxExpression(initializer)
                ? (initializer.expression?.getText(source) ?? '')
                : initializer.getText(source);
      }
      found.push({ tag: node.tagName.text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, attributes });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Every local module `file` reaches through its imports, TRANSITIVELY — each listed once, relative to the frontend, sorted —
 * through the vacuity guard. A module that is not `.ts` / `.tsx` (a stylesheet, a JSON file) is listed and not read. Built on
 * `importsOf`, so an unresolvable local import anywhere on the way still throws. Callers: `nav-is-the-map` (UI-4, the layout
 * mounts neither retired component, directly or through anything it imports); `no-model-voice-public` (UI-5).
 */
export function importClosureOf(file: string): string[] {
  const reached = new Set<string>();
  const visit = (from: string): void => {
    for (const { module } of importsOf(from)) {
      if (module === null || reached.has(module)) continue;
      reached.add(module);
      if (module.endsWith('.ts') || module.endsWith('.tsx')) visit(join(FRONTEND, module));
    }
  };
  visit(file);
  return [...requireSubjects(`modules imported by ${relative(FRONTEND, file)}`, [...reached].sort())];
}

/**
 * The package a specifier names — `@scope/name/sub` → `@scope/name`, `name/sub` → `name` — or `null` for
 * a local specifier or a Node builtin. Callers: the harness' H-9 (UI-1); `retired-names` (UI-10).
 */
export function packageNameOf(specifier: string): string | null {
  if (isLocal(specifier) || specifier.startsWith('node:') || builtinModules.includes(specifier)) return null;
  const parts = specifier.split('/');
  return (specifier.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)).join('/');
}
