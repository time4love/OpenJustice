import { VectorStoreService, EvidenceMetadata } from '../src/services/VectorStoreService';

// ---------------------------------------------------------------------------
// Unit tests for VectorStoreService.getTimeline()
// ---------------------------------------------------------------------------

/** Build a minimal evidence record for test fixtures. */
function makeEvidence(
  fileHash: string,
  evidenceDate: string,
  targetEntity = 'Ministry of Health',
  tier = 'Tier 2: Material',
) {
  return {
    content: `Evidence content for ${fileHash}`,
    metadata: {
      fileHash,
      category: 'Side Effect Withholding',
      tier,
      summary: `Summary for ${fileHash}`,
      targetEntity,
      evidenceDate,
      timestamp: Date.now(),
    } satisfies EvidenceMetadata,
    score: 0.9,
  };
}

// Fixture records — various dates and one "Unknown"
const EARLY  = makeEvidence('0xaaa', '2020-12-15');
const MID    = makeEvidence('0xbbb', '2021-06-01');
const LATE   = makeEvidence('0xccc', '2022-03-10');
const UNKNOWN_DATE = makeEvidence('0xddd', 'Unknown');
const FDA_EVIDENCE = makeEvidence('0xeee', '2021-09-20', 'FDA');

// ---------------------------------------------------------------------------
// Mock VectorStoreService internals
// ---------------------------------------------------------------------------

/**
 * Build a VectorStoreService instance whose private `store` is replaced with
 * a mock that returns the given records from `similaritySearchWithScore`.
 */
function makeService(records: typeof EARLY[]): VectorStoreService {
  // PineconeStore returns [Document, score] tuples
  const storeMock = {
    similaritySearchWithScore: jest.fn().mockResolvedValue(
      records.map((r) => [
        { pageContent: r.content, metadata: r.metadata },
        r.score,
      ]),
    ),
  };
  // Access the private constructor via casting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new (VectorStoreService as any)(storeMock);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VectorStoreService.getTimeline()', () => {
  it('returns records sorted chronologically ascending', async () => {
    const svc = makeService([LATE, EARLY, MID]);
    const results = await svc.getTimeline();

    expect(results.map((r) => r.metadata.evidenceDate)).toEqual([
      '2020-12-15',
      '2021-06-01',
      '2022-03-10',
    ]);
  });

  it('places "Unknown" dates at the end', async () => {
    const svc = makeService([MID, UNKNOWN_DATE, EARLY]);
    const results = await svc.getTimeline();

    const dates = results.map((r) => r.metadata.evidenceDate);
    expect(dates[dates.length - 1]).toBe('Unknown');
    expect(dates[0]).toBe('2020-12-15');
  });

  it('handles multiple "Unknown" dates without throwing', async () => {
    const unknown2 = makeEvidence('0xfff', 'Unknown');
    const svc = makeService([UNKNOWN_DATE, unknown2, EARLY]);
    const results = await svc.getTimeline();

    expect(results[0].metadata.evidenceDate).toBe('2020-12-15');
    expect(results[1].metadata.evidenceDate).toBe('Unknown');
    expect(results[2].metadata.evidenceDate).toBe('Unknown');
  });

  it('passes no filter when targetEntity is undefined', async () => {
    const svc = makeService([EARLY]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeMock = (svc as any).store;

    await svc.getTimeline();

    const filterArg = storeMock.similaritySearchWithScore.mock.calls[0][2];
    expect(filterArg).toBeUndefined();
  });

  it('passes a targetEntity $eq filter when provided', async () => {
    const svc = makeService([FDA_EVIDENCE]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeMock = (svc as any).store;

    await svc.getTimeline('FDA');

    const filterArg = storeMock.similaritySearchWithScore.mock.calls[0][2];
    expect(filterArg).toEqual({ targetEntity: { $eq: 'FDA' } });
  });

  it('requests up to 100 records from the store', async () => {
    const svc = makeService([EARLY]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storeMock = (svc as any).store;

    await svc.getTimeline();

    const limitArg = storeMock.similaritySearchWithScore.mock.calls[0][1];
    expect(limitArg).toBe(100);
  });

  it('returns an empty array when the store returns nothing', async () => {
    const svc = makeService([]);
    const results = await svc.getTimeline();
    expect(results).toHaveLength(0);
  });

  it('returns all records unfiltered when targetEntity is undefined', async () => {
    const svc = makeService([EARLY, MID, LATE, FDA_EVIDENCE]);
    const results = await svc.getTimeline();
    expect(results).toHaveLength(4);
  });

  it('propagates errors from the underlying store', async () => {
    const storeMock = {
      similaritySearchWithScore: jest.fn().mockRejectedValue(new Error('Pinecone down')),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new (VectorStoreService as any)(storeMock);
    await expect(svc.getTimeline()).rejects.toThrow('Pinecone down');
  });
});
