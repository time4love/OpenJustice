import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// SOURCE-SCAN HELPERS FOR THE WALK'S ACCEPTANCE SUITE.
//
// A source scan is a test, not a review note (refactor plan §4): it holds a
// rule at build time over every file, including the one added tomorrow that no
// behaviour test was written for. Precedent: documentHashSingleRule,
// mcpToolClassification, unchangedNoDiff.
//
// Two disciplines every scan here follows. It reads CODE ONLY — a rule
// satisfied by a comment mentioning it is not a rule — and it carries a DECOY:
// a snippet the scan must match, so a scan that matches nothing is caught as
// the vacuity this repository has paid for before.
// ---------------------------------------------------------------------------

export const BACKEND = join(__dirname, '..', '..');
export const SRC = join(BACKEND, 'src');
export const WALK = join(SRC, 'walk');

/** Every .ts file under `dir`, recursively; none when the directory does not exist. */
export function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** The file's code with block and line comments removed. Strings are kept. */
export function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

export function readCode(file: string): string {
  return codeOf(readFileSync(file, 'utf8'));
}

/** The substring from the brace at `from` to its matching close brace. */
export function balanced(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  return source.slice(from);
}

const WRITE_VERBS = 'create|createMany|update|updateMany|upsert';

/**
 * The `data: { … }` payloads of every Prisma write on one delegate, plus the
 * SET clause of every raw UPDATE on its table. Scoped to writes so a `where:`
 * naming a column is not read as writing it.
 */
export function writesTo(code: string, delegate: string): string[] {
  const regions: string[] = [];
  const call = new RegExp(`\\.${delegate}\\.(?:${WRITE_VERBS})\\(`, 'g');
  for (const match of code.matchAll(call)) {
    const open = code.indexOf('{', match.index + match[0].length);
    if (open < 0) continue;
    const args = balanced(code, open);
    for (const data of args.matchAll(/\bdata:\s*\{/g)) {
      regions.push(balanced(args, data.index + data[0].length - 1));
    }
  }
  const table = delegate.charAt(0).toUpperCase() + delegate.slice(1);
  const raw = new RegExp(`UPDATE\\s+"${table}"\\s+SET\\b([\\s\\S]*?)\\bWHERE\\b`, 'g');
  for (const match of code.matchAll(raw)) {
    if (match[1] !== undefined) regions.push(match[1]);
  }
  return regions;
}

/** The column names a payload region assigns: `col: …`, shorthand `col,`, or raw `"col" =`. */
export function columnsWritten(region: string): string[] {
  const columns = new Set<string>();
  for (const m of region.matchAll(/(?<!["\w.])([A-Za-z_]\w*)\s*:/g)) {
    if (m[1] !== undefined) columns.add(m[1]);
  }
  for (const m of region.matchAll(/(?<!["\w.:])([A-Za-z_]\w*)\s*(?:,|\}|$)/gm)) {
    if (m[1] !== undefined) columns.add(m[1]);
  }
  for (const m of region.matchAll(/"([A-Za-z_]\w*)"\s*=/g)) {
    if (m[1] !== undefined) columns.add(m[1]);
  }
  return [...columns];
}

/** Every module specifier the file imports or requires. */
export function importSpecifiers(code: string): string[] {
  const specifiers: string[] = [];
  for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    if (m[1] !== undefined) specifiers.push(m[1]);
  }
  for (const m of code.matchAll(/\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (m[1] !== undefined) specifiers.push(m[1]);
  }
  return specifiers;
}

/** The words of an identifier: camelCase and SNAKE_CASE boundaries, lower-cased. */
export function wordsOf(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_$]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

/** Every identifier in the code, with its file, that has one of `words` as a whole word. */
export function identifiersWithWord(code: string, words: readonly string[]): string[] {
  const found = new Set<string>();
  for (const m of code.matchAll(/\b[A-Za-z_$][\w$]*\b/g)) {
    const identifier = m[0];
    if (wordsOf(identifier).some((w) => words.includes(w))) found.add(identifier);
  }
  return [...found];
}
