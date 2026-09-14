import { join } from 'node:path';
import { EVER_PUBLISHED } from '../src/services/evidencePredicates';
import { SRC, codeOf, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// "EVER PUBLISHED" HAS ONE SPELLING — thesis step 23, the R49 sketch §e3 and §6 R3.
//
// Thesis A3 :1399–:1402 and T6 :920–:924: PUBLIC_PAGE holds for a page any version EVER published cited — "opened pages
// stay open". Ruled 2026-09-14: a version was ever published iff it has a PublicationAttempt whose outcome is PUBLISHED,
// and ONE predicate says so for `publicPage`, the public version read and the public history. Its one spelling is
// `EVER_PUBLISHED` in `services/evidencePredicates.ts`; a second `publicationAttempts: { some: { outcome: 'PUBLISHED' } }`
// anywhere else is the copy that drifts — a reader that answered "ever published" differently from `publicPage` would
// serve a version whose page the platform calls private, or hide one it calls public.
//
// IN THE UNIT PROJECT, which gates. The write of an attempt (`outcome: 'PUBLISHED'` in a `data:` block) is not a spelling
// of the predicate and does not fire: the scan matches the relation's `some:` filter.
// ---------------------------------------------------------------------------

const SPELLS = /publicationAttempts\s*:\s*\{\s*some\s*:\s*\{\s*outcome\s*:\s*['"]PUBLISHED['"]/;
const HOME = join('services', 'evidencePredicates.ts');

describe('EVER_PUBLISHED — one spelling of "ever published"', () => {
  it('is the relation filter A3 amended by T6 names: a PublicationAttempt with outcome PUBLISHED', () => {
    expect(EVER_PUBLISHED).toEqual({ publicationAttempts: { some: { outcome: 'PUBLISHED' } } });
  });

  it('is spelled in services/evidencePredicates.ts and in no other module under src/', () => {
    const spelling = tsFiles(SRC)
      .filter((file) => SPELLS.test(readCode(file)))
      .map((file) => file.slice(SRC.length + 1));
    expect(spelling).toEqual([HOME]);
  });

  it('DETECTS the filter in a where — and an attempt WRITTEN with that outcome, and a comment, do not fire', () => {
    expect(SPELLS.test("where: { thesisId, publicationAttempts: { some: { outcome: 'PUBLISHED' } } }")).toBe(true);
    expect(SPELLS.test('publicationAttempts: {\n  some: {\n    outcome: "PUBLISHED" } }')).toBe(true);
    expect(SPELLS.test("tx.publicationAttempt.create({ data: { thesisId, outcome: 'PUBLISHED', refusedBy: [] } })")).toBe(false);
    expect(SPELLS.test(codeOf("// publicationAttempts: { some: { outcome: 'PUBLISHED' } } read twice drifts\nconst x = 1;"))).toBe(false);
  });
});
