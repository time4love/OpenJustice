import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FRONTEND, NOT_YET_REWRITTEN, SRC, offendersIn, requireSubjects, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// tokens-only — docs/gf-ui-refactor-plan.md §9 :1076–:1077 and :1102;
// docs/gf-ui-design-session-2026-09-16.md §1.8.
//
// "The colour tokens of the session's §1.8 defined once in `globals.css` and used by name; NO RAW COLOUR
// OUTSIDE THE TOKEN BLOCK." The property is stated over ALL of `src/`, so a file written tomorrow is a
// subject by default — narrowing the subject set to the step's own files would have made it fail open for
// every file written anywhere else.
//
// The files a later UI step still has to rewrite are named in ONE dated, shrinking allow-list
// (`test/scan.ts`' NOT_YET_REWRITTEN), shared with `no-emoji`. This file holds the list's THREE ratchet
// properties, because they are the list's and not either predicate's: every entry EXISTS, every entry still
// OFFENDS under one of the two predicates, and no entry names a file UI-4b itself wrote.
//
// THE SUBJECT SET is `src/**/*.{ts,tsx}` and therefore EXCLUDES `src/app/globals.css`, which is the token
// block's own home. A scan that counted its permitted home among its offenders would have the wrong subject
// set, not a larger one.
// ---------------------------------------------------------------------------

const GLOBALS = 'src/app/globals.css';
/** §1.8's ten colours — the values the token block must define, once each. */
const SYSTEM_COLOURS = ['#FAF7F1', '#F3EEE4', '#FFFFFF', '#1F1B16', '#6B6157', '#E4DCCF', '#4F6B3A', '#B08D3B', '#B7791F', '#A8322A'];

/** Files UI-4b itself wrote or rewrote: none of them may ever be excused by the list. */
const THIS_STEPS_OWN = [
  'src/components/Sheet.tsx',
  'src/components/glyphs.tsx',
  'src/lib/recents.ts',
  'src/app/[locale]/layout.tsx',
  'src/components/thesis/CitationChip.tsx',
];

function subjects(): string[] {
  return sourceFiles(SRC, ['.ts', '.tsx']).map((file) => relative(FRONTEND, file));
}

describe('tokens-only', () => {
  it('no raw hex and no named-palette colour under src/, outside globals.css and outside the dated allow-list', () => {
    const allowed = new Set(NOT_YET_REWRITTEN);
    const offenders = requireSubjects('source files under src/', subjects())
      .filter((file) => !allowed.has(file))
      .flatMap((file) => offendersIn(file).colour);
    expect(offenders).toEqual([]);
  });

  it('every allow-list entry EXISTS — a deleted file forces its line out rather than decorating the list', () => {
    const missing = NOT_YET_REWRITTEN.filter((file) => !existsSync(join(FRONTEND, file)));
    expect(missing).toEqual([]);
  });

  it('every allow-list entry still OFFENDS, under EITHER predicate — the list is shared, so staleness is asked of both', () => {
    // A file carrying only an emoji is on the list for `no-emoji` and has no raw colour. Asking the colour
    // predicate alone would call it stale and demand its removal, after which `no-emoji` would redden — one
    // list, two predicates, so the union is the only honest question.
    const stale = NOT_YET_REWRITTEN.filter((file) => {
      if (!existsSync(join(FRONTEND, file))) return false;
      const found = offendersIn(file);
      return found.colour.length === 0 && found.pictograph.length === 0;
    });
    expect(stale).toEqual([]);
  });

  it('the allow-list never names a file UI-4b itself writes: nothing under components/shell, and not the chip', () => {
    const shellsOwn = NOT_YET_REWRITTEN.filter((file) => file.startsWith('src/components/shell/') || THIS_STEPS_OWN.includes(file));
    expect(shellsOwn).toEqual([]);
  });

  it("globals.css defines §1.8's ten colours, each exactly once, as the ONE place a raw colour belongs", () => {
    const css = readFileSync(join(FRONTEND, GLOBALS), 'utf8');
    const counts = Object.fromEntries(SYSTEM_COLOURS.map((colour) => [colour, (css.match(new RegExp(colour, 'gi')) ?? []).length]));
    expect(counts).toEqual(Object.fromEntries(SYSTEM_COLOURS.map((colour) => [colour, 1])));
  });
});
