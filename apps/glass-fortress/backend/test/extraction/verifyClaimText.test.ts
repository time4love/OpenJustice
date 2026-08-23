import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// verify_claim_text against a REAL archived capture, with the REAL extractor.
//
// The plan's first test: "A phrase present in raw HTML but dropped by
// Readability returns EXTRACTION_DIVERGENCE — build the fixture from capture
// 20220905111109 and נמצאו יעילים ובטוחים לשימוש, which is a real instance."
//
// Only the network and the database are stubbed. jsdom and Readability are the
// genuine articles, which is the whole point and is why this file lives in the
// `extraction` jest project: divergence is a measurement of what the real
// extractor really drops.
// ---------------------------------------------------------------------------

jest.mock('axios');
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findFirst: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
  },
}));

import axios from 'axios';
import { prisma } from '../../src/lib/prisma';
import { verifyClaimText } from '../../src/services/archiveVerification';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const findTracked = prisma.trackedUrl.findFirst as jest.Mock;
const findSnapshots = prisma.urlSnapshot.findMany as jest.Mock;

const URL = 'https://corona.health.gov.il/vaccine-for-covid/';
const TIMESTAMP = '20220905111109';
const DIVERGENT_PHRASE = 'נמצאו יעילים ובטוחים לשימוש';

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf-8');
}

interface OkResult {
  status: string;
  capturesChecked: number;
  anyExtractionDivergence: boolean;
  checks: Array<{
    outcome: string;
    presentInRawArchive?: boolean;
    presentInPlatformExtraction?: boolean;
    presentInStoredSnapshot?: boolean | null;
    extractionDivergence?: boolean;
    characters?: { raw: number; extracted: number; retainedPercent: number };
  }>;
}

describe('verifyClaimText — the real divergence', () => {
  beforeEach(() => {
    findTracked.mockResolvedValue({ id: 'tracked-1' });
    findSnapshots.mockResolvedValue([]);
    mockedAxios.get.mockResolvedValue({
      data: fixture('wayback-vaccine-20220905111109-raw.html'),
    });
    // axios.isAxiosError is a real helper the code calls on the error path.
    (mockedAxios as unknown as { isAxiosError: unknown }).isAxiosError = jest
      .fn()
      .mockReturnValue(false);
  });

  it('reports the phrase present in raw and absent from the extraction, flagged as divergence', async () => {
    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: DIVERGENT_PHRASE,
    })) as unknown as OkResult;

    expect(result.status).toBe('OK');
    expect(result.capturesChecked).toBe(1);

    const [check] = result.checks;
    expect(check.outcome).toBe('CHECKED');
    expect(check.presentInRawArchive).toBe(true);
    expect(check.presentInPlatformExtraction).toBe(false);
    expect(check.extractionDivergence).toBe(true);
    expect(result.anyExtractionDivergence).toBe(true);
  });

  it('fetches the id_ capture URL, not the viewer URL — the toolbar is not page text', async () => {
    await verifyClaimText({ url: URL, capture: TIMESTAMP, phrase: DIVERGENT_PHRASE });

    const requested = mockedAxios.get.mock.calls[0][0] as string;
    expect(requested).toBe(`http://web.archive.org/web/${TIMESTAMP}id_/${URL}`);
  });

  it('reports the phrase absent from the text the scanner actually stored', async () => {
    findSnapshots.mockResolvedValue([
      { waybackTimestamp: TIMESTAMP, fullText: fixture('wayback-vaccine-2022-09-05.txt') },
    ]);

    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: DIVERGENT_PHRASE,
    })) as unknown as OkResult;

    // The banked text is the extraction, so it is blind here too. This is the
    // column every diff, trajectory and contentHash for this page derives from.
    expect(result.checks[0].presentInStoredSnapshot).toBe(false);
  });

  it('says the capture was never scanned rather than answering false for stored text', async () => {
    findSnapshots.mockResolvedValue([]);

    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: DIVERGENT_PHRASE,
    })) as unknown as OkResult;

    expect(result.checks[0].presentInStoredSnapshot).toBeNull();
  });

  it('finds a phrase the extraction DOES keep in both readings, with no divergence', async () => {
    const kept = 'משרד הבריאות ממליץ לחסן פעוטות';

    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: kept,
    })) as unknown as OkResult;

    expect(result.checks[0].presentInRawArchive).toBe(true);
    expect(result.checks[0].presentInPlatformExtraction).toBe(true);
    expect(result.checks[0].extractionDivergence).toBe(false);
    expect(result.anyExtractionDivergence).toBe(false);
  });

  it('measures how much of the page the extractor kept', async () => {
    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: DIVERGENT_PHRASE,
    })) as unknown as OkResult;

    const chars = result.checks[0].characters;
    expect(chars).toBeDefined();
    expect(chars!.extracted).toBeLessThan(chars!.raw);
    expect(chars!.retainedPercent).toBeLessThan(100);
  });
});
