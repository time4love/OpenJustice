import { ProvisionName } from '@/components/thesis/ProvisionName';
import { renderWithIntl, type Locale } from './render';
import { requireSubjects } from './scan';

// ---------------------------------------------------------------------------
// provision-is-a-lookup — docs/gf-ui-flows.md §17 :532 (region 2: "the provision, named by its table entry");
// thesis A1 :1251–:1254; docs/gf-ui-refactor-plan.md §5 (joined in the heading, 2026-09-19).
//
// A PROVISION LABEL IS A CODE→LANGUAGE MAPPING, so the catalogue is its home (the researcher, 2026-09-19):
// „מדובר על תרגום של קוד מערכת לשפה שהמשתמש יכול לקרוא, אני חושב שזה נופל בהגדרה של טבלת מיפוי מרובת שפות."
// It was a backend payload field until this chunk — which made the same label two renderers, one of which the
// frontend could not translate. A1 defines PROVISION as a table of ELEMENT SHAPES and fixes no display label,
// so nothing in an appendix required the field: it was a UI-5 implementation choice.
//
// THIS CASE HOLDS VALUES, NOT KEYS, AND NOT A CENSUS. An earlier draft pinned the catalogue's own key COUNT at
// twelve — circular, because the catalogue satisfies its own census and the number holds nothing. What a board
// fixes is a VALUE, so the approved words are written here and compared against what a reader sees. The he/en
// KEY SYMMETRY is `messages-parity`'s and is not re-spelled here.
//
// THE SUBJECT SET IS THIS TABLE, through the vacuity guard; it does NOT read the backend's `provisions.ts`.
// The researcher ruled against that coupling: „לא הייתי יוצר צימוד ארכיטקטוני חדש שלא קיים היום רק בגלל המקרה
// שעולה עכשיו… כרגע יש לנו fallback והוא הוסכם. אם אין תרגום מציגים את הקוד." No frontend case reads outside
// this workspace today, and this one does not become the first. A code the catalogue has not got is not an
// error state — it is the agreed fallback, and the second case is what holds it.
// ---------------------------------------------------------------------------

/**
 * The labels a reader sees, by code — the researcher's approved words of 2026-09-19, AS VALUES.
 *
 * Ten are the backend table's own title truncated at the em dash; `PATIENT_RIGHTS_13` additionally drops the
 * legislation year, and `ADMIN_DISCLOSURE_DUTY` is the one phrase approved fresh. The point of the short form
 * is that the label sits beside a claim that runs to 558 characters: the table's full entry is 104 characters
 * and reads as a second sentence, which is why it is not what a page shows.
 */
const APPROVED: readonly { code: string; he: string; en: string }[] = [
  { code: 'NUREMBERG_1', he: 'קוד נירנברג, סעיף 1', en: 'Nuremberg Code, article 1' },
  { code: 'NUREMBERG_2', he: 'קוד נירנברג, סעיף 2', en: 'Nuremberg Code, article 2' },
  { code: 'NUREMBERG_3', he: 'קוד נירנברג, סעיף 3', en: 'Nuremberg Code, article 3' },
  { code: 'NUREMBERG_4', he: 'קוד נירנברג, סעיף 4', en: 'Nuremberg Code, article 4' },
  { code: 'NUREMBERG_5', he: 'קוד נירנברג, סעיף 5', en: 'Nuremberg Code, article 5' },
  { code: 'NUREMBERG_6', he: 'קוד נירנברג, סעיף 6', en: 'Nuremberg Code, article 6' },
  { code: 'NUREMBERG_7', he: 'קוד נירנברג, סעיף 7', en: 'Nuremberg Code, article 7' },
  { code: 'NUREMBERG_8', he: 'קוד נירנברג, סעיף 8', en: 'Nuremberg Code, article 8' },
  { code: 'NUREMBERG_9', he: 'קוד נירנברג, סעיף 9', en: 'Nuremberg Code, article 9' },
  { code: 'NUREMBERG_10', he: 'קוד נירנברג, סעיף 10', en: 'Nuremberg Code, article 10' },
  { code: 'PATIENT_RIGHTS_13', he: 'חוק זכויות החולה, סעיף 13', en: "Patients' Rights Law, section 13" },
  { code: 'ADMIN_DISCLOSURE_DUTY', he: 'חובת הגילוי המנהלית', en: 'Administrative duty of disclosure' },
];

/**
 * A code the catalogue cannot hold. The Nuremberg Code has TEN articles, so this one can never be added and the
 * case can never collide with a real provision — which is what a fallback subject has to be.
 */
const UNKNOWN = 'NUREMBERG_11';

/** What a reader sees, in one locale: the component's whole text, trimmed. */
function read(provision: string | null, locale: Locale): string {
  const { container, unmount } = renderWithIntl(<ProvisionName provision={provision} />, { locale });
  try {
    return (container.textContent ?? '').trim();
  } finally {
    unmount();
  }
}

describe('provision-is-a-lookup', () => {
  it('A KNOWN CODE RENDERS ITS APPROVED LABEL, IN BOTH LOCALES — the VALUE, never the key, and never empty', () => {
    const approved = requireSubjects('the approved provision labels', APPROVED);
    const wrong = approved.flatMap(({ code, he, en }) => {
      const readings: [Locale, string, string][] = [
        ['he', read(code, 'he'), he],
        ['en', read(code, 'en'), en],
      ];
      return readings.flatMap(([locale, shown, want]) => {
        // Three ways one reading can be wrong, kept apart so the failure says WHICH: a placeholder that renders
        // nothing, a lookup that fell through to the raw code, and a label that is simply not the approved word.
        if (shown === '') return [`${code} ${locale}: renders EMPTY`];
        if (shown === code) return [`${code} ${locale}: renders its own code, so the lookup did not resolve`];
        return shown === want ? [] : [`${code} ${locale}: ${shown} — expected ${want}`];
      });
    });
    // `sample` is the FLOOR: a concrete approved value, so a component that rendered nothing at all cannot
    // reach `wrong: []` by having nothing to be wrong about. `examined` shows the work the loop did.
    expect({ wrong, examined: approved.length * 2, sample: read('NUREMBERG_1', 'he') }).toEqual({
      wrong: [],
      examined: 24,
      sample: 'קוד נירנברג, סעיף 1',
    });
  });

  it('A CODE WITH NO LABEL RENDERS THE RAW CODE AND DOES NOT THROW — never a throw, never blank', () => {
    // THE AGREED FALLBACK (the researcher, 2026-09-19). A missing message THROWS in this harness and on the
    // server alike (`test/render.tsx` :61 and :112 rethrow), so an unguarded read would take the whole page
    // down the day a provision reaches the backend table before its two strings reach the catalogue. A reader
    // seeing `NUREMBERG_11` beats a reader seeing a 500.
    expect({
      unknownRendersTheRawCode: read(UNKNOWN, 'he'),
      unknownInEnglishToo: read(UNKNOWN, 'en'),
      // THE POSITIVE CONTROL, in the same `expect()`: the identical read over a code the catalogue HOLDS must
      // return the LABEL. A lookup blinded by a wrong namespace answers the raw code for EVERYTHING — which is
      // exactly what the two lines above assert — and it fails HERE instead of passing as a fallback.
      controlReturnsTheLabel: read('NUREMBERG_1', 'he'),
      // A thesis with no provision renders nothing at all, in either spelling of nothing.
      nullRendersNothing: read(null, 'he'),
      emptyRendersNothing: read('', 'he'),
    }).toEqual({
      unknownRendersTheRawCode: 'NUREMBERG_11',
      unknownInEnglishToo: 'NUREMBERG_11',
      controlReturnsTheLabel: 'קוד נירנברג, סעיף 1',
      nullRendersNothing: '',
      emptyRendersNothing: '',
    });
  });
});
