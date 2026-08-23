// ---------------------------------------------------------------------------
// Check 7 (every sentence naming a key figure is hedged in that sentence) and
// check 8 (the public-interest statement is present and non-trivial).
//
// Check 7 is deliberately deterministic and per SENTENCE. The cases that matter:
// an unhedged sentence fails; the same sentence hedged passes; and a document
// that hedges once and asserts flatly elsewhere FAILS — "contains a hedge
// somewhere" is the trivial reading this check exists to reject.
// ---------------------------------------------------------------------------

import {
  checkFiguresHedged,
  checkPublicInterestStatement,
  splitSentences,
  HEDGE_MARKERS,
  MAX_SENTENCE_LENGTH,
  MIN_PUBLIC_INTEREST_STATEMENT_LENGTH,
} from '../src/lib/publicationLanguage';

const FIGURE = 'נחמן אש';

function paragraph(...inline: ({ text: string } | { figure: string })[]) {
  return {
    type: 'paragraph',
    content: inline.map((i) =>
      'figure' in i
        ? { type: 'keyFigureMention', attrs: { id: i.figure, label: i.figure } }
        : { type: 'text', text: i.text },
    ),
  };
}

function doc(...content: unknown[]) {
  return { type: 'doc', content };
}

describe('checkFiguresHedged (check 7)', () => {
  it('fails a sentence naming a key figure with no hedge, and passes the same sentence hedged', () => {
    const flat = doc(paragraph({ figure: FIGURE }, { text: ' הסתיר את הנתונים מהציבור.' }));
    const hedged = doc(paragraph({ text: 'לכאורה, ' }, { figure: FIGURE }, { text: ' הסתיר את הנתונים מהציבור.' }));

    const flatResult = checkFiguresHedged(flat, [FIGURE]);
    expect(flatResult.passed).toBe(false);
    expect(flatResult.unhedged).toHaveLength(1);
    expect(flatResult.unhedged[0].figures).toEqual([FIGURE]);
    expect(flatResult.unhedged[0].text).toContain('הסתיר');

    expect(checkFiguresHedged(hedged, [FIGURE]).passed).toBe(true);
  });

  it('is per sentence: hedging once and asserting flatly elsewhere fails', () => {
    const d = doc(
      paragraph({ text: 'ייתכן כי ' }, { figure: FIGURE }, { text: ' ידע על הממצאים. ' }, { figure: FIGURE }, { text: ' הורה למחוק אותם.' }),
      paragraph({ text: 'על פי המסמכים, המשרד עדכן את הדף.' }),
    );

    const r = checkFiguresHedged(d, [FIGURE]);
    expect(r.passed).toBe(false);
    expect(r.sentences).toHaveLength(2);
    expect(r.unhedged).toHaveLength(1);
    expect(r.unhedged[0].text).toBe(`${FIGURE} הורה למחוק אותם.`);
  });

  it('recognises every documented hedge marker', () => {
    for (const marker of HEDGE_MARKERS) {
      const d = doc(paragraph({ text: `${marker} ` }, { figure: FIGURE }, { text: ' פעל בניגוד להנחיות.' }));
      expect(checkFiguresHedged(d, [FIGURE]).passed).toBe(true);
    }
  });

  it('catches a figure named in plain text, not only as a mention chip', () => {
    const d = doc(paragraph({ text: `${FIGURE} אישר את הפרסום ללא בדיקה.` }));
    expect(checkFiguresHedged(d, [FIGURE]).passed).toBe(false);
  });

  it('ignores a block that is only figure chips — the trailing key-figure index is a citation list, not a sentence', () => {
    const d = doc(
      paragraph({ text: 'על פי המסמכים, ההנחיה שונתה.' }),
      paragraph({ figure: FIGURE }, { figure: 'שרון אלרעי-פרייס' }),
    );
    const r = checkFiguresHedged(d, [FIGURE, 'שרון אלרעי-פרייס']);
    expect(r.passed).toBe(true);
    expect(r.sentences).toHaveLength(0);
  });

  it('passes a document that names nobody', () => {
    const d = doc(paragraph({ text: 'המשרד שינה את הדף בין שתי גרסאות.' }));
    const r = checkFiguresHedged(d, [FIGURE]);
    expect(r.passed).toBe(true);
    expect(r.sentences).toHaveLength(0);
  });

  it('checks list items and headings as sentences too', () => {
    const d = doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: `${FIGURE} והמחיקה` }] },
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph({ figure: FIGURE }, { text: ' חתם על ההנחיה.' })] },
        ],
      },
    );
    const r = checkFiguresHedged(d, [FIGURE]);
    expect(r.unhedged.map((s) => s.text)).toEqual([`${FIGURE} והמחיקה`, `${FIGURE} חתם על ההנחיה.`]);
  });
});

describe('checkFiguresHedged — unpunctuated runs', () => {
  it('fails a figure-naming unit longer than the cap even if it contains a hedge — one hedge must not cover a whole run', () => {
    const filler = 'ועוד מילים '.repeat(40);
    expect(filler.length).toBeGreaterThan(MAX_SENTENCE_LENGTH);
    const d = doc(paragraph({ text: `לכאורה ${FIGURE} ${filler}` }));
    const r = checkFiguresHedged(d, [FIGURE]);
    expect(r.passed).toBe(false);
    expect(r.unhedged[0].tooLong).toBe(true);
  });

  it('passes the same content once it is punctuated into sentences', () => {
    const d = doc(paragraph({ text: `לכאורה ${FIGURE} פעל כך. ${'ועוד מילים '.repeat(40)}` }));
    expect(checkFiguresHedged(d, [FIGURE]).passed).toBe(true);
  });
});

describe('splitSentences', () => {
  it('splits on terminal punctuation followed by whitespace, not on decimals', () => {
    expect(splitSentences('הראשון. השני? השלישי! 2.5 אחוז נותרו')).toEqual([
      'הראשון.',
      'השני?',
      'השלישי!',
      '2.5 אחוז נותרו',
    ]);
  });
});

describe('checkPublicInterestStatement (check 8)', () => {
  it('fails when absent or blank', () => {
    expect(checkPublicInterestStatement(null).passed).toBe(false);
    expect(checkPublicInterestStatement('   ').passed).toBe(false);
  });

  it('fails a trivial statement and names the floor', () => {
    const r = checkPublicInterestStatement('חשוב לציבור.');
    expect(r.passed).toBe(false);
    expect(r.reason).toContain(String(MIN_PUBLIC_INTEREST_STATEMENT_LENGTH));
  });

  it('passes a real statement', () => {
    const r = checkPublicInterestStatement(
      'הציבור זכאי לדעת כיצד שונו הנחיות בטיחות רשמיות בזמן אמת, משום שעל בסיסן התקבלו החלטות רפואיות.',
    );
    expect(r.passed).toBe(true);
    expect(r.reason).toBeNull();
  });
});
