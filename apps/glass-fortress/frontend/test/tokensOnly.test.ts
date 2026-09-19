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
/**
 * §1.8's ten colours — the values the token block must define, once each.
 *
 * FOUR MOVED ON 2026-09-18 (§1.8 :42, the researcher): paper `#FAF7F1` -> `#FCFCFB`, sidebar
 * `#F3EEE4` -> `#F2F1EE`, muted `#6B6157` -> `#4E463F`, line `#E4DCCF` -> `#E6E5E2`. THIS LIST IS NOT
 * THE ALLOW-LIST and it did not grow: `NOT_YET_REWRITTEN` and `THIS_STEPS_OWN` are untouched. This one
 * names §1.8's CURRENT values so that "each exactly once" keeps meaning what it says; it is
 * `palette-is-the-system` that holds WHICH values, with the contrast floor beside them.
 */
const SYSTEM_COLOURS = ['#FCFCFB', '#F2F1EE', '#FFFFFF', '#1F1B16', '#4E463F', '#E6E5E2', '#4F6B3A', '#B08D3B', '#B7791F', '#A8322A'];

/**
 * Files THIS STEP writes or rewrites: none of them may ever be excused by the list. Re-pointed at
 * UI-5's surface — the three public pages, everything under `components/thesis/`, and the four
 * modules the re-brief rewrites with them. **`app/[locale]/theses/page.tsx` JOINED 2026-09-19**, moving
 * off `NOT_YET_REWRITTEN` in the same change that rewrote it as the public list (UI-7): a file cannot be
 * both excused and owned, and :93 is what holds the two lists apart. A step that excused its OWN work would turn a shrinking
 * list into a place to put the files it did not want to finish.
 */
const THIS_STEPS_OWN = [
  'src/app/[locale]/theses/page.tsx',
  'src/app/[locale]/theses/[id]/page.tsx',
  'src/app/[locale]/theses/[id]/versions/[v]/page.tsx',
  'src/app/[locale]/call/[thesisId]/page.tsx',
  'src/components/LegalDisclaimer.tsx',
  'src/components/CopyableCode.tsx',
  'src/lib/markdownToReact.tsx',
  'src/components/thesis/Appeals.tsx',
  'src/components/thesis/Banner.tsx',
  'src/components/thesis/Byline.tsx',
  'src/components/thesis/History.tsx',
  'src/components/thesis/PlatformMark.tsx',
  'src/components/thesis/ProvisionName.tsx',
  'src/components/thesis/PublicInterestStatement.tsx',
  'src/components/thesis/TheCase.tsx',
  'src/components/thesis/ThePages.tsx',
  'src/components/thesis/ThesisNotFound.tsx',
  'src/components/thesis/VerifyDisclosure.tsx',
  'src/components/thesis/WithdrawnNotice.tsx',
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

  it('the allow-list never names a file THIS STEP writes: nothing under components/shell or components/thesis, and none of UI-5’s own', () => {
    const ownWork = NOT_YET_REWRITTEN.filter(
      (file) =>
        file.startsWith('src/components/shell/') ||
        file.startsWith('src/components/thesis/') ||
        THIS_STEPS_OWN.includes(file),
    );
    expect(ownWork).toEqual([]);
  });

  it("globals.css defines §1.8's ten colours, each exactly once, as the ONE place a raw colour belongs", () => {
    const css = readFileSync(join(FRONTEND, GLOBALS), 'utf8');
    const counts = Object.fromEntries(SYSTEM_COLOURS.map((colour) => [colour, (css.match(new RegExp(colour, 'gi')) ?? []).length]));
    expect(counts).toEqual(Object.fromEntries(SYSTEM_COLOURS.map((colour) => [colour, 1])));
  });
});
