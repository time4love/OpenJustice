import { relative } from 'node:path';
import { FRONTEND, NOT_YET_REWRITTEN, PICTOGRAPH, SRC, offendersIn, requireSubjects, sourceFiles } from './scan';

// ---------------------------------------------------------------------------
// no-emoji — docs/gf-ui-refactor-plan.md §9 :1080–:1081 and :1102;
// docs/gf-ui-design-session-2026-09-16.md §1.8 ("לעולם לא אמוג׳י").
//
// THE PREDICATE IS A VALUE, not a description, and it lives in `test/scan.ts` beside the allow-list it
// defines. Three honest counts of "emoji under src/" were produced from three different predicates while
// UI-4b was being sketched, and the whole difference was `✓` U+2713 and `✕` U+2715 — Dingbats, for which
// `\p{Extended_Pictographic}` is FALSE. So two cases below hold BOTH halves of the value: the characters it
// must catch, and the punctuation it must never catch, which is the half a widened range breaks silently.
//
// The subject set, the allow-list and its three ratchet properties are `tokens-only`'s, one list for both.
// ---------------------------------------------------------------------------

/** It must catch each of these — one per family the predicate is built from. */
const MUST_CATCH: readonly [string, string][] = [
  ['🔒', 'U+1F512, a pictograph'],
  ['→', 'U+2192, an arrow'],
  ['✓', 'U+2713, a Dingbat — FALSE under \\p{Extended_Pictographic}'],
  ['✕', 'U+2715, a Dingbat — the same'],
  ['⚖', 'U+2696, a pictograph in the Misc Symbols block'],
  ['▾', 'U+25BE, a geometric shape'],
];

/** It must NEVER catch these — the punctuation the researcher's Hebrew and the approved copy actually use. */
const MUST_NOT_CATCH: readonly [string, string][] = [
  ['·', 'U+00B7 middle dot — the separator on every board'],
  ['־', 'U+05BE maqaf — „צילום של העמוד מ־{date}”'],
  ['—', 'U+2014 em dash — the English appName'],
  ['„', 'U+201E'],
  ['”', 'U+201D'],
  ['׳', 'U+05F3 geresh'],
  ['…', 'U+2026 ellipsis'],
  ['₪', 'U+20AA'],
];

function subjects(): string[] {
  return sourceFiles(SRC, ['.ts', '.tsx']).map((file) => relative(FRONTEND, file));
}

describe('no-emoji', () => {
  it('the predicate CATCHES every family it is built from', () => {
    const missed = MUST_CATCH.filter(([character]) => !PICTOGRAPH.test(character)).map(([character, why]) => `${character} ${why}`);
    expect(missed).toEqual([]);
  });

  it('the predicate is SILENT on the punctuation the approved Hebrew uses — the half a widened range breaks', () => {
    const caught = MUST_NOT_CATCH.filter(([character]) => PICTOGRAPH.test(character)).map(([character, why]) => `${character} ${why}`);
    expect(caught).toEqual([]);
  });

  it('no emoji, arrow or geometric shape under src/, outside the dated allow-list', () => {
    const allowed = new Set(NOT_YET_REWRITTEN);
    const offenders = requireSubjects('source files under src/', subjects())
      .filter((file) => !allowed.has(file))
      .flatMap((file) => offendersIn(file).pictograph);
    expect(offenders).toEqual([]);
  });
});
