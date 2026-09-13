import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// verify_claim_text against a REAL archived capture, read by the REAL raw reader.
//
// The plan's first test: "A phrase present in raw HTML but dropped by the
// platform's text returns EXTRACTION_DIVERGENCE — build the fixture from capture
// 20220905111109 and נמצאו יעילים ובטוחים לשימוש, which is a real instance."
//
// Since R45 the second answer is the text the platform STORED for the capture —
// its current `text` — not a re-run of Readability. The stored text below is a
// frozen text of that capture that lacks the phrase (Readability's, as banked
// in 2022): the shape of any stored text blind to something the page said. Only
// the network and the database are stubbed; the raw reading is the genuine one.
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

/** The capture held, with a stored text that lacks DIVERGENT_PHRASE. */
function storedBlindText(): void {
  findSnapshots.mockResolvedValue([{ waybackTimestamp: TIMESTAMP, text: fixture('wayback-vaccine-2022-09-05.txt') }]);
}

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
    presentInStoredSnapshot?: boolean | null;
    extractionDivergence?: boolean | null;
    characters?: { raw: number; stored: number | null; retainedPercent: number | null };
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

  it('reports the phrase present in raw and absent from the stored text, flagged as divergence', async () => {
    storedBlindText();
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
    expect(check.presentInStoredSnapshot).toBe(false);
    expect(check.extractionDivergence).toBe(true);
    expect(result.anyExtractionDivergence).toBe(true);
  });

  it('fetches the id_ capture URL, not the viewer URL — the toolbar is not page text', async () => {
    await verifyClaimText({ url: URL, capture: TIMESTAMP, phrase: DIVERGENT_PHRASE });

    const requested = mockedAxios.get.mock.calls[0][0] as string;
    expect(requested).toBe(`http://web.archive.org/web/${TIMESTAMP}id_/${URL}`);
  });

  it('reports the phrase absent from the text the platform actually stored', async () => {
    storedBlindText();

    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: DIVERGENT_PHRASE,
    })) as unknown as OkResult;

    // The stored text is what every diff and trajectory for this page reads, so
    // a phrase absent from it is invisible to all of them.
    expect(result.checks[0].presentInStoredSnapshot).toBe(false);
  });

  it('says the capture is not held rather than answering false for stored text — and claims no divergence', async () => {
    findSnapshots.mockResolvedValue([]);

    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: DIVERGENT_PHRASE,
    })) as unknown as OkResult;

    expect(result.checks[0].presentInStoredSnapshot).toBeNull();
    // No stored text to disagree with: null, never `false`, which would claim a check.
    expect(result.checks[0].extractionDivergence).toBeNull();
    expect(result.checks[0].characters?.stored).toBeNull();
    expect(result.anyExtractionDivergence).toBe(false);
  });

  it('finds a phrase the stored text DOES keep in both readings, with no divergence', async () => {
    storedBlindText();
    const kept = 'משרד הבריאות ממליץ לחסן פעוטות';

    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: kept,
    })) as unknown as OkResult;

    expect(result.checks[0].presentInRawArchive).toBe(true);
    expect(result.checks[0].presentInStoredSnapshot).toBe(true);
    expect(result.checks[0].extractionDivergence).toBe(false);
    expect(result.anyExtractionDivergence).toBe(false);
  });

  it('measures how much of the raw reading the stored text keeps', async () => {
    storedBlindText();
    const result = (await verifyClaimText({
      url: URL,
      capture: TIMESTAMP,
      phrase: DIVERGENT_PHRASE,
    })) as unknown as OkResult;

    const chars = result.checks[0].characters;
    expect(chars).toBeDefined();
    expect(chars!.stored).not.toBeNull();
    expect(chars!.stored!).toBeLessThan(chars!.raw);
    expect(chars!.retainedPercent).toBeLessThan(100);
  });
});
