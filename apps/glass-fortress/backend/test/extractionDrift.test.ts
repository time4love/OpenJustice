import { compareExtractions } from '../src/lib/extractionDrift';

// ---------------------------------------------------------------------------
// DID A SEGMENT CHANGE SIDES? The researcher's signal, and the tests that matter
// most are the ones where it stays QUIET — a detector that fires on a rotating
// sidebar is one nobody can run unattended.
// ---------------------------------------------------------------------------

const ARTICLE = 'משרד הבריאות אישר את החיסון\nהחיסונים הראשונים הגיעו לישראל';
const FURNITURE = 'עוד בחדשות\nכל הזכויות שמורות';

describe('compareExtractions', () => {
  it('is quiet when nothing changed sides', () => {
    const drift = compareExtractions(
      { keptText: ARTICLE, removedText: FURNITURE },
      { keptText: ARTICLE, removedText: FURNITURE, removedSegments: [] },
    );
    expect(drift.quiet).toBe(true);
    expect(drift.nowRemoved).toEqual([]);
    expect(drift.nowKept).toEqual([]);
  });

  // THE DANGEROUS DIRECTION, and the one nothing else in this system sees
  // directly. The over-match detector infers it from a length ratio against an
  // era norm; this names the text.
  it('fires when article text kept before is removed now, and names the rule', () => {
    const drift = compareExtractions(
      { keptText: ARTICLE, removedText: FURNITURE },
      {
        keptText: 'החיסונים הראשונים הגיעו לישראל',
        removedText: `${FURNITURE}\nמשרד הבריאות אישר את החיסון`,
        removedSegments: [{ selector: 'section.css-greedy', text: 'משרד הבריאות אישר את החיסון' }],
      },
    );
    expect(drift.quiet).toBe(false);
    expect(drift.nowRemoved).toEqual([
      { text: 'משרד הבריאות אישר את החיסון', selector: 'section.css-greedy' },
    ]);
    expect(drift.nowRemovedChars).toBe('משרד הבריאות אישר את החיסון'.length);
  });

  it('fires when furniture removed before is kept now', () => {
    const drift = compareExtractions(
      { keptText: ARTICLE, removedText: FURNITURE },
      { keptText: `${ARTICLE}\nכל הזכויות שמורות`, removedText: 'עוד בחדשות', removedSegments: [] },
    );
    expect(drift.nowKept).toEqual(['כל הזכויות שמורות']);
  });

  // THE DISCRIMINATION THE WHOLE SIGNAL RESTS ON. An editorial edit removes the
  // text from the DOCUMENT, so it lands on neither side and must not fire — this
  // platform exists to detect page changes, and confusing one with a rule failure
  // would make the detector unusable on exactly the pages that matter.
  it('does NOT fire when text was edited out of the page altogether', () => {
    const drift = compareExtractions(
      { keptText: ARTICLE, removedText: FURNITURE },
      { keptText: 'החיסונים הראשונים הגיעו לישראל', removedText: FURNITURE, removedSegments: [] },
    );
    expect(drift.quiet).toBe(true);
  });

  // A ROTATING SIDEBAR IS THE COMMON CASE ON A NEWS PAGE. Both captures remove a
  // strip of headlines and the headlines differ entirely; nothing changed sides.
  it('does NOT fire when removed furniture merely rotates', () => {
    const drift = compareExtractions(
      { keptText: ARTICLE, removedText: 'כותרת א\nכותרת ב' },
      { keptText: ARTICLE, removedText: 'כותרת ג\nכותרת ד', removedSegments: [] },
    );
    expect(drift.quiet).toBe(true);
  });

  it('does NOT fire on whitespace differences alone', () => {
    const drift = compareExtractions(
      { keptText: 'פסקה   עם   רווחים', removedText: FURNITURE },
      { keptText: 'פסקה עם רווחים', removedText: FURNITURE, removedSegments: [] },
    );
    expect(drift.quiet).toBe(true);
  });

  it('reports both directions at once, and never a combined score', () => {
    const drift = compareExtractions(
      { keptText: 'כותרת\nגוף הכתבה', removedText: 'פוטר' },
      {
        keptText: 'כותרת\nפוטר',
        removedText: 'גוף הכתבה',
        removedSegments: [{ selector: '.greedy', text: 'גוף הכתבה' }],
      },
    );
    expect(drift.nowRemoved.map((s) => s.text)).toEqual(['גוף הכתבה']);
    expect(drift.nowKept).toEqual(['פוטר']);
  });

  it('leaves the selector null when nothing accounts for the segment', () => {
    const drift = compareExtractions(
      { keptText: 'גוף הכתבה', removedText: '' },
      { keptText: '', removedText: 'גוף הכתבה', removedSegments: [] },
    );
    expect(drift.nowRemoved).toEqual([{ text: 'גוף הכתבה', selector: null }]);
  });

  // A KNOWN BLIND SPOT, HELD AS A TEST so it is not rediscovered as a surprise.
  // A redesign that introduces furniture which was NEVER removed before leaves
  // nothing to change sides. Kept text GROWS instead, which is the length signal's
  // job — this one is silent, and correctly so.
  it('is silent when a redesign brings furniture that was never removed before', () => {
    const drift = compareExtractions(
      { keptText: ARTICLE, removedText: FURNITURE },
      {
        keptText: `${ARTICLE}\nתפריט חדש לגמרי\nבאנר חדש`,
        removedText: FURNITURE,
        removedSegments: [],
      },
    );
    expect(drift.quiet).toBe(true);
  });
});
