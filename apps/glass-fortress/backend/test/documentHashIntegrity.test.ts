jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() }, get: jest.fn() }));

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    urlSnapshot: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

import axios from 'axios';
import { prisma } from '../src/lib/prisma';
import { rehashDocuments } from '../src/services/rehashDocuments';
import { sha256Bytes } from '../src/lib/captureDocument';
import { cdxDigestOf, verifyAgainstCdx } from '../src/services/verifyAgainstCdx';

const findUnique = prisma.trackedUrl.findUnique as unknown as jest.Mock;
const findMany = prisma.urlSnapshot.findMany as unknown as jest.Mock;
const updateMany = prisma.urlSnapshot.updateMany as unknown as jest.Mock;

const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';
const DOC = Buffer.from('<p>the payload as served</p>', 'utf8');

function row(o: Record<string, unknown> = {}) {
  return {
    id: 'snap-1',
    capturedAt: new Date('2022-04-03T15:28:41Z'),
    provenance: 'WAYBACK',
    document: DOC,
    // The corruption as it actually occurred: the CDX digest in the SHA-256 column.
    documentHash: cdxDigestOf(DOC),
    ...o,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue({ id: 'tracked-1' });
  findMany.mockResolvedValue([row()]);
  updateMany.mockResolvedValue({ count: 1 });
});

describe('rehashDocuments repairs documentHash from the bytes already held', () => {
  it('writes SHA-256 of the payload, never the CDX digest', async () => {
    const report = await rehashDocuments({ url: URL_, dryRun: false });

    expect(report.rehashed).toBe(1);
    const { data } = updateMany.mock.calls[0][0];
    expect(data.documentHash).toBe(sha256Bytes(DOC));
    expect(data.documentHash).not.toBe(cdxDigestOf(DOC));
  });

  it('guards the UPDATE on the stale value — it cannot overwrite a row that moved', async () => {
    await rehashDocuments({ url: URL_, dryRun: false });
    const { where } = updateMany.mock.calls[0][0];
    expect(where.documentHash).toBe(cdxDigestOf(DOC));
    expect(where.id).toBe('snap-1');
  });

  it('reports RACED, not success, when the guarded update matches no row', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const report = await rehashDocuments({ url: URL_, dryRun: false });
    expect(report.raced).toBe(1);
    expect(report.rehashed).toBe(0);
  });

  it('writes NOTHING to a row that is already correct', async () => {
    findMany.mockResolvedValue([row({ documentHash: sha256Bytes(DOC) })]);
    const report = await rehashDocuments({ url: URL_, dryRun: false });
    expect(report.alreadyCorrect).toBe(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('writes NOTHING on a dry run, which is the default in the CLI', async () => {
    const report = await rehashDocuments({ url: URL_, dryRun: true });
    expect(report.rehashed).toBe(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent — a second pass over repaired rows writes nothing', async () => {
    await rehashDocuments({ url: URL_, dryRun: false });
    findMany.mockResolvedValue([row({ documentHash: sha256Bytes(DOC) })]);
    updateMany.mockClear();
    const second = await rehashDocuments({ url: URL_, dryRun: false });
    expect(second.alreadyCorrect).toBe(1);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does NOT scope by provenance — a DIRECT capture is checked and repaired too', async () => {
    findMany.mockResolvedValue([row({ provenance: 'DIRECT' })]);
    const report = await rehashDocuments({ url: URL_, dryRun: false });

    expect(report.rehashed).toBe(1);
    // The invariant is "a row's integrity hash is a hash of that row's bytes".
    // Nothing about it is archive-specific, so nothing about the query may be.
    expect(findMany.mock.calls[0][0].where).toEqual({ trackedUrlId: 'tracked-1' });
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('provenance');
  });
});


describe("Level 1's criterion checks the row against ITSELF, not only against the Archive", () => {
  const TS = '20220403152841';

  /** The archive-scoped read, then the unscoped internal read. */
  function captures(documentHash: string) {
    findMany
      .mockResolvedValueOnce([
        {
          id: 'snap-1',
          waybackTimestamp: TS,
          document: DOC,
          documentContentEncoding: 'identity',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'snap-1',
          capturedAt: new Date('2022-04-03T15:28:41Z'),
          provenance: 'WAYBACK',
          document: DOC,
          documentHash,
        },
      ]);
  }

  beforeEach(() => {
    (axios.get as jest.Mock).mockResolvedValue({
      data: [['timestamp', 'digest'], [TS, cdxDigestOf(DOC)]],
    });
  });

  it('reports the external axis VERIFIED and the internal axis CONTRADICTED at once', async () => {
    captures(cdxDigestOf(DOC)); // the corruption: CDX digest in the SHA-256 column
    const report = await verifyAgainstCdx(URL_);

    // This pairing IS the bug: the payload is exactly what the Archive served,
    // and the column over it is still wrong. An external-only criterion reports
    // the first and cannot see the second.
    expect(report.verified).toBe(1);
    expect(report.contradicted).toBe(0);
    expect(report.internallyContradicted).toBe(1);
  });

  it('is NOT complete when only the internal axis fails', async () => {
    captures(cdxDigestOf(DOC));
    const report = await verifyAgainstCdx(URL_);
    expect(report.levelOneComplete).toBe(false);
  });

  it('is complete when both axes hold', async () => {
    captures(sha256Bytes(DOC));
    const report = await verifyAgainstCdx(URL_);
    expect(report.internallyContradicted).toBe(0);
    expect(report.levelOneComplete).toBe(true);
  });

  it('checks EVERY capture on the internal axis, not only archived ones', async () => {
    captures(sha256Bytes(DOC));
    await verifyAgainstCdx(URL_);

    const archiveScoped = findMany.mock.calls[0][0].where;
    const internalScoped = findMany.mock.calls[1][0].where;
    expect(archiveScoped).toHaveProperty('provenance');
    // Scoping this one would silently skip every DIRECT capture Level 2 creates.
    expect(internalScoped).not.toHaveProperty('provenance');
  });
});
