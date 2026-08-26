// ---------------------------------------------------------------------------
// Previewing a classification without writing one.
//
// The property under test is mostly a NEGATIVE: this tool must not persist
// anything, ever, on any path. A preview that quietly updated the row would be
// worse than no preview — it would answer "what would the classifier say?" by
// destroying the answer you already had, which is exactly the defect that made
// forensics:reclassify unusable for the question.
//
// So the prisma mock deliberately exposes update/create/upsert/delete and the
// tests assert they are never called, rather than omitting them and letting an
// accidental write fail as "not a function" for the wrong reason.
// ---------------------------------------------------------------------------

const mockAnalyzeChange = jest.fn();
const mockFetchCorrelated = jest.fn().mockResolvedValue([]);

jest.mock('../src/services/WaybackScraper', () => ({
  WaybackScraper: jest.fn().mockImplementation(() => ({
    fetchCorrelatedEvidence: (...a: unknown[]) => mockFetchCorrelated(...a),
  })),
  recordScanFinding: jest.fn(),
}));

jest.mock('../src/services/ForensicAgent', () => {
  const actual = jest.requireActual('../src/services/ForensicAgent');
  return {
    ...actual,
    ForensicAgent: jest.fn().mockImplementation(() => ({ analyzeChange: mockAnalyzeChange })),
  };
});

const db = {
  unique: null as Record<string, unknown> | null,
  many: [] as Record<string, unknown>[],
};

const writeSpies = {
  update: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
};

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: {
      findUnique: jest.fn(async () => db.unique),
      findMany: jest.fn(async () => db.many),
      ...writeSpies,
    },
    evidence: { ...writeSpies },
    urlSnapshot: { ...writeSpies },
  },
}));

import {
  previewDiffClassification,
  MAX_PREVIEW_RUNS,
} from '../src/services/previewDiffClassification';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../src/lib/classifierVersion';

function storedDiff(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'diff-1',
    trackedUrlId: 't-1',
    trackedUrl: { id: 't-1', url: 'https://corona.health.gov.il/vaccine-for-covid/' },
    beforeDate: '2025-04-25',
    afterDate: '2025-06-01',
    rawDeletedText: JSON.stringify(['הוסר טקסט אחד', 'הוסר טקסט שני']),
    rawAddedText: JSON.stringify(['נוסף טקסט']),
    deletedText: JSON.stringify([{ summary: 'a', exactQuote: 'a' }]),
    addedText: JSON.stringify([{ summary: 'b', exactQuote: 'b' }]),
    isLegallySignificant: false,
    investigativeCategories: [],
    aiSignificance: 'עדכון תחבירי',
    classifierVersion: 'v2-item-level',
    classifierPromptHash: 'stale-hash',
    summaryVersion: null,
    ...over,
  };
}

function analysis(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deletedItems: [
      { summary: 'ד', exactQuote: 'ד', investigativeCategories: ['INFORMED_CONSENT'], relocated: false },
    ],
    addedItems: [],
    investigativeCategories: ['INFORMED_CONSENT'],
    isLegallySignificant: true,
    legalSignificance: 'הסרת ערוץ דיווח',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.unique = null;
  db.many = [];
  mockFetchCorrelated.mockResolvedValue([]);
});

function expectNoWrites(): void {
  for (const [name, spy] of Object.entries(writeSpies)) {
    expect([name, spy.mock.calls.length]).toEqual([name, 0]);
  }
}

describe('previewDiffClassification — writes nothing', () => {
  it('persists nothing on the success path', async () => {
    db.unique = storedDiff();
    mockAnalyzeChange.mockResolvedValue(analysis());

    const result = await previewDiffClassification({ diffId: 'diff-1', runs: 2 });

    expect(result.status).toBe('OK');
    expectNoWrites();
  });

  it('leaves the stored verdict readable and unchanged in the result', async () => {
    db.unique = storedDiff({ isLegallySignificant: false, aiSignificance: 'עדכון תחבירי' });
    mockAnalyzeChange.mockResolvedValue(analysis({ isLegallySignificant: true }));

    const result = await previewDiffClassification({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    // The fresh run disagrees with the stored row, and the stored row survives.
    expect(result.stored.isLegallySignificant).toBe(false);
    expect(result.stored.aiSignificance).toBe('עדכון תחבירי');
    expect(result.runs[0]?.isLegallySignificant).toBe(true);
    expect(result.agreement.agreesWithStored).toBe(false);
    expectNoWrites();
  });
});

describe('previewDiffClassification — classifier input', () => {
  it('feeds the RAW page text, never the stored items', async () => {
    db.unique = storedDiff();
    mockAnalyzeChange.mockResolvedValue(analysis());

    await previewDiffClassification({ diffId: 'diff-1' });

    const [deletions, additions, url, date] = mockAnalyzeChange.mock.calls[0] as [
      string[],
      string[],
      string,
      string,
    ];
    // rawDeletedText, not deletedText: feeding the classifier its own prior
    // output would ask it to re-judge its conclusions instead of the page.
    expect(deletions).toEqual(['הוסר טקסט אחד', 'הוסר טקסט שני']);
    expect(additions).toEqual(['נוסף טקסט']);
    expect(url).toBe('https://corona.health.gov.il/vaccine-for-covid/');
    expect(date).toBe('2025-06-01');
  });

  it('supplies correlated evidence and reports exactly what it supplied', async () => {
    const correlated = [
      {
        date: '2022-08-21',
        summary: 'תחקיר',
        investigativeCategories: ['WITHHOLDING_INFORMATION'],
        targetEntity: 'Ministry of Health',
        evidenceRole: 'Incriminating',
      },
    ];
    db.unique = storedDiff();
    mockFetchCorrelated.mockResolvedValue(correlated);
    mockAnalyzeChange.mockResolvedValue(analysis());

    const result = await previewDiffClassification({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(mockFetchCorrelated).toHaveBeenCalledWith('2025-06-01', 't-1');
    // Reported, because it is the one input not fixed at scan time: two
    // environments can differ here and neither be stale.
    expect(result.input.correlatedEvidence).toEqual(correlated);
    expect(mockAnalyzeChange.mock.calls[0]?.[4]).toEqual(correlated);
  });

  it('queries correlated evidence once and reuses it across runs', async () => {
    db.unique = storedDiff();
    mockAnalyzeChange.mockResolvedValue(analysis());

    await previewDiffClassification({ diffId: 'diff-1', runs: 3 });

    // Runs must differ only by sampling. Re-querying between them would let the
    // vault change mid-comparison and turn noise measurement into drift.
    expect(mockFetchCorrelated).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeChange).toHaveBeenCalledTimes(3);
    const prompts = mockAnalyzeChange.mock.calls.map((c) => JSON.stringify(c));
    expect(new Set(prompts).size).toBe(1);
  });

  it('tolerates unparseable raw text as nothing to classify', async () => {
    db.unique = storedDiff({ rawDeletedText: 'not json', rawAddedText: '{}' });
    mockAnalyzeChange.mockResolvedValue(analysis());

    const result = await previewDiffClassification({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.input.rawDeletedChunks).toBe(0);
    expect(result.input.rawAddedChunks).toBe(0);
  });
});

describe('previewDiffClassification — runs and agreement', () => {
  it('reports disagreement between runs rather than hiding it', async () => {
    db.unique = storedDiff({ isLegallySignificant: true });
    mockAnalyzeChange
      .mockResolvedValueOnce(analysis({ isLegallySignificant: true }))
      .mockResolvedValueOnce(analysis({ isLegallySignificant: false, investigativeCategories: [] }))
      .mockResolvedValueOnce(analysis({ isLegallySignificant: true }));

    const result = await previewDiffClassification({ diffId: 'diff-1', runs: 3 });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.runs).toHaveLength(3);
    expect(result.agreement.runsSignificant).toBe(2);
    expect(result.agreement.unanimousOnSignificance).toBe(false);
    expect(result.agreement.agreesWithStored).toBe(false);
  });

  it('is unanimous when every run agrees, and says so', async () => {
    db.unique = storedDiff({ isLegallySignificant: true });
    mockAnalyzeChange.mockResolvedValue(analysis({ isLegallySignificant: true }));

    const result = await previewDiffClassification({ diffId: 'diff-1', runs: 2 });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.agreement.unanimousOnSignificance).toBe(true);
    expect(result.agreement.agreesWithStored).toBe(true);
  });

  it('reports the item-count spread across runs', async () => {
    db.unique = storedDiff();
    mockAnalyzeChange
      .mockResolvedValueOnce(analysis({ deletedItems: [], addedItems: [] }))
      .mockResolvedValueOnce(
        analysis({
          deletedItems: [
            { summary: 'a', exactQuote: 'a', investigativeCategories: [], relocated: false },
            { summary: 'b', exactQuote: 'b', investigativeCategories: [], relocated: false },
          ],
          addedItems: [
            { summary: 'c', exactQuote: 'c', investigativeCategories: [], relocated: false },
          ],
        }),
      );

    const result = await previewDiffClassification({ diffId: 'diff-1', runs: 2 });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.agreement.minItems).toBe(0);
    expect(result.agreement.maxItems).toBe(3);
  });

  it('clamps runs to the cap instead of billing whatever was asked for', async () => {
    db.unique = storedDiff();
    mockAnalyzeChange.mockResolvedValue(analysis());

    await previewDiffClassification({ diffId: 'diff-1', runs: 99 });

    expect(mockAnalyzeChange).toHaveBeenCalledTimes(MAX_PREVIEW_RUNS);
  });

  it('clamps a zero or negative run count up to one', async () => {
    db.unique = storedDiff();
    mockAnalyzeChange.mockResolvedValue(analysis());

    await previewDiffClassification({ diffId: 'diff-1', runs: 0 });

    expect(mockAnalyzeChange).toHaveBeenCalledTimes(1);
  });
});

describe('previewDiffClassification — provenance', () => {
  it('flags a stored verdict produced by a different prompt', async () => {
    db.unique = storedDiff({ classifierPromptHash: 'stale-hash' });
    mockAnalyzeChange.mockResolvedValue(analysis());

    const result = await previewDiffClassification({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    // Not comparable as two draws from one distribution — different questions.
    expect(result.classifier.storedMatchesCurrentPrompt).toBe(false);
    expect(result.classifier.version).toBe(CLASSIFIER_VERSION);
    expect(result.classifier.promptHash).toBe(classifierPromptHash());
  });

  it('confirms a match when the stored hash is the current one', async () => {
    db.unique = storedDiff({ classifierPromptHash: classifierPromptHash() });
    mockAnalyzeChange.mockResolvedValue(analysis());

    const result = await previewDiffClassification({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.classifier.storedMatchesCurrentPrompt).toBe(true);
  });

  it('distinguishes "no provenance recorded" from "provenance mismatched"', async () => {
    db.unique = storedDiff({ classifierPromptHash: null, classifierVersion: null });
    mockAnalyzeChange.mockResolvedValue(analysis());

    const result = await previewDiffClassification({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    // null, not false: the row predates provenance, which is a different fact
    // from having been judged by a prompt we can name and rule out.
    expect(result.classifier.storedMatchesCurrentPrompt).toBeNull();
  });
});

describe('previewDiffClassification — resolution', () => {
  it('resolves by url + afterDate so one prompt works in every environment', async () => {
    db.many = [storedDiff({ id: 'env-local-uuid' })];
    mockAnalyzeChange.mockResolvedValue(analysis());

    const result = await previewDiffClassification({
      url: 'https://corona.health.gov.il/vaccine-for-covid/',
      afterDate: '2025-06-01',
    });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.diff.diffId).toBe('env-local-uuid');
  });

  it('reports ambiguity rather than classifying whichever row sorted first', async () => {
    db.many = [
      storedDiff({ id: 'a', beforeDate: '2025-04-25' }),
      storedDiff({ id: 'b', beforeDate: '2025-05-10' }),
    ];

    const result = await previewDiffClassification({
      url: 'https://corona.health.gov.il/vaccine-for-covid/',
      afterDate: '2025-06-01',
    });

    expect(result.status).toBe('AMBIGUOUS');
    if (result.status !== 'AMBIGUOUS') throw new Error('expected AMBIGUOUS');
    expect(result.candidates.map((c) => c.diffId)).toEqual(['a', 'b']);
    // No money spent guessing.
    expect(mockAnalyzeChange).not.toHaveBeenCalled();
  });

  it('explains that ids are per-environment when a diffId does not resolve', async () => {
    db.unique = null;

    const result = await previewDiffClassification({ diffId: 'from-another-env' });

    expect(result.status).toBe('NOT_FOUND');
    expect(result.explanation).toContain('per-environment');
    expect(mockAnalyzeChange).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND for an unmatched url + afterDate without calling the model', async () => {
    db.many = [];

    const result = await previewDiffClassification({
      url: 'https://corona.health.gov.il/vaccine-for-covid/',
      afterDate: '1999-01-01',
    });

    expect(result.status).toBe('NOT_FOUND');
    expect(mockAnalyzeChange).not.toHaveBeenCalled();
  });
});
