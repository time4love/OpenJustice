import { formatPhraseVerifiedRate, phraseVerifiedRate, type PhraseVerifiedRow } from '../src/lib/phraseVerifiedRate';

// ---------------------------------------------------------------------------
// THE INSTRUMENT, OBSERVED TO FAIL — thesis A7 :1616–:1618, :1667; `test/assessorVerbatimRate.test.ts`' shape.
//
// A READ-ONLY MEASUREMENT EXITS 0 WHATEVER IT MEASURES, so what is broken into is THE COUNT:
//   (i)   THE VACUITY ARM — over nothing, zero examined and NO rate, never a blank or a flattering 0%;
//   (ii)  THE MISCOUNT — over N rows of both sources with K ABSENT, exactly K over the CHECKED assertions;
//   (iii) UNCHECKED apart — counted, and outside the denominator, which would otherwise shrink the rate the less the
//         audit could check;
//   (iv)  A MALFORMED row counted, never dropped.
// ---------------------------------------------------------------------------

const assessment = (...verdicts: string[]): PhraseVerifiedRow => ({
  source: 'ASSESSMENT',
  content: { contradictions: verdicts.map((phraseVerified) => ({ researcherClaim: 'ט', quoteVerified: true, phraseVerified })) },
});

const analysis = (...verdicts: string[]): PhraseVerifiedRow => ({
  source: 'ANALYSIS',
  content: { counterArguments: verdicts.map((phraseVerified) => ({ quote: 'ט', quoteVerified: true, phraseVerified })), suggestedGaps: [] },
});

describe("the models' absent-phrase rate — thesis flows §13 :1204, A7 :1667", () => {
  it('(i) over NO rows it says ZERO examined and NO rate', () => {
    const report = phraseVerifiedRate([]);
    expect([report.total.rowsExamined, report.total.assertionsExamined, report.total.rate]).toEqual([0, 0, null]);
    expect(formatPhraseVerifiedRate(report)).toContain('nothing was examined');
  });

  it('(ii) over 2 assessments and 2 analyses holding 6 checked assertions of which 2 ABSENT, it reports 2 / 6 — and per source', () => {
    const report = phraseVerifiedRate([
      assessment('PRESENT', 'ABSENT'),
      assessment('PRESENT'),
      analysis('ABSENT', 'PRESENT'),
      analysis('PRESENT'),
    ]);
    expect([report.total.present, report.total.absent, report.total.rate]).toEqual([4, 2, 0.3333]);
    expect([report.assessments.rate, report.analyses.rate]).toEqual([0.3333, 0.3333]);
    expect([report.assessments.rowsExamined, report.analyses.rowsExamined]).toEqual([2, 2]);
    expect(formatPhraseVerifiedRate(report)).toContain('33.33%');
  });

  it('(iii) UNCHECKED is counted apart and kept OUT of the denominator', () => {
    const report = phraseVerifiedRate([analysis('ABSENT', 'UNCHECKED', 'UNCHECKED', 'PRESENT')]);
    expect([report.total.assertionsExamined, report.total.unchecked, report.total.rate]).toEqual([4, 2, 0.5]);
  });

  it('(iii′) only UNCHECKED assertions give NO rate — never a 0% built out of nothing checked', () => {
    expect(phraseVerifiedRate([assessment('UNCHECKED')]).total.rate).toBeNull();
  });

  it('(iv) a MALFORMED row is counted and not dropped — a wrong list name, a verdict that is not one of three', () => {
    const report = phraseVerifiedRate([
      analysis('ABSENT'),
      { source: 'ANALYSIS', content: { contradictions: [] } },
      assessment('MAYBE'),
      { source: 'ASSESSMENT', content: 'not an object' },
    ]);
    expect([report.total.rowsExamined, report.total.malformed, report.total.absent, report.total.rate]).toEqual([4, 3, 1, 1]);
  });
});
