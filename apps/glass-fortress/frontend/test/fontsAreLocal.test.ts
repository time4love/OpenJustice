import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FRONTEND, SRC, callsOf, importsOf, requireSubjects, sourceFiles, stringsIn } from './scan';

// ---------------------------------------------------------------------------
// fonts-are-local — docs/gf-ui-refactor-plan.md §9 :1076–:1079.
//
// "Frank Ruhl Libre (already at `app/fonts/`) and Heebo, both SELF-HOSTED through `next/font/local`" — never a
// Google Fonts network request, and never the Fontsource package, which resolves from a local `node_modules`
// this repository's manifests do not declare and would fail in CI.
//
// WHY FOUR FILES AND NOT TWO, and why this instrument asserts an ORDER. Each family ships as two subsets, and
// the Hebrew subset of each maps ZERO digits (measured from its own `cmap`: Frank Ruhl Libre 109 codepoints,
// Heebo 108, no digit in either). Hebrew headings are full of digits — „בצילום מ-28.6.2022”. CSS font fallback
// is PER GLYPH, so the Hebrew subset must come FIRST in each stack and the Latin subset immediately after it:
// the letters come from face 1 and a digit inside the same word falls to face 2.
//
// AND WHY `adjustFontFallback: false` IS NOT OPTIONAL. With it left on, `next/font` emits the CSS variable as
// `'<family>', '<family> Fallback'` and generates a real, matchable `@font-face` for that second name whose
// `src` is `local("Arial")` or `local("Times New Roman")` — BOTH of which have digits. That face would then sit
// between the Hebrew subset and the Latin one and take every digit, and the four files would ship with the
// defect they exist to prevent. So this instrument asserts the CALL's options, not merely that a token exists.
//
// WHAT NO CASE HERE CAN SEE: that a glyph actually rendered. jsdom has no `document.fonts` and no font
// matching at all. `document.fonts.check` for both faces is read in the browser, in the step's local run.
// ---------------------------------------------------------------------------

const LAYOUT = 'src/app/[locale]/layout.tsx';
const GLOBALS = 'src/app/globals.css';
const FONTS = 'src/app/fonts';

/** The four faces, by file, with the sha256 each was verified at when it entered the tree. */
const FACES: readonly { file: string; role: 'serif-hebrew' | 'serif-latin' | 'sans-hebrew' | 'sans-latin' }[] = [
  { file: 'frank-ruhl-libre-hebrew-wght-normal.woff2', role: 'serif-hebrew' },
  { file: 'frank-ruhl-libre-latin-wght-normal.woff2', role: 'serif-latin' },
  { file: 'heebo-hebrew-wght-normal.woff2', role: 'sans-hebrew' },
  { file: 'heebo-latin-wght-normal.woff2', role: 'sans-latin' },
];

/** The retired August face: one Hebrew subset, identical in coverage to the Fontsource one, never imported. */
const RETIRED_FACE = 'frank-ruhl-libre-he.woff2';

function layoutSource(): string {
  return readFileSync(join(FRONTEND, LAYOUT), 'utf8');
}

function globalsSource(): string {
  return readFileSync(join(FRONTEND, GLOBALS), 'utf8');
}

/** The value of one CSS custom property from the token block, whitespace collapsed. */
function tokenValue(name: string): string | null {
  const found = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(globalsSource());
  return found === null ? null : (found[1] ?? '').replace(/\s+/g, ' ').trim();
}

describe('fonts-are-local', () => {
  it('the four faces and the two licences are in the tree, and the retired August face is gone', () => {
    const missing = FACES.filter((face) => !existsSync(join(FRONTEND, FONTS, face.file))).map((face) => face.file);
    const licences = ['OFL-frank-ruhl-libre.txt', 'OFL-heebo.txt'].filter((file) => !existsSync(join(FRONTEND, FONTS, file)));
    const retiredStillThere = existsSync(join(FRONTEND, FONTS, RETIRED_FACE)) ? [RETIRED_FACE] : [];
    expect([...missing, ...licences, ...retiredStillThere]).toEqual([]);
  });

  it('the locale layout loads all four through next/font/local, and imports no Google font', () => {
    const specifiers = importsOf(join(FRONTEND, LAYOUT)).map((found) => found.specifier);
    expect(specifiers).toContain('next/font/local');
    expect(specifiers.filter((specifier) => specifier.startsWith('next/font/google'))).toEqual([]);
  });

  it('the layout names each of the four face FILES exactly once, by a path relative to itself', () => {
    const strings = stringsIn(join(FRONTEND, LAYOUT)).map((found) => found.text);
    const counts = Object.fromEntries(FACES.map((face) => [face.file, strings.filter((text) => text.endsWith(face.file)).length]));
    expect(counts).toEqual(Object.fromEntries(FACES.map((face) => [face.file, 1])));
  });

  it('every localFont call passes adjustFontFallback: false and fallback: [] — the emitted variable is ONE family name', () => {
    // Read as NODES. A regex over the file's text reads FIVE here, because the block comment above the calls
    // explains why the option is there — which is the exact mistake `test/scan.ts`' header forbids.
    const calls = callsOf(join(FRONTEND, LAYOUT), 'localFont');
    expect(calls).toHaveLength(4);
    const wrong = calls
      .filter((call) => call.options.adjustFontFallback !== 'false' || call.options.fallback !== '[]')
      .map((call) => `:${String(call.line)} adjustFontFallback=${String(call.options.adjustFontFallback)} fallback=${String(call.options.fallback)}`);
    expect(wrong).toEqual([]);
  });

  it('every localFont call declares its own CSS variable, and the four are distinct', () => {
    const variables = callsOf(join(FRONTEND, LAYOUT), 'localFont').map((call) => call.options.variable ?? '(none)');
    expect(variables.sort()).toEqual([
      "'--font-frank-hebrew'",
      "'--font-frank-latin'",
      "'--font-heebo-hebrew'",
      "'--font-heebo-latin'",
    ]);
  });

  it('the two stacks put the HEBREW subset before the LATIN one — the digits depend on that order', () => {
    const serif = tokenValue('--font-serif') ?? '';
    const sans = tokenValue('--font-sans') ?? '';
    const order = (stack: string, hebrew: string, latin: string): string =>
      stack.indexOf(hebrew) === -1 || stack.indexOf(latin) === -1
        ? `missing a variable: ${stack}`
        : stack.indexOf(hebrew) < stack.indexOf(latin)
          ? 'hebrew-then-latin'
          : `LATIN FIRST — digits would come from the Hebrew subset's fallback: ${stack}`;
    expect({
      serif: order(serif, '--font-frank-hebrew', '--font-frank-latin'),
      sans: order(sans, '--font-heebo-hebrew', '--font-heebo-latin'),
    }).toEqual({ serif: 'hebrew-then-latin', sans: 'hebrew-then-latin' });
  });

  it('--font-mono is a system stack: the values are Latin and digits only, and no fifth face ships for them', () => {
    expect(tokenValue('--font-mono')).toEqual('ui-monospace, SFMono-Regular, Menlo, monospace');
  });

  it('no file under src/ imports the Fontsource package — it resolves locally and is in no manifest', () => {
    const offenders = requireSubjects('source files under src/', sourceFiles(SRC, ['.ts', '.tsx'])).flatMap((file) =>
      importsOf(file)
        .filter((found) => found.specifier.startsWith('@fontsource'))
        .map((found) => `${relative(FRONTEND, file)} imports ${found.specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('the Geist variables are gone from the layout and from globals.css', () => {
    const remaining = ['--font-geist-sans', '--font-geist-mono'].filter(
      (name) => layoutSource().includes(name) || globalsSource().includes(name),
    );
    expect(remaining).toEqual([]);
  });
});
