// ---------------------------------------------------------------------------
// runFullScan — a previously FAILED job must be retryable.
//
// There is exactly one WaybackScrapeJob row per TrackedUrl, updated in place.
// runFullScan used to treat job.status === 'FAILED' as terminal: mark the
// TrackedUrl FAILED and return, without attempting a single fetch. So the first
// transient Internet Archive failure made a page permanently unscannable — every
// later scan request short-circuited, wrote no logs, and reported FAILED.
//
// That is how a 30s CDX timeout against a merely-slow archive bricked
// corona.health.gov.il on 2026-08-22, and why the retry fix shipped the same day
// could never take effect on it: the code that would have used it was
// unreachable.
// ---------------------------------------------------------------------------

jest.mock('axios');
jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));
jest.mock('../src/services/ForensicAgent');
jest.mock('../src/services/VectorStoreService', () => ({
  VectorStoreService: { create: jest.fn().mockResolvedValue({ upsertEvidence: jest.fn() }) },
}));

const mockJobFindUnique = jest.fn();
const mockTrackedUpdate = jest.fn().mockResolvedValue({});
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    waybackScrapeJob: {
      findUnique: (...a: unknown[]) => mockJobFindUnique(...a),
      upsert: jest.fn().mockResolvedValue({ id: 'job-1', status: 'PENDING' }),
    },
    trackedUrl: { update: (...a: unknown[]) => mockTrackedUpdate(...a) },
  },
}));

import { WaybackScraper } from '../src/services/WaybackScraper';

const TRACKED_ID = 'tracked-1';
const URL = 'https://corona.health.gov.il/vaccine-for-covid/';

function failedJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    status: 'FAILED',
    failureReason: 'ALL_FETCHES_FAILED',
    fromDate: null,
    snapshotsList: '[]',
    totalSnapshots: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTrackedUpdate.mockResolvedValue({});
});

describe('runFullScan with a previously FAILED job', () => {
  it('resets the job and processes it instead of refusing', async () => {
    mockJobFindUnique.mockResolvedValue(failedJob());

    const scraper = new WaybackScraper();
    const createJob = jest
      .spyOn(scraper, 'createJob')
      .mockResolvedValue({ id: 'job-1', status: 'PENDING' } as never);
    const processJob = jest
      .spyOn(scraper, 'processJob')
      .mockResolvedValue({ id: 'job-1', status: 'COMPLETED', snapshotsList: '[]', totalSnapshots: 0 } as never);

    await scraper.runFullScan(TRACKED_ID, URL);

    expect(createJob).toHaveBeenCalled();
    // The whole point: a fetch is actually attempted.
    expect(processJob).toHaveBeenCalled();
  });

  it('does not mark the URL FAILED without attempting anything', async () => {
    mockJobFindUnique.mockResolvedValue(failedJob());

    const scraper = new WaybackScraper();
    jest.spyOn(scraper, 'createJob').mockResolvedValue({ id: 'job-1', status: 'PENDING' } as never);
    jest
      .spyOn(scraper, 'processJob')
      .mockResolvedValue({ id: 'job-1', status: 'COMPLETED', snapshotsList: '[]', totalSnapshots: 0 } as never);

    await scraper.runFullScan(TRACKED_ID, URL);

    const failedWrites = mockTrackedUpdate.mock.calls.filter(
      ([args]) => (args as { data: { status: string } }).data.status === 'FAILED',
    );
    expect(failedWrites).toHaveLength(0);
  });

  it('resumes at the batch that failed rather than restarting the history', async () => {
    // fromDate is the CDX query start for the batch in flight. Dropping it
    // would re-walk snapshots already processed and re-run an LLM call per pair.
    mockJobFindUnique.mockResolvedValue(failedJob({ fromDate: '20220101' }));

    const scraper = new WaybackScraper();
    const createJob = jest
      .spyOn(scraper, 'createJob')
      .mockResolvedValue({ id: 'job-1', status: 'PENDING' } as never);
    jest
      .spyOn(scraper, 'processJob')
      .mockResolvedValue({ id: 'job-1', status: 'COMPLETED', snapshotsList: '[]', totalSnapshots: 0 } as never);

    await scraper.runFullScan(TRACKED_ID, URL);

    expect(createJob).toHaveBeenCalledWith(URL, TRACKED_ID, '20220101');
  });

  it('still marks the URL FAILED when the retried attempt itself fails', async () => {
    // Retrying must not paper over a genuine failure — only over the refusal.
    mockJobFindUnique.mockResolvedValue(failedJob());

    const scraper = new WaybackScraper();
    jest.spyOn(scraper, 'createJob').mockResolvedValue({ id: 'job-1', status: 'PENDING' } as never);
    jest.spyOn(scraper, 'processJob').mockResolvedValue({ id: 'job-1', status: 'FAILED' } as never);

    await scraper.runFullScan(TRACKED_ID, URL);

    const failedWrites = mockTrackedUpdate.mock.calls.filter(
      ([args]) => (args as { data: { status: string } }).data.status === 'FAILED',
    );
    expect(failedWrites).toHaveLength(1);
  });
});
