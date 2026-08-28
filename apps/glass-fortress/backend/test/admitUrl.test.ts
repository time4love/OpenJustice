jest.mock('../src/lib/prisma', () => ({
  prisma: { trackedUrl: { findUnique: jest.fn(), upsert: jest.fn() } },
}));
jest.mock('../src/services/recordUrlAssessment', () => ({
  recordUrlAssessment: jest.fn(),
}));
jest.mock('../src/services/ScanRelevanceAgent', () => ({
  ScanRelevanceAgent: jest.fn().mockImplementation(() => ({
    checkRelevance: (...a: unknown[]) => mockCheckRelevance(...a),
  })),
}));

const mockCheckRelevance = jest.fn();

import { prisma } from '../src/lib/prisma';
import { recordUrlAssessment } from '../src/services/recordUrlAssessment';
import { admitUrl } from '../src/services/admitUrl';

const findUnique = prisma.trackedUrl.findUnique as unknown as jest.Mock;
const upsert = prisma.trackedUrl.upsert as unknown as jest.Mock;
const record = recordUrlAssessment as unknown as jest.Mock;

const URL_ = 'https://gov.example/page';

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(null);
  upsert.mockResolvedValue({ id: 'tracked-1' });
  record.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// THESE TEST THE CALLER, NOT THE RECORDER.
//
// Written after a mutation SURVIVED: making admitUrl return UNREADABLE WITHOUT
// recording it passed every test, because the existing ones exercise
// recordUrlAssessment directly and nothing asserted that admitUrl CALLS it.
//
// That is the THIRD time this session a mutation survived the same way — the
// route not recording an admit, the scraper passing a wrong predecessor id, and
// now this. Testing a collaborator in isolation says nothing about whether its
// caller reaches it, and "the unit is covered" reads as "the behaviour is
// covered" until something silently stops happening.
// ---------------------------------------------------------------------------
describe('admitUrl records a verdict for every outcome', () => {
  it('records ON_MISSION and creates the TrackedUrl', async () => {
    mockCheckRelevance.mockResolvedValue({
      isRelevant: true,
      reason: 'רלוונטי.',
      contentChars: 120,
      contentTruncated: false,
    });

    const out = await admitUrl({ url: URL_, fetchContent: async () => 'content' });

    expect(out).toEqual({ admitted: true, trackedUrlId: 'tracked-1', alreadyTracked: false });
    expect(record.mock.calls[0][0].verdict).toBe('ON_MISSION');
    expect(upsert).toHaveBeenCalled();
  });

  it('records OFF_MISSION and creates NO TrackedUrl', async () => {
    mockCheckRelevance.mockResolvedValue({
      isRelevant: false,
      reason: 'ספורט.',
      contentChars: 15,
      contentTruncated: false,
    });

    const out = await admitUrl({ url: URL_, fetchContent: async () => 'football' });

    expect(out.admitted).toBe(false);
    expect(record.mock.calls[0][0].verdict).toBe('OFF_MISSION');
    // The refusal is recorded and the corpus is untouched.
    expect(upsert).not.toHaveBeenCalled();
  });

  it('RECORDS UNREADABLE rather than returning an absence', async () => {
    // §3 stores a verdict about a CHECK rather than omitting it. Without a row,
    // "did we try to admit this URL?" is unanswerable — the
    // never-looked-versus-nothing-there family at the front door of the corpus.
    const out = await admitUrl({ url: URL_, fetchContent: async () => null });

    expect(out.admitted).toBe(false);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].verdict).toBe('UNREADABLE');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not run the model when there is nothing to read', async () => {
    await admitUrl({ url: URL_, fetchContent: async () => null });
    // UNREADABLE means nothing was judged. Calling the model on empty input and
    // storing whatever it said would be a verdict about the URL wearing the label
    // of a verdict about the check.
    expect(mockCheckRelevance).not.toHaveBeenCalled();
  });

  it('does not re-assess an already-tracked URL', async () => {
    findUnique.mockResolvedValue({ id: 'tracked-existing' });

    const out = await admitUrl({ url: URL_, fetchContent: async () => 'content' });

    expect(out).toEqual({
      admitted: true,
      trackedUrlId: 'tracked-existing',
      alreadyTracked: true,
    });
    // Re-gating an admitted URL would let a later model reach a different
    // conclusion and strand a corpus already built on it. Changing an admission
    // is a deliberate act — that is what the HUMAN author is for.
    expect(record).not.toHaveBeenCalled();
    expect(mockCheckRelevance).not.toHaveBeenCalled();
  });
});
