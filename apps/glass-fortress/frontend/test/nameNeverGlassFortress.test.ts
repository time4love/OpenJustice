import { relative } from 'node:path';
import { FRONTEND, SRC, messageCatalogs, requireSubjects, sourceFiles, stringsIn } from './scan';

// ---------------------------------------------------------------------------
// name-never-glass-fortress — docs/gf-ui-flows.md §38 :904–:905 and A5 :1086;
// docs/gf-ui-refactor-plan.md UI-1.
//
// "Glass Fortress" is backend and code terminology only; no reader ever sees it.
// Over every message value and every string the code under src/ carries —
// string literals, template text, JSX text, in .ts and .tsx alike (A5 :1086 says
// "no user-facing string", which a .ts module's constant can be) — no value holds
// the two words. It REFUSES NOTHING; it is a scan.
//
// COMMENTS ARE NOT STRINGS. `stringsIn` reads literal nodes only, so the two
// comments that name the term (src/app/layout.tsx, src/app/[locale]/login/page.tsx)
// cannot fire it, and a planted `//`, `/* */` or `{/* */}` comment must not.
//
// THE TERM IS THE DESIGN'S: the two words, any case, any whitespace between.
// The hyphenated form in a repository path or a Railway host is not it — ruled by
// the researcher 2026-09-15; the public URL moves to its own domain at launch.
// ---------------------------------------------------------------------------

const TERM = /glass\s+fortress/i;

describe('name-never-glass-fortress', () => {
  it('no value in messages/he.json or messages/en.json contains "Glass Fortress"', () => {
    const hits = requireSubjects('message catalogs', messageCatalogs()).flatMap((catalog) =>
      requireSubjects(`values of ${catalog.file}`, catalog.leaves)
        .filter((leaf) => typeof leaf.value === 'string' && TERM.test(leaf.value))
        .map((leaf) => `${catalog.file} ${leaf.path.join('.')}: ${JSON.stringify(leaf.value)}`),
    );
    expect(hits).toEqual([]);
  });

  it('no string literal, template text or JSX text in src/**/*.{ts,tsx} contains "Glass Fortress" — comments are not strings', () => {
    const hits = sourceFiles(SRC, ['.ts', '.tsx']).flatMap((file) =>
      stringsIn(file)
        .filter((found) => TERM.test(found.text))
        .map((found) => `${relative(FRONTEND, file)}:${String(found.line)} (${found.kind}): ${JSON.stringify(found.text)}`),
    );
    expect(hits).toEqual([]);
  });

  it('examined something: string values in both catalogs, and string literals in the source files', () => {
    for (const catalog of messageCatalogs()) {
      expect(catalog.leaves.filter((leaf) => typeof leaf.value === 'string').length).toBeGreaterThan(0);
    }
    const files = sourceFiles(SRC, ['.ts', '.tsx']);
    expect(files.length).toBeGreaterThan(0);
    expect(files.flatMap((file) => stringsIn(file)).length).toBeGreaterThan(0);
  });
});
