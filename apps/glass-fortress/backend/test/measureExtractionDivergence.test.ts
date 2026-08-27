const trackedFindFirst = jest.fn();
const snapshotFindMany = jest.fn();
const diffFindMany = jest.fn();

jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation((html: string) => ({
    window: { document: { body: { innerHTML: html } } },
  })),
}));
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn().mockImplementation(() => ({ parse: () => null })),
}));
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findFirst: trackedFindFirst },
    urlSnapshot: { findMany: snapshotFindMany },
    urlVersionDiff: { findMany: diffFindMany },
  },
}));

import { measureExtractionDivergence } from '../src/services/measureExtractionDivergence';

const URL = 'https://corona.health.gov.il/vaccine-for-covid/';

/** Long enough to clear the 40-character floor, as a real claim would be. */
const SURVIVING_SENTENCE =
  'בישראל מאושרים לשימוש שלושה תרכיבי חיסונים להגנה מפני נגיף הקורונה: פייזר, מודרנה ואסטרהזניקה.';
const GENUINELY_REMOVED =
  'המידע הזה הוסר מן הדף לחלוטין ואינו מופיע בשום צילום מאוחר יותר של העמוד הזה.';

const diff = (over: Record<string, unknown> = {}) => ({
  id: 'diff-1',
  beforeDate: '2022-07-24',
  afterDate: '2022-08-05',
  rawDeletedText: '[]',
  rawAddedText: '[]',
  beforeSnapshot: { rawText: 'before document' },
  afterSnapshot: { rawText: 'after document' },
  ...over,
});

beforeEach(() => {
  trackedFindFirst.mockResolvedValue({ id: 'tracked-1' });
  snapshotFindMany.mockResolvedValue([]);
  diffFindMany.mockResolvedValue([]);
});

describe('measureExtractionDivergence — per-diff verdicts', () => {
  it('CONTRADICTS a removal when the page still said it', async () => {
    diffFindMany.mockResolvedValue([
      diff({
        rawDeletedText: JSON.stringify([SURVIVING_SENTENCE]),
        afterSnapshot: { rawText: `כותרת\n${SURVIVING_SENTENCE}\nעוד טקסט` },
      }),
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.diffs[0]?.verdict).toBe('CONTRADICTED');
    expect(report.diffs[0]?.contradicted[0]?.side).toBe('REMOVED');
    expect(report.summary.diffsContradicted).toBe(1);
  });

  it('lets a genuine removal SURVIVE', async () => {
    diffFindMany.mockResolvedValue([
      diff({
        rawDeletedText: JSON.stringify([GENUINELY_REMOVED]),
        afterSnapshot: { rawText: 'a document that says something else entirely' },
      }),
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.diffs[0]?.verdict).toBe('SURVIVES');
    expect(report.summary.diffsContradicted).toBe(0);
  });

  it('finds a contradiction INSIDE a chunk whose other content really was removed', async () => {
    // The regression guard for a real mistake in this very file. Matching whole
    // chunks reported 2 of 81 contradictions on staging and MISSED the case this
    // work exists for: the FDA line survived on the 2022-08-05 page, but the chunk
    // reported as removed around it also held text that genuinely went, so the
    // chunk as a unit is absent from the after document and the contradiction hid
    // inside it. Sentence granularity found 7. A measurement is only as honest as
    // its resolution.
    diffFindMany.mockResolvedValue([
      diff({
        rawDeletedText: JSON.stringify([`${GENUINELY_REMOVED} ${SURVIVING_SENTENCE}`]),
        afterSnapshot: { rawText: `כותרת אחרת\n${SURVIVING_SENTENCE}` },
      }),
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.diffs[0]?.verdict).toBe('CONTRADICTED');
    expect(report.diffs[0]?.contradicted[0]?.excerpt).toContain('פייזר, מודרנה ואסטרהזניקה');
  });

  it('reports one contradiction per chunk, not one per sentence inside it', async () => {
    diffFindMany.mockResolvedValue([
      diff({
        rawDeletedText: JSON.stringify([`${SURVIVING_SENTENCE} ${SURVIVING_SENTENCE}`]),
        afterSnapshot: { rawText: SURVIVING_SENTENCE },
      }),
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.diffs[0]?.contradicted).toHaveLength(1);
  });

  it('ignores fragments too short to match anything but coincidence', async () => {
    diffFindMany.mockResolvedValue([
      diff({
        rawDeletedText: JSON.stringify(['החיסון']),
        afterSnapshot: { rawText: 'החיסון ניתן בשתי מנות' },
      }),
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.diffs[0]?.verdict).toBe('SURVIVES');
  });

  it('checks an ADDED chunk against the BEFORE document, not the after one', async () => {
    diffFindMany.mockResolvedValue([
      diff({
        rawAddedText: JSON.stringify([SURVIVING_SENTENCE]),
        beforeSnapshot: { rawText: `כבר היה שם: ${SURVIVING_SENTENCE}` },
        afterSnapshot: { rawText: 'irrelevant' },
      }),
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.diffs[0]?.contradicted[0]?.side).toBe('ADDED');
  });

  it('reports UNCHECKABLE, never SURVIVES, when a diff references no capture', async () => {
    // The distinction the whole plan turns on: "could not be checked" must never
    // be counted as "checked and fine". A diff with nothing behind it is
    // unexamined, and the summary must say so rather than quietly passing it.
    //
    // The scenario is a MISSING CAPTURE, not a capture missing its document:
    // beforeSnapshotId/afterSnapshotId are optional FKs, while `rawText` is NOT
    // NULL since 20260827120000_snapshot_document_required. That is §3 exactly —
    // UNAVAILABLE is a verdict about a CHECK, never about mandatory DATA.
    diffFindMany.mockResolvedValue([
      diff({
        rawDeletedText: JSON.stringify([SURVIVING_SENTENCE]),
        afterSnapshot: null,
      }),
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.diffs[0]?.verdict).toBe('UNCHECKABLE');
    expect(report.summary.diffsUncheckable).toBe(1);
    expect(report.summary.diffsChecked).toBe(0);
    expect(report.summary.diffsContradicted).toBe(0);
  });
});

describe('measureExtractionDivergence — per-snapshot retention', () => {
  it('measures what the extraction kept, over every capture without exception', async () => {
    // No "holds no document" fixture and no counter for one. `rawText` is NOT
    // NULL, so the measurement is TOTAL over captures: every row that exists is
    // measured, and there is no residual category for the summary to report.
    snapshotFindMany.mockResolvedValue([
      {
        id: 's1',
        snapshotDate: '2022-08-05',
        waybackTimestamp: '20220805053301',
        fullText: 'kept',
        rawText: 'kept and dropped',
      },
      {
        id: 's2',
        snapshotDate: '2022-09-06',
        waybackTimestamp: '20220906232435',
        fullText: 'half',
        rawText: 'half of it',
      },
    ]);

    const report = await measureExtractionDivergence(URL);

    expect(report.summary.snapshotsMeasured).toBe(2);
    expect(report.snapshots[0]?.retainedPercent).toBe(25);
  });

  it('refuses a URL it does not track rather than reporting an empty all-clear', async () => {
    trackedFindFirst.mockResolvedValue(null);
    await expect(measureExtractionDivergence('https://example.test/')).rejects.toThrow(
      'No tracked URL found',
    );
  });
});
