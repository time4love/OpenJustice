import { verdict } from '../src/lib/verdict';

// ---------------------------------------------------------------------------
// THE ONE VERDICT RULE — thesis step 19 builds it (docs/gf-document-refactor-plan.md
// :56, :162, :411), and these four cases are its whole contract.
//
// IN THE UNIT PROJECT, which is the only run that gates (`npm run test:gf`;
// docs/gf-thesis-step-18-2026-09-11.md §7 — "a case in a job that cannot block a
// merge holds nothing"). The thesis acceptance project runs continue-on-error
// until step 25 and cannot hold this.
//
// THE ONE-SPELLING SCAN IS DOCUMENT STEP 29's, not this step's. What holds the
// rule here is that its callers CALL it: break `verdict` at its definition and
// `test/thesisFraming.test.ts`' phraseVerified cases redden.
// ---------------------------------------------------------------------------

describe('the ONE verdict rule — PRESENT · ABSENT · UNCHECKED', () => {
  it('PRESENT when the normalised phrase is in the normalised text', () => {
    expect(verdict('הבטחת הבטיחות', 'משרד הבריאות הסיר את הבטחת הבטיחות שלו')).toBe('PRESENT');
  });

  it('ABSENT when it is not', () => {
    expect(verdict('קלות וחולפות בלבד', 'תופעות הלוואי השכיחות מופיעות לרוב יום או יומיים אחרי קבלת החיסון')).toBe(
      'ABSENT',
    );
  });

  it('UNCHECKED on null text — there is nothing to search, and it is never silently PRESENT (document flows :359–:365)', () => {
    expect(verdict('כל ביטוי שהוא', null)).toBe('UNCHECKED');
  });

  // NULL IS NOT EMPTY. An empty text has been read and contains nothing, so a
  // phrase is genuinely ABSENT from it; a null text was never searchable at all.
  // Collapsing the two would report "we looked and found nothing" as "we could
  // not look", which is the distinction the third value exists for.
  it('ABSENT, not UNCHECKED, on an EMPTY text — read and containing nothing', () => {
    expect(verdict('כל ביטוי שהוא', '')).toBe('ABSENT');
  });

  // ITS CALL OF NORMALISE, held as a PROPERTY rather than by reading the source:
  // whitespace differing on BOTH sides still matches. A second spelling would
  // have to reproduce this, and thesis A7's one-symbol scan holds that there is
  // no second spelling under `src/`.
  it('CALLS NORMALISE — whitespace differing on either side does not change the verdict', () => {
    expect(verdict('הבטחת   הבטיחות', 'משרד הבריאות\n\nהסיר את\tהבטחת הבטיחות  שלו')).toBe('PRESENT');
    expect(verdict('  הבטחת הבטיחות  ', 'משרד הבריאות הסיר את הבטחת הבטיחות שלו')).toBe('PRESENT');
  });
});
