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

export interface CallOptions {
  line: number;
  /** Each option of the call's object-literal argument, by name, as the SOURCE of its value (`false`, `'swap'`, `[]`). */
  options: Record<string, string>;
}

/**
 * Every call of `callee` in a file, with its object-literal argument read as NODES — so a mention of an
 * option inside a comment or a string is never counted as one. That distinction is not hypothetical: the
 * first draft of `fonts-are-local` counted `adjustFontFallback: false` with a regex over the file's text and
 * read FIVE, because the block comment above the calls explains why the option is there.
 * Callers: `fonts-are-local` (UI-4b).
 */
export function callsOf(file: string, callee: string): CallOptions[] {
  const source = parse(file);
  const found: CallOptions[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee) {
      const options: Record<string, string> = {};
      const argument = node.arguments.at(0);
      if (argument !== undefined && ts.isObjectLiteralExpression(argument)) {
        for (const property of argument.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          options[property.name.getText(source)] = property.initializer.getText(source);
        }
      }
      found.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, options });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
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

/**
 * THE ONE SHRINKING ALLOW-LIST, dated 2026-09-17 (UI-4b; the researcher's ruling on Q1/Q2).
 *
 * `tokens-only` and `no-emoji` state their properties over ALL of `src/` — that is what makes a file written
 * tomorrow a subject by default, and it is why the subject set was NOT narrowed to the step's own files. The
 * files below are the ones UI-4b does not rewrite and may not edit: pages and components that a later UI step
 * rewrites or UI-10 retires. Every entry is asserted to EXIST and to still be an OFFENDER, so a file that is
 * deleted, or that stops offending, forces its line out rather than decorating the list forever.
 *
 * IT ONLY SHRINKS. It is emptied at UI-10. `components/thesis/CitationChip.tsx` is the first entry to leave,
 * at this step, because this step rewrites it.
 *
 * The subject set is `src/**` + `.ts`/`.tsx` and therefore EXCLUDES `src/app/globals.css`, which is the token
 * block's own home and the one place a raw colour belongs.
 *
 * ONE LIST, TWO PREDICATES — so "this entry still offends" is asked against the UNION of them, never against
 * one half. A file that carries only an emoji is on the list for `no-emoji` and has no raw colour; checking
 * it against the colour predicate alone would call it stale and demand its removal, after which `no-emoji`
 * would redden. Both predicates therefore live HERE, beside the list they define, and `offendersIn` is the
 * one reader of both.
 */
export const NOT_YET_REWRITTEN: readonly string[] = [
  'src/app/[locale]/about/page.tsx',
  'src/app/[locale]/admin/page.tsx',
  'src/app/[locale]/article-rules/[trackedUrlId]/[capture]/MarkingClient.tsx',
  'src/app/[locale]/auth/callback/page.tsx',
  'src/app/[locale]/call/[thesisId]/page.tsx',
  'src/app/[locale]/call/page.tsx',
  'src/app/[locale]/evidence/[id]/page.tsx',
  'src/app/[locale]/evidence/page.tsx',
  'src/app/[locale]/figures/page.tsx',
  'src/app/[locale]/forensics/[trackedUrlId]/page.tsx',
  'src/app/[locale]/forensics/page.tsx',
  'src/app/[locale]/guide/[slug]/page.tsx',
  'src/app/[locale]/guide/page.tsx',
  'src/app/[locale]/login/page.tsx',
  'src/app/[locale]/oauth/interaction/[uid]/OAuthInteractionClient.tsx',
  'src/app/[locale]/opengraph-image.tsx',
  'src/app/[locale]/page.tsx',
  'src/app/[locale]/profile/page.tsx',
  'src/app/[locale]/reports/new/page.tsx',
  'src/app/[locale]/reports/patterns/page.tsx',
  'src/app/[locale]/researchers/page.tsx',
  'src/app/[locale]/safety/page.tsx',
  'src/app/[locale]/submit/page.tsx',
  'src/app/[locale]/theses/[id]/edit/page.tsx',
  'src/app/[locale]/theses/page.tsx',
  'src/app/[locale]/unlock/UnlockForm.tsx',
  'src/app/[locale]/unlock/page.tsx',
  'src/components/AuthGuard.tsx',
  'src/components/AuthShell.tsx',
  'src/components/CategoryBadges.tsx',
  'src/components/ClaimBlock.tsx',
  'src/components/CopyableCode.tsx',
  'src/components/DebugConsolePanel.tsx',
  'src/components/DiffCard.tsx',
  'src/components/EmptyState.tsx',
  'src/components/EvidenceHighlightCard.tsx',
  'src/components/EvidenceTimeline.tsx',
  'src/components/FloatingChatWidget.tsx',
  'src/components/FoiaModal.tsx',
  'src/components/GuideStatusBadge.tsx',
  'src/components/HeroSection.tsx',
  'src/components/LegalDisclaimer.tsx',
  'src/components/PublicationBadge.tsx',
  'src/components/SkeletonRows.tsx',
  'src/components/StagingBanner.tsx',
  'src/components/StrengthBadge.tsx',
  'src/components/SurvivalChip.tsx',
  'src/components/ThesisEditor.tsx',
  'src/components/ThesisHighlightCard.tsx',
  'src/components/ThesisProvenancePanel.tsx',
  'src/components/ThesisPublicationPanel.tsx',
  'src/components/ThesisVersionHistory.tsx',
  'src/components/TierBadge.tsx',
  'src/components/TipTapRenderer.tsx',
  'src/components/TrajectoryPanel.tsx',
  'src/components/WhistleblowerModal.tsx',
  'src/components/thesis/Appeals.tsx',
  'src/components/thesis/Banner.tsx',
  'src/components/thesis/Byline.tsx',
  'src/components/thesis/ContextLine.tsx',
  'src/components/thesis/History.tsx',
  'src/components/thesis/PlatformMark.tsx',
  'src/components/thesis/ProvisionName.tsx',
  'src/components/thesis/PublicInterestStatement.tsx',
  'src/components/thesis/TheCase.tsx',
  'src/components/thesis/ThePages.tsx',
  'src/components/thesis/ThesisNotFound.tsx',
  'src/components/thesis/VerifyDisclosure.tsx',
  'src/components/thesis/WithdrawnNotice.tsx',
  'src/lib/debugCapture.ts',
  'src/lib/evidencePerspective.ts',
  'src/lib/guide.ts',
  'src/lib/investigativeCategories.ts',
  'src/lib/markdownToReact.tsx',
  'src/lib/reportEvidenceTiers.ts',
];

/** A raw hex colour: `#fff`, `#0f172a`, `#0f172aff`. */
export const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;

/** A Tailwind palette utility — a colour NAMED rather than a token USED. */
export const NAMED_COLOUR =
  /\b(text|bg|border|ring|from|to|via|fill|stroke|divide|placeholder|shadow|outline|accent|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

/**
 * A pictograph, OR an arrow / geometric shape / box-drawing character. BOTH halves are needed:
 * `\p{Extended_Pictographic}` alone misses the arrows the legacy pages carry as text (`→ ← ↗`) and is FALSE
 * for `✓` U+2713 and `✕` U+2715, which are Dingbats; the ranges alone miss `🔒` and `⚖`. Three honest counts
 * of "emoji under src/" were produced from three different predicates while UI-4b was being sketched, and
 * that pair of Dingbats was the whole difference — which is why the value is written once, here.
 */
export const PICTOGRAPH = /\p{Extended_Pictographic}|[\u2190-\u21FF\u2B00-\u2BFF\u25A0-\u25FF\u2500-\u257F\u2700-\u27BF]/u;

/**
 * What a file offends on, as the two kinds separately — read from its own STRINGS, so a comment is never an
 * offence. `test/tokensOnly.test.ts` and `test/noEmoji.test.ts` each state their half; the staleness of an
 * allow-list entry is asked against BOTH, because the list is shared.
 */
export function offendersIn(file: string): { colour: string[]; pictograph: string[] } {
  const strings = stringsIn(join(FRONTEND, file));
  return {
    colour: strings
      .filter((found) => RAW_HEX.test(found.text) || NAMED_COLOUR.test(found.text))
      .map((found) => `${file}:${String(found.line)} ${found.text.trim().slice(0, 48)}`),
    pictograph: strings.flatMap((found) => {
      const hit = [...found.text].filter((character) => PICTOGRAPH.test(character));
      return hit.length === 0 ? [] : [`${file}:${String(found.line)} ${[...new Set(hit)].join(' ')}`];
    }),
  };
}

/**
 * The three shapes §4 :167–:170 forbids as a text node — a 64-hex name (with or without `0x`), a cuid, a
 * 14-digit Wayback timestamp — as ONE list, so `no-id-as-text` and `bidi-isolated` never spell them twice.
 * Callers: `no-id-as-text`, `bidi-isolated` (UI-5, and every page step after).
 */
export const ID_SHAPES: readonly { name: string; pattern: RegExp }[] = [
  { name: '64-hex', pattern: /(?:0x)?[0-9a-f]{64}/i },
  { name: 'cuid', pattern: /\bc[a-z0-9]{24}\b/ },
  { name: '14-digit timestamp', pattern: /\b\d{14}\b/ },
];

/** The three public thesis pages, by path — the subjects of every UI-5 source scan. */
export const PUBLIC_THESIS_PAGES: readonly string[] = [
  'src/app/[locale]/theses/[id]/page.tsx',
  'src/app/[locale]/theses/[id]/versions/[v]/page.tsx',
  'src/app/[locale]/call/[thesisId]/page.tsx',
];

/**
 * Every module the public thesis surface is made of: the three pages, everything under `components/thesis/`, the
 * libraries UI-5 adds, and the two components it rewrites. Each path is asserted to EXIST — a scan over a module
 * that is not there examined nothing, which is never a pass. Callers: `no-model-voice-public`,
 * `no-door-before-it-exists`, `publicRead` (UI-5).
 */
export function publicThesisModules(): string[] {
  const named = [
    ...PUBLIC_THESIS_PAGES,
    'src/lib/doors.ts',
    'src/lib/citationTokens.ts',
    'src/lib/textDiff.ts',
    'src/lib/markdownToReact.tsx',
    'src/lib/thesisBody.ts',
    'src/components/LegalDisclaimer.tsx',
    'src/components/CopyableCode.tsx',
  ];
  const missing = named.filter((file) => !existsSync(join(FRONTEND, file)));
  if (missing.length > 0) throw new Error(`publicThesisModules: ${missing.join(', ')} does not exist`);
  const components = sourceFiles(join(SRC, 'components', 'thesis'), ['.ts', '.tsx']).map((file) => relative(FRONTEND, file));
  return [...named, ...components].sort();
}
