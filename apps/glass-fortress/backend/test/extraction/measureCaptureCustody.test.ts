// ---------------------------------------------------------------------------
// CUSTODY PER CAPTURE — evidence flows §8, the rebuild's step 1(a) and 1(c).
//
// Two questions, one row each, both read-only:
//
//   (a) Does extract(document) under the pinned extractor reproduce the stored
//       contentHash? Where it does, the payload registered by the rebuild
//       provably produces the text the old registry attests, and custody is
//       whole across the two contracts. Where it does not, the ledger says so.
//
//   (c) Does the Archive still serve the capture's bytes? A dry GET of the raw
//       capture, its status recorded, and on 200 the bytes hashed against
//       documentHash — `digestVerified` without storing anything.
//
// THE 429 RULE. The Archive rate-limited walla's row three times on 2026-09-06.
// A 429 is the Archive declining to answer NOW; it says nothing about whether
// the capture exists, and a measurement that folded it into "gone" would
// manufacture a custody gap out of a busy afternoon. RATE_LIMITED is its own
// outcome and is never counted with NOT_FOUND.
//
// In the `extraction` project because the pinned extractor is Readability over
// jsdom, which the `unit` project cannot load — the same reason
// `recordCapture.test.ts` lives here.
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
  },
}));

jest.mock('../../src/lib/archiveHttp', () => {
  const actual = jest.requireActual<typeof import('../../src/lib/archiveHttp')>(
    '../../src/lib/archiveHttp',
  );
  return { ...actual, fetchCaptureBytes: jest.fn(), sleep: jest.fn().mockResolvedValue(undefined) };
});

import { prisma } from '../../src/lib/prisma';
import { fetchCaptureBytes, sleep, WaybackFetchError } from '../../src/lib/archiveHttp';
import { extractArticleText } from '../../src/lib/archiveText';
import { sha256Bytes, sha256Text } from '../../src/lib/captureDocument';
import { measureCaptureCustody } from '../../src/services/measureCaptureCustody';

const PAGE = 'https://corona.health.gov.il/vaccine-for-covid/';
const TS = '20220724130104';
const RAW = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', `wayback-vaccine-${TS}-raw.html`),
);
const RAW_URL = `http://web.archive.org/web/${TS}id_/${PAGE}`;

const findUnique = prisma.trackedUrl.findUnique as jest.Mock;
const findMany = prisma.urlSnapshot.findMany as jest.Mock;
const fetchBytes = fetchCaptureBytes as jest.Mock;

interface Row {
  id: string;
  waybackTimestamp: string;
  document: Buffer;
  documentContentType: string | null;
  documentContentEncoding: string | null;
  documentHash: string;
  contentHash: string;
  fullText: string;
  cdxIndexEntry: { digest: string } | null;
}

function row(overrides: Partial<Row> = {}): Row {
  const extracted = extractArticleText(RAW.toString('utf-8'), RAW_URL);
  return {
    id: 's1',
    waybackTimestamp: TS,
    document: RAW,
    documentContentType: 'text/html; charset=utf-8',
    documentContentEncoding: 'identity',
    documentHash: sha256Bytes(RAW),
    contentHash: sha256Text(extracted),
    fullText: extracted,
    cdxIndexEntry: null,
    ...overrides,
  };
}

beforeEach(() => {
  findUnique.mockResolvedValue({ id: 'tu1', url: PAGE });
});

describe('extractor equality (a)', () => {
  it('EQUAL when the pinned extractor over the stored bytes reproduces contentHash', async () => {
    findMany.mockResolvedValue([row()]);
    const report = await measureCaptureCustody(PAGE, { fetch: false, delayMs: 0 });

    expect(report.captures).toBe(1);
    expect(report.extraction).toEqual({ EQUAL: 1, UNEQUAL: 0, NO_BYTES: 0 });
    expect(report.rows.at(0)?.extraction).toBe('EQUAL');
    expect(report.rows.at(0)?.storedTextAgrees).toBe(true);
    expect(fetchBytes).not.toHaveBeenCalled();
  });

  it('UNEQUAL when the stored contentHash is not what the bytes extract to', async () => {
    findMany.mockResolvedValue([row({ contentHash: 'f'.repeat(64) })]);
    const report = await measureCaptureCustody(PAGE, { fetch: false, delayMs: 0 });

    expect(report.extraction).toEqual({ EQUAL: 0, UNEQUAL: 1, NO_BYTES: 0 });
    // The stored text still hashes to... not that either: the row disagrees
    // with itself, and that is reported separately from the extractor question.
    expect(report.rows.at(0)?.storedTextAgrees).toBe(false);
  });

  it('NO_BYTES when the row holds an empty payload, counted apart from UNEQUAL', async () => {
    findMany.mockResolvedValue([row({ document: Buffer.alloc(0) })]);
    const report = await measureCaptureCustody(PAGE, { fetch: false, delayMs: 0 });

    expect(report.extraction).toEqual({ EQUAL: 0, UNEQUAL: 0, NO_BYTES: 1 });
  });

  it('extracts under the raw capture URL the writer used, not the viewer URL', async () => {
    // Readability resolves against the document URL; the writer passed the
    // `id_` form, so the comparison must too or it measures a different function.
    findMany.mockResolvedValue([row()]);
    const report = await measureCaptureCustody(PAGE, { fetch: false, delayMs: 0 });
    expect(report.rows.at(0)?.extractedUnder).toBe(RAW_URL);
  });
});

describe('the archive still serving (c)', () => {
  it('SERVED_VERIFIED on a 200 whose bytes hash to documentHash, and checks the CDX digest', async () => {
    findMany.mockResolvedValue([row({ cdxIndexEntry: { digest: 'NOT-THE-DIGEST' } })]);
    fetchBytes.mockResolvedValue({ bytes: RAW, contentType: 'text/html', contentEncoding: 'identity' });

    const report = await measureCaptureCustody(PAGE, { fetch: true, delayMs: 0 });
    const served = report.rows.at(0)?.serving;
    expect(served?.outcome).toBe('SERVED_VERIFIED');
    expect(served?.status).toBe(200);
    expect(served?.cdxDigestMatch).toBe(false);
    expect(report.serving.SERVED_VERIFIED).toBe(1);
    expect(fetchBytes).toHaveBeenCalledWith(PAGE, TS, { maxRetries: 0 });
  });

  it('SERVED_DIFFERENT on a 200 whose bytes are not ours', async () => {
    findMany.mockResolvedValue([row()]);
    fetchBytes.mockResolvedValue({ bytes: Buffer.from('<html>other</html>'), contentType: null, contentEncoding: 'identity' });

    const report = await measureCaptureCustody(PAGE, { fetch: true, delayMs: 0 });
    expect(report.rows.at(0)?.serving.outcome).toBe('SERVED_DIFFERENT');
    expect(report.rows.at(0)?.serving.fetchedDocumentHash).toBe(sha256Bytes(Buffer.from('<html>other</html>')));
  });

  it('RATE_LIMITED on a 429 — transient, recorded as such, never as NOT_FOUND', async () => {
    findMany.mockResolvedValue([row()]);
    fetchBytes.mockRejectedValue(new WaybackFetchError('HTTP 429', false, 429));

    const report = await measureCaptureCustody(PAGE, { fetch: true, delayMs: 0 });
    expect(report.rows.at(0)?.serving).toEqual({
      outcome: 'RATE_LIMITED',
      status: 429,
      fetchedDocumentHash: null,
      cdxDigestMatch: null,
    });
    expect(report.serving.RATE_LIMITED).toBe(1);
    expect(report.serving.NOT_FOUND).toBe(0);
  });

  it('NOT_FOUND on a 404, UNAVAILABLE on 5xx or no response', async () => {
    findMany.mockResolvedValue([
      row({ id: 'a', waybackTimestamp: '20220724130104' }),
      row({ id: 'b', waybackTimestamp: '20220805053301' }),
      row({ id: 'c', waybackTimestamp: '20220906232435' }),
    ]);
    fetchBytes
      .mockRejectedValueOnce(new WaybackFetchError('HTTP 404', false, 404))
      .mockRejectedValueOnce(new WaybackFetchError('HTTP 503', true, 503))
      .mockRejectedValueOnce(new WaybackFetchError('no response', false, null));

    const report = await measureCaptureCustody(PAGE, { fetch: true, delayMs: 0 });
    expect(report.rows.map((r) => r.serving.outcome)).toEqual(['NOT_FOUND', 'UNAVAILABLE', 'UNAVAILABLE']);
    expect(report.serving).toEqual({
      SERVED_VERIFIED: 0,
      SERVED_DIFFERENT: 0,
      NOT_FOUND: 1,
      RATE_LIMITED: 0,
      UNAVAILABLE: 2,
      UNCLASSIFIED: 0,
      NOT_FETCHED: 0,
    });
  });

  it('UNCLASSIFIED, carrying the status, for any other answer — a 403, or a transfer that failed after a 2xx', async () => {
    // Only a 404 says "not held". A 403 says the Archive refused this request,
    // and a WaybackFetchError with a 2xx status says the body never arrived
    // after a successful response — neither is durable, and counting either as
    // NOT_FOUND would hand the cleanup session a false custody scope.
    findMany.mockResolvedValue([
      row({ id: 'a', waybackTimestamp: '20220724130104' }),
      row({ id: 'b', waybackTimestamp: '20220805053301' }),
    ]);
    fetchBytes
      .mockRejectedValueOnce(new WaybackFetchError('HTTP 403', false, 403))
      .mockRejectedValueOnce(new WaybackFetchError('transfer failed', false, 200));

    const report = await measureCaptureCustody(PAGE, { fetch: true, delayMs: 0 });
    expect(report.rows.map((r) => [r.serving.outcome, r.serving.status])).toEqual([
      ['UNCLASSIFIED', 403],
      ['UNCLASSIFIED', 200],
    ]);
    expect(report.serving.UNCLASSIFIED).toBe(2);
    expect(report.serving.NOT_FOUND).toBe(0);
  });

  it('paces the fetches — sleeps the configured delay between captures, not after the last', async () => {
    findMany.mockResolvedValue([row({ id: 'a' }), row({ id: 'b', waybackTimestamp: '20220805053301' })]);
    fetchBytes.mockResolvedValue({ bytes: RAW, contentType: null, contentEncoding: 'identity' });

    await measureCaptureCustody(PAGE, { fetch: true, delayMs: 4_000 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(4_000);
  });

  it('a failure that is not the archive’s is rethrown, not recorded as an outcome', async () => {
    findMany.mockResolvedValue([row()]);
    fetchBytes.mockRejectedValue(new TypeError('bug in the caller'));

    await expect(measureCaptureCustody(PAGE, { fetch: true, delayMs: 0 })).rejects.toThrow(TypeError);
  });

  it('NOT_FETCHED for every row when fetching is off', async () => {
    findMany.mockResolvedValue([row()]);
    const report = await measureCaptureCustody(PAGE, { fetch: false, delayMs: 0 });
    expect(report.serving.NOT_FETCHED).toBe(1);
  });
});

describe('scope and vacuity', () => {
  it('throws on an unknown page rather than measuring nothing', async () => {
    findUnique.mockResolvedValue(null);
    await expect(measureCaptureCustody('https://nowhere/', { fetch: false, delayMs: 0 })).rejects.toThrow(
      /No tracked URL/,
    );
  });

  it('a page with no captures reports zero examined — the script exits on it', async () => {
    findMany.mockResolvedValue([]);
    const report = await measureCaptureCustody(PAGE, { fetch: false, delayMs: 0 });
    expect(report.captures).toBe(0);
  });
});
