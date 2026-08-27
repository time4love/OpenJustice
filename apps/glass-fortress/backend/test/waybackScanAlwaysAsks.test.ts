// ---------------------------------------------------------------------------
// A SCAN THAT FETCHES NOTHING MUST NOT REPORT SUCCESS.
//
// runFullScan's COMPLETED branch served two different questions with one answer:
//
//   within-run   "is there another PAGE of this walk?"      — the sentinel answers it
//   across-run   "has the Archive gained captures since?"   — only CDX can answer it
//
// `totalSnapshots` holds MAX_SNAPSHOTS + 1 as a sentinel meaning "CDX had more",
// so a FINISHED scan always ends below MAX_SNAPSHOTS — that is what finishing
// means. Asked across runs, computeNextFromDate therefore returned null for every
// completed job forever, and runFullScan marked the TrackedUrl COMPLETED and
// returned WITHOUT ONE REQUEST TO THE ARCHIVE.
//
// Staging sat in exactly that state (totalSnapshots: 41), which is why Level 1's
// capture recovery needed its own instrument rather than an ordinary scan.
//
// This gates Level 2 Phase B: routing on "the Archive holds no captures for this
// URL" is impossible while a scan can report success without asking.
// ---------------------------------------------------------------------------

jest.mock('axios');
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));
jest.mock('../src/services/ForensicAgent');
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: { create: jest.fn().mockResolvedValue({ upsertEvidence: jest.fn() }) },
}));

const mockJobFindUnique = jest.fn();
const mockJobUpsert = jest.fn();
const mockTrackedUpdate = jest.fn().mockResolvedValue({});
const mockSnapshotFindFirst = jest.fn();
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    waybackScrapeJob: {
      findUnique: (...a: unknown[]) => mockJobFindUnique(...a),
      upsert: (...a: unknown[]) => mockJobUpsert(...a),
    },
    trackedUrl: { update: (...a: unknown[]) => mockTrackedUpdate(...a) },
    urlSnapshot: { findFirst: (...a: unknown[]) => mockSnapshotFindFirst(...a) },
  },
}));

import { WaybackScraper } from '../src/services/WaybackScraper';

const TRACKED_ID = 'tracked-1';
const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';

/** A job an EARLIER run completed: its final batch was short, as every final batch is. */
function completedJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    status: 'COMPLETED',
    failureReason: null,
    fromDate: null,
    // Staging's real value on 2026-08-27.
    snapshotsList: '[]',
    totalSnapshots: 41,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTrackedUpdate.mockResolvedValue({});
  mockSnapshotFindFirst.mockResolvedValue(null);
  // Nothing left to process, so processJob returns immediately — this suite is
  // about whether the Archive is REACHED, not about what comes back.
  mockJobUpsert.mockResolvedValue({ id: 'job-1', status: 'PENDING' });
});

describe('a fresh scan of an already-completed URL still reaches the Archive', () => {
  it('creates a new batch instead of short-circuiting to COMPLETED', async () => {
    mockJobFindUnique.mockResolvedValue(completedJob());
    const scraper = new WaybackScraper();
    jest.spyOn(scraper, 'processJob').mockResolvedValue({ status: 'COMPLETED' } as never);

    await scraper.runFullScan(TRACKED_ID, URL_);

    // The old code called neither: it updated TrackedUrl to COMPLETED and returned.
    expect(mockJobUpsert).toHaveBeenCalled();
    expect(scraper.processJob).toHaveBeenCalled();
  });

  it('does NOT mark the URL COMPLETED without having processed a batch', async () => {
    mockJobFindUnique.mockResolvedValue(completedJob());
    const scraper = new WaybackScraper();
    const processJob = jest
      .spyOn(scraper, 'processJob')
      .mockResolvedValue({ status: 'COMPLETED' } as never);

    await scraper.runFullScan(TRACKED_ID, URL_);

    const completedWrites = mockTrackedUpdate.mock.calls.filter(
      (c) => (c[0] as { data?: { status?: string } }).data?.status === 'COMPLETED',
    );
    // Any COMPLETED written must come AFTER work, never instead of it.
    if (completedWrites.length > 0) expect(processJob).toHaveBeenCalled();
  });

  it('resumes from one second past the newest capture held — derived from STATE', async () => {
    mockJobFindUnique.mockResolvedValue(completedJob());
    mockSnapshotFindFirst.mockResolvedValue({ waybackTimestamp: '20260305020413' });
    const scraper = new WaybackScraper();
    jest.spyOn(scraper, 'processJob').mockResolvedValue({ status: 'COMPLETED' } as never);

    await scraper.runFullScan(TRACKED_ID, URL_);

    const args = mockJobUpsert.mock.calls[0][0] as { update: { fromDate: string | null } };
    expect(args.update.fromDate).toBe('20260305020414');
  });

  it('scans from the beginning when no capture is held — the Phase B not-indexed case', async () => {
    mockJobFindUnique.mockResolvedValue(completedJob());
    mockSnapshotFindFirst.mockResolvedValue(null);
    const scraper = new WaybackScraper();
    jest.spyOn(scraper, 'processJob').mockResolvedValue({ status: 'COMPLETED' } as never);

    await scraper.runFullScan(TRACKED_ID, URL_);

    const args = mockJobUpsert.mock.calls[0][0] as { update: { fromDate: string | null } };
    // No lower bound: "the Archive holds none" must be an OBSERVATION, which
    // requires actually asking without excluding the whole history first.
    expect(args.update.fromDate).toBeNull();
  });

  it('asks only for ARCHIVED captures when deriving the resume point', async () => {
    mockJobFindUnique.mockResolvedValue(completedJob());
    const scraper = new WaybackScraper();
    jest.spyOn(scraper, 'processJob').mockResolvedValue({ status: 'COMPLETED' } as never);

    await scraper.runFullScan(TRACKED_ID, URL_);

    // A DIRECT capture has no waybackTimestamp, so it cannot bound a CDX query.
    const where = (mockSnapshotFindFirst.mock.calls[0][0] as { where: Record<string, unknown> })
      .where;
    expect(where['provenance']).toBe('WAYBACK');
  });
});

describe('within one run, pagination still stops when CDX says it is done', () => {
  it('stops after the final short batch rather than looping forever', async () => {
    // First lookup: a fresh COMPLETED job -> one batch runs. Second lookup: the
    // job this run just completed, short -> the sentinel correctly ends the walk.
    mockJobFindUnique
      .mockResolvedValueOnce(completedJob())
      .mockResolvedValue(completedJob({ totalSnapshots: 41 }));
    const scraper = new WaybackScraper();
    const processJob = jest
      .spyOn(scraper, 'processJob')
      .mockResolvedValue({ status: 'COMPLETED' } as never);

    await scraper.runFullScan(TRACKED_ID, URL_);

    // Exactly one batch: the fresh ask, then the sentinel ends it.
    expect(processJob).toHaveBeenCalledTimes(1);
    expect(mockTrackedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED' } }),
    );
  });
});
