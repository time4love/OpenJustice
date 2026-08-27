jest.mock('../src/lib/prisma', () => ({
  prisma: {
    // Raw SQL, not the typed client: HEAD's schema declares document/documentHash
    // NOT NULL, so Prisma's filter type cannot express `documentHash: null` — the
    // very rows this tool exists to find. See the service's own note.
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

jest.mock('../src/lib/archiveHttp', () => ({
  fetchCaptureBytes: jest.fn(),
}));

import { prisma } from '../src/lib/prisma';
import { fetchCaptureBytes } from '../src/lib/archiveHttp';
import {
  backfillDocumentBytes,
  countSnapshotsWithoutDocument,
} from '../src/services/backfillDocumentBytes';
import { deriveText, sha256Bytes } from '../src/lib/captureDocument';

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const executeRaw = prisma.$executeRaw as unknown as jest.Mock;
const fetchBytes = fetchCaptureBytes as jest.Mock;

/** queryRaw serves the count query and the pending-rows query in turn. */
function withPending(rows: ReturnType<typeof row>[], count = rows.length) {
  queryRaw.mockReset();
  queryRaw
    .mockResolvedValueOnce([{ n: BigInt(count) }]) // countSnapshotsWithoutDocument
    .mockResolvedValueOnce(rows) // pending rows
    .mockResolvedValue([{ n: BigInt(0) }]); // missingAtEnd
}

const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';
const CT = 'text/html; charset=utf-8';
const PAYLOAD = Buffer.from('<p>the article</p><a href="/report">דיווח</a>', 'utf8');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    waybackTimestamp: '20220306141507',
    text: deriveText(PAYLOAD, CT).text,
    url: URL_,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  withPending([row()]);
  executeRaw.mockResolvedValue(1);
  fetchBytes.mockResolvedValue({ bytes: PAYLOAD, contentType: CT });
});

describe('countSnapshotsWithoutDocument', () => {
  it('asks about documentHash, never selecting the payload column to answer it', async () => {
    // documentHash is the cheap discriminator; touching a BYTEA column to ask
    // whether it is null would pull every payload into memory to answer a
    // question a hash already answers.
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ n: BigInt(7) }]);
    expect(await countSnapshotsWithoutDocument(URL_)).toBe(7);
    const sqlParts = (queryRaw.mock.calls[0][0] as string[]).join('?');
    expect(sqlParts).toContain('"documentHash" IS NULL');
    expect(sqlParts).not.toContain('s."document"');
  });
});

describe('backfillDocumentBytes', () => {
  it('writes NOTHING on a dry run, which is the default', async () => {
    const report = await backfillDocumentBytes({ dryRun: true, url: URL_ });
    expect(fetchBytes).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
    expect(report.rows).toHaveLength(1);
  });

  it('stores the payload, its charset, and the recomputed text', async () => {
    await backfillDocumentBytes({ dryRun: false, url: URL_ });

    const params = executeRaw.mock.calls[0].slice(1);
    expect(params).toContain(PAYLOAD);
    expect(params).toContain(sha256Bytes(PAYLOAD));
    expect(params).toContain(CT);
    expect(params).toContain(deriveText(PAYLOAD, CT).textHash);
    expect(params).toContain(deriveText(PAYLOAD, CT).textExtractionVersion);
  });

  it('guards every write with documentHash IS NULL — fills, never overwrites', async () => {
    // Enforced by the database rather than by having checked a moment earlier.
    // A refetch that disagrees with a payload already stored is a finding; it
    // must never quietly replace one.
    await backfillDocumentBytes({ dryRun: false, url: URL_ });
    const sql = (executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('"documentHash" IS NULL');
    expect(executeRaw.mock.calls[0].slice(1)).toContain('snap-1');
  });

  it('REPORTS a recomputed text that differs from the stored one', async () => {
    // The decoded-string path and the bytes path disagreeing about a capture is
    // worth knowing, because the stored text was the only thing this platform
    // held until now. Reported, never silently resolved.
    withPending([row({ text: 'something else entirely' })]);

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(report.textChanged).toBe(1);
    expect(report.rows[0].textChanged).toBe(true);
  });

  it('does not report a change when the recomputation agrees', async () => {
    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });
    expect(report.textChanged).toBe(0);
    expect(report.rows[0].textChanged).toBe(false);
  });

  it('refuses an empty payload rather than storing one', async () => {
    fetchBytes.mockResolvedValue({ bytes: Buffer.alloc(0), contentType: CT });

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(executeRaw).not.toHaveBeenCalled();
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].error).toMatch(/empty payload/);
  });

  it('reports a non-archived capture instead of skipping it silently', async () => {
    // A DIRECT or ASSERTED capture cannot be refetched from the Archive. That is
    // a different problem, and a silent skip would leave it looking backfilled.
    withPending([row({ waybackTimestamp: null })]);

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(fetchBytes).not.toHaveBeenCalled();
    expect(report.failures[0].error).toMatch(/not an archived capture/);
  });

  it('one unreachable capture does not abandon the rest', async () => {
    withPending([row({ id: 'a' }), row({ id: 'b' })]);
    fetchBytes
      .mockRejectedValueOnce(new Error('archive offline'))
      .mockResolvedValue({ bytes: PAYLOAD, contentType: CT });

    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });

    expect(report.failures).toHaveLength(1);
    expect(report.filled).toBe(1);
  });

  it('counts a row another writer filled first as filled, not as an error', async () => {
    executeRaw.mockResolvedValue(0);
    const report = await backfillDocumentBytes({ dryRun: false, url: URL_ });
    expect(report.failures).toHaveLength(0);
    expect(report.filled).toBe(0);
  });
});
