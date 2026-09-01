import { compareKeptText, attributeRemoval } from '../src/lib/claimSurvival';

describe('compareKeptText — the union ruleset\'s one risk, made checkable', () => {
  it('reports survival when the later ruleset kept everything the earlier one did', () => {
    const before = 'כותרת\nפסקה ראשונה\nפסקה שנייה';
    const result = compareKeptText(before, before);
    expect(result.survived).toBe(true);
    expect(result.noLongerKept).toEqual([]);
    expect(result.noLongerKeptChars).toBe(0);
  });

  // THE CHECK DOES NOT KNOW WHAT IT IS LOOKING AT, ON PURPOSE. A correction that
  // removes furniture the earlier marking missed produces the SAME observation as
  // one that removes article text: a segment kept before and gone now. Deciding
  // which is the researcher's act, so the check reports the change and refuses to
  // classify it. A version that guessed would hide the question it exists to ask.
  it('reports newly removed furniture too, rather than guessing it was harmless', () => {
    const before = 'ראשי חדשות ספורט\nכותרת\nפסקה ראשונה';
    const after = 'כותרת\nפסקה ראשונה';
    const result = compareKeptText(before, after);
    expect(result.survived).toBe(false);
    expect(result.noLongerKept).toEqual(['ראשי חדשות ספורט']);
  });

  it('names the segments that vanished, in order', () => {
    const before = 'כותרת\nמשרד הבריאות אישר את החיסון\nפסקה שנייה';
    const after = 'כותרת\nפסקה שנייה';
    const result = compareKeptText(before, after);
    expect(result.survived).toBe(false);
    expect(result.noLongerKept).toEqual(['משרד הבריאות אישר את החיסון']);
    expect(result.noLongerKeptChars).toBe('משרד הבריאות אישר את החיסון'.length);
  });

  // THE CASE A SET COMPARISON CANNOT SEE. A page can hold the same line twice —
  // a heading repeated in a summary, a date on two items. If one copy is removed
  // and the other survives, a set still contains the string and reports nothing
  // missing. Counting occurrences is what makes a PARTIAL loss visible.
  it('detects a partial loss when a repeated line loses one of its copies', () => {
    const before = 'תאריך\nגוף הכתבה\nתאריך';
    const after = 'תאריך\nגוף הכתבה';
    const result = compareKeptText(before, after);
    expect(result.survived).toBe(false);
    expect(result.noLongerKept).toEqual(['תאריך']);
  });

  it('does not call a whitespace difference a loss', () => {
    // Extraction line breaks are stable; internal spacing is not. A segment that
    // differs only by a doubled space did not disappear.
    expect(compareKeptText('כותרת\nפסקה   עם   רווחים', 'כותרת\nפסקה עם רווחים').survived).toBe(true);
  });

  it('ignores blank lines rather than reporting them as lost content', () => {
    expect(compareKeptText('כותרת\n\n\nפסקה', 'כותרת\nפסקה').survived).toBe(true);
  });
});

describe('attributeRemoval — which added mark could account for it', () => {
  const removed = [
    { selector: 'section.css-new', text: 'משרד הבריאות אישר את החיסון' },
    { selector: '#main-footer', text: 'כל הזכויות שמורות' },
  ];

  it('names the ADDED selector whose removed text contains the lost segment', () => {
    expect(attributeRemoval(['משרד הבריאות אישר את החיסון'], removed, ['section.css-new'])).toEqual([
      { selector: 'section.css-new', segments: ['משרד הבריאות אישר את החיסון'] },
    ]);
  });

  // A selector already in force when the capture was ACCEPTED cannot be what
  // changed, so naming it would send the researcher to undo a mark that is not
  // the cause.
  it('never attributes a loss to a selector that was already in force', () => {
    expect(attributeRemoval(['כל הזכויות שמורות'], removed, ['section.css-new'])).toEqual([]);
  });

  it('returns nothing when no added selector accounts for the loss', () => {
    // Real and worth reporting as unattributed: the text may have moved rather
    // than been removed, which is a different finding.
    expect(attributeRemoval(['טקסט שלא הוסר'], removed, ['section.css-new'])).toEqual([]);
  });
});
