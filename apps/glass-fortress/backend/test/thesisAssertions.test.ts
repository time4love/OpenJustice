// ---------------------------------------------------------------------------
// What can be pulled out of thesis prose mechanically — and what cannot.
//
// The negative assertions matter as much as the positive ones. Hebrew
// number-word spans are outside what this extracts, one of the four errors in
// the first thesis walk was exactly that shape, and a test asserting it stays
// outside is what keeps UNCHECKABLE_CLASSES honest instead of aspirational.
// ---------------------------------------------------------------------------

import {
  actVerbsIn,
  extractDates,
  extractIntervals,
  extractQuotedPhrases,
  parseDate,
  quotedSpans,
  splitSentences,
  UNCHECKABLE_CLASSES,
} from '../src/lib/thesisAssertions';

describe('splitSentences', () => {
  it('does not split inside a numeric date', () => {
    expect(splitSentences('הטענה הוסרה ב-05.08.2022 מהעמוד.')).toEqual([
      'הטענה הוסרה ב-05.08.2022 מהעמוד.',
    ]);
  });

  it('splits on sentence punctuation followed by whitespace', () => {
    expect(splitSentences('ראשית. שנית! שלישית?')).toEqual(['ראשית.', 'שנית!', 'שלישית?']);
  });
});

describe('parseDate', () => {
  it('reads DD.MM.YYYY as Israeli convention and flags the ambiguity', () => {
    expect(parseDate('05.08.2022')).toEqual({
      raw: '05.08.2022',
      iso: '2022-08-05',
      dayMonthAmbiguous: true,
    });
  });

  it('does not flag ambiguity when the day cannot be a month', () => {
    expect(parseDate('25.08.2022')?.dayMonthAmbiguous).toBe(false);
  });

  it('reads Hebrew month names', () => {
    expect(parseDate('6 בספטמבר 2022')?.iso).toBe('2022-09-06');
  });

  it('reads ISO dates', () => {
    expect(parseDate('2022-09-07')?.iso).toBe('2022-09-07');
  });

  it('rejects a date that does not exist rather than inventing one', () => {
    expect(parseDate('31.02.2022')).toBeNull();
    expect(parseDate('05.13.2022')).toBeNull();
  });
});

describe('extractDates', () => {
  it('finds every shape in one sentence, in order', () => {
    const dates = extractDates('נוספה ב-6 בספטמבר 2022, שונתה ב-2022-09-07 והוסרה ב-05.08.2022.');
    expect(dates.map((d) => d.iso)).toEqual(['2022-09-06', '2022-09-07', '2022-08-05']);
  });

  it('ignores a two-digit year rather than guessing the century', () => {
    expect(extractDates('ב-05.08.22 קרה משהו.')).toEqual([]);
  });
});

describe('actVerbsIn', () => {
  it('finds an act verb', () => {
    expect(actVerbsIn('הטענה הוסרה מהעמוד.')).toEqual(['הוסרה']);
  });

  it('finds one carrying a Hebrew conjunction prefix', () => {
    expect(actVerbsIn('ההצהרה נוספה ושונתה שוב.')).toEqual(expect.arrayContaining(['שונתה']));
  });

  it('finds nothing in a sentence describing a state', () => {
    expect(actVerbsIn('הטענה נעדרה מהעמוד נכון ל-05.08.2022.')).toEqual([]);
  });
});

describe('extractQuotedPhrases', () => {
  it('extracts double-quoted text', () => {
    expect(extractQuotedPhrases('הטענה "נמצאו יעילים ובטוחים לשימוש" הוסרה.')).toEqual([
      'נמצאו יעילים ובטוחים לשימוש',
    ]);
  });

  it('ignores a quotation too short to identify a specific passage', () => {
    expect(extractQuotedPhrases('נאמר "בטוח" בעמוד.')).toEqual([]);
  });

  it('ignores the Hebrew geresh, which is a letter-level mark and not a quotation', () => {
    expect(extractQuotedPhrases("ג'ירפה ארוכת צוואר מאוד מאוד")).toEqual([]);
  });
});

describe('extractIntervals', () => {
  it('reads "בין X ל-Y"', () => {
    const [interval] = extractIntervals('השינוי אירע בין 05.08.2022 ל-06.09.2022.');
    expect(interval.from.iso).toBe('2022-08-05');
    expect(interval.to.iso).toBe('2022-09-06');
  });

  it('reads "בין X לבין Y" with Hebrew dates', () => {
    const [interval] = extractIntervals('בין 5 באוגוסט 2022 לבין 6 בספטמבר 2022 חל שינוי.');
    expect(interval.from.iso).toBe('2022-08-05');
    expect(interval.to.iso).toBe('2022-09-06');
  });

  it('rejects a reversed interval rather than silently swapping the endpoints', () => {
    expect(extractIntervals('בין 06.09.2022 ל-05.08.2022 חל שינוי.')).toEqual([]);
  });
});

describe('the declared blind spots', () => {
  it('does not extract a Hebrew number-word span — the error this tool would have missed', () => {
    // "שישה שבועות" written for a 31-day interval was one of the four errors
    // caught by hand. Nothing here sees it, and UNCHECKABLE_CLASSES says so.
    const sentence = 'הטענה נעדרה מהעמוד במשך שישה שבועות.';
    expect(extractDates(sentence)).toEqual([]);
    expect(extractIntervals(sentence)).toEqual([]);
  });

  it('names Hebrew number-word spans and counts among what it cannot check', () => {
    const joined = UNCHECKABLE_CLASSES.join(' ');
    expect(joined).toContain('שישה שבועות');
    expect(joined).toContain('שבעה תצלומים');
  });
});

// DOCUMENT STEP 34 (R84 chunk 3, S6): check 19 examines "every quoted span" (document A6 :1536; A2 :1315), so the span
// pattern is exported WITHOUT audit_thesis_claims' 12-character floor — ONE pattern, two consumers.
describe('quotedSpans — every quoted span, no floor; extractQuotedPhrases is it filtered', () => {
  it('returns a span shorter than the floor, which extractQuotedPhrases drops', () => {
    const text = 'הוא כתב "קצר" ואז "משפט ארוך בהרבה מהרף".';
    expect(quotedSpans(text)).toEqual(['קצר', 'משפט ארוך בהרבה מהרף']);
    expect(extractQuotedPhrases(text)).toEqual(['משפט ארוך בהרבה מהרף']);
  });
});

// R84 chunk 3, REVIEW's M11: check 19 is a HARD gate over a HEBREW corpus, so every delimiter the ONE pattern knows is
// held by a case of its own — the gershayim above all.
describe('quotedSpans — each delimiter it knows, one case each', () => {
  it.each([
    ['straight "…"', 'הוא כתב "שתי מילים" אז', 'שתי מילים'],
    ['curly “…”', 'הוא כתב “שתי מילים” אז', 'שתי מילים'],
    ['low-9 „…”', 'הוא כתב „שתי מילים” אז', 'שתי מילים'],
    ['guillemets «…»', 'הוא כתב «שתי מילים» אז', 'שתי מילים'],
    ['Hebrew gershayim ״…״', 'הוא כתב ״שתי מילים״ אז', 'שתי מילים'],
  ])('%s', (_label, text, span) => {
    expect(quotedSpans(text)).toEqual([span]);
  });
});
