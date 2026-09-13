import { formatVerbatimRate, verbatimRate, type AssessedRoundRow } from '../src/lib/assessorVerbatimRate';

// ---------------------------------------------------------------------------
// THE INSTRUMENT, OBSERVED TO FAIL — thesis A7 :1616–:1618: "None is proven until
// it has been observed to FAIL … each lands with the breakage that makes it exit
// non-zero, recorded in its test."
//
// A READ-ONLY MEASUREMENT EXITS 0 WHATEVER IT MEASURES, so what is broken into is
// THE COUNT, in two arms:
//   (i)  THE VACUITY ARM — A7 :1656–:1657, "a pass that examined nothing says
//        zero, never nothing": over no rounds at all it must report 0 examined and
//        say the rate has no value, never print a blank or a flattering 0%.
//   (ii) THE MISCOUNT — over N rounds of which K fail the substring check, it must
//        report exactly K / N.
//
// That is why the counting is a PURE function in `lib/` and not inline in the
// script: the script cannot run off a deployment, so a decoy could never be
// planted in it. Its other half — `runOperationalScript` and the environment
// stated twice — is held by `test/operationalScriptsGuarded.test.ts`.
// ---------------------------------------------------------------------------

const round = (sequence: number, quoteVerified: boolean[]): AssessedRoundRow => ({
  framingId: 'framing-1',
  sequence,
  content: {
    contradictions: quoteVerified.map((v, i) => ({
      researcherClaim: `טענה ${String(i)}`,
      quoteVerified: v,
      whatEvidenceShows: 'מה שהראיה מראה',
      record: '[1]',
      phraseVerified: 'PRESENT',
      phraseVerifiedReason: null,
    })),
    elements: [],
  },
});

describe("the framing assessor's verbatim rate — thesis flows §13 :1203, A7 :1666", () => {
  // (i) THE VACUITY ARM.
  it('over NO rounds it says ZERO examined and NO rate — never a blank, never a flattering 0%', () => {
    const report = verbatimRate([]);
    expect([report.roundsExamined, report.contradictionsExamined, report.notVerbatim]).toEqual([0, 0, 0]);
    // 0/0 printed as "0.0000" would read as "the assessor never paraphrased
    // anyone" when nothing was ever checked. The COUNTS say zero; the RATE says
    // it has no value.
    expect(report.rate).toBeNull();
    expect(formatVerbatimRate(report)).toContain('nothing was examined');
    expect(formatVerbatimRate(report)).toMatch(/contradictions examined: 0/);
  });

  it('over rounds that carry NO contradiction it still says zero, and the rounds are counted', () => {
    const report = verbatimRate([round(1, []), round(2, [])]);
    expect([report.roundsExamined, report.contradictionsExamined, report.rate]).toEqual([2, 0, null]);
  });

  // (ii) THE MISCOUNT ARM — N and K are deliberately not equal and not halves, so
  // an off-by-one or a denominator taken from the ROUNDS rather than the
  // CONTRADICTIONS is visible in the number.
  it('over 3 rounds holding 5 contradictions of which 2 are not verbatim, it reports 2 / 5', () => {
    const report = verbatimRate([
      round(1, [true, false]),
      round(2, [true]),
      round(3, [false, true]),
    ]);
    expect([report.roundsExamined, report.contradictionsExamined, report.notVerbatim]).toEqual([3, 5, 2]);
    expect(report.rate).toBe(0.4);
    expect(formatVerbatimRate(report)).toContain('40.00%');
  });

  // A SILENT FILTER HERE WOULD SHRINK THE DENOMINATOR AND IMPROVE THE RATE, which
  // is the one direction a measurement must never fail in.
  it('counts a MALFORMED round rather than dropping it, and keeps it out of the rate', () => {
    const report = verbatimRate([
      round(1, [false]),
      { framingId: 'framing-1', sequence: 2, content: 'not an object' },
      { framingId: 'framing-1', sequence: 3, content: { contradictions: [{ quoteVerified: 'yes' }] } },
    ]);
    expect([report.roundsExamined, report.contradictionsExamined, report.notVerbatim, report.malformed]).toEqual([
      3, 1, 1, 2,
    ]);
    expect(report.rate).toBe(1);
  });
});
