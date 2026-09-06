// IN THE `extraction` PROJECT because the store reaches Readability: `fullText`
// and `contentHash` — evidence identity — are composed HERE, through the one
// construction in lib/archiveText, and a test running against a stubbed
// Readability would assert the stub. The walk's suite mocks this module by
// path, so jsdom never loads there.
import { createHash } from 'crypto';

jest.mock('../../src/lib/prisma', () => ({
  prisma: { urlSnapshot: { findUnique: jest.fn(), create: jest.fn() } },
}));

const mockAnchor = jest.fn();
jest.mock('../../src/services/anchorSnapshots', () => ({
  ...jest.requireActual<typeof import('../../src/services/anchorSnapshots')>('../../src/services/anchorSnapshots'),
  anchorAcquiredCapture: mockAnchor,
}));

import { CaptureProvenance } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { rawCaptureUrl, viewerCaptureUrl } from '../../src/lib/archiveHttp';
import { extractArticleText } from '../../src/lib/archiveText';
import { captureHtml, deriveText, TEXT_EXTRACTION_VERSION } from '../../src/lib/captureDocument';
import { RegistryFrozenError, type RegistryWindow } from '../../src/services/anchorSnapshots';
import { storeCapture, waybackTimestampToDate } from '../../src/services/recordCapture';

const findUnique = prisma.urlSnapshot.findUnique as jest.Mock;
const create = prisma.urlSnapshot.create as jest.Mock;

const TRACKED = 'tracked-url-1';
const PAGE = 'https://corona.health.gov.il/vaccine-for-covid/';
const TS = '20220622054435';
const CT = 'text/html; charset=utf-8';

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const sha256b = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const html = (s: string) => Buffer.from(s, 'utf8');

/** The default payload, and the text the walk derives from it under no rules. */
const DOC = html('<p>the article</p><a href="/report">report an adverse event</a>');
const DOC_TEXT = deriveText(DOC, CT);

/**
 * The registry as one walk call sees it. `writable` is real enough to answer:
 * the store asks WRITES_ALLOWED before it creates anything (M2); the anchoring
 * call itself is mocked.
 */
const windowWritable = jest.fn();
const windowRegistrar = jest.fn();
const WINDOW = { writable: windowWritable, registrar: windowRegistrar } as unknown as RegistryWindow;

/** Readability's article of a payload, exactly as the store must compose it. */
function articleOf(document: Buffer, timestamp = TS): string {
  return extractArticleText(
    captureHtml({ document, documentContentType: CT, documentContentEncoding: null }),
    rawCaptureUrl(timestamp, PAGE),
  );
}

function capture(overrides: Partial<Parameters<typeof storeCapture>[0]> = {}) {
  return {
    trackedUrlId: TRACKED,
    url: PAGE,
    waybackTimestamp: TS,
    document: DOC,
    contentType: CT,
    contentEncoding: null,
    derived: DOC_TEXT,
    window: WINDOW,
    ...overrides,
  };
}

const stored = {
  id: 'already-here',
  documentHash: sha256b(html('<p>WHAT WE STORED</p>')),
  textHash: DOC_TEXT.textHash,
  onChainTxHash: '0xabc',
};

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(null);
  mockAnchor.mockResolvedValue(undefined);
  windowWritable.mockResolvedValue({ allowed: true });
  windowRegistrar.mockResolvedValue({ registryAddress: '0xregistry' });
  // Returns the ANCHORABLE COLUMNS too, because the real `create` is asked for
  // them by its `select` and the store anchors the row AS WRITTEN rather than
  // the local variables that produced it. A mock that answered less would let
  // the anchor read undefined and every assertion below still pass.
  create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'new-capture-id', documentHash: data['documentHash'] }),
  );
});

// ---------------------------------------------------------------------------
// The invariant Level 1 was REOPENED for: a capture holds the PAYLOAD — and the
// two identity columns are composed by the store, never by any rule (I1).
// ---------------------------------------------------------------------------

describe('storeCapture stores the payload, not a view of it', () => {
  it('writes the bytes, their headers, and every hash in the creating statement', async () => {
    const result = await storeCapture(capture({ contentEncoding: 'identity' }));

    expect(result).toEqual({ snapshotId: 'new-capture-id', created: true, documentComparison: 'MATCHES' });
    const data = create.mock.calls[0][0].data as Record<string, unknown>;

    expect(Buffer.isBuffer(data['document'])).toBe(true);
    expect(data['document']).toEqual(DOC);
    expect(data['documentContentType']).toBe(CT);
    expect(data['documentContentEncoding']).toBe('identity');

    // Recomputed, not shape-checked: a shape assertion passes for the hash of
    // the wrong input, which mutation testing has already caught here once.
    expect(data['documentHash']).toBe(sha256b(DOC));
    // The walk's derivation, stored as handed over — the store re-derives nothing.
    expect(data['text']).toBe(DOC_TEXT.text);
    expect(data['textHash']).toBe(sha256(DOC_TEXT.text));
    expect(data['textExtractionVersion']).toBe(TEXT_EXTRACTION_VERSION);
    // Evidence identity: Readability's article over the decoded payload, under
    // the raw replay URL — the formula the registry ledger states and the
    // rebuild's extractor-equality measurement reproduced 112 of 112 with.
    expect(data['fullText']).toBe(articleOf(DOC));
    expect(data['contentHash']).toBe(sha256(articleOf(DOC)));
  });

  it('KEEPS what the text derivation discards — the defect that reopened Level 1', async () => {
    // htmlToText discards hrefs while keeping anchor text, and this platform's
    // central finding is that a REPORTING-CHANNEL LINK was removed. Two
    // different links reading the same were previously the same page to us.
    const a = html('<a href="/report-adverse-event">report an adverse event</a>');
    const b = html('<a href="/removed">report an adverse event</a>');

    expect(deriveText(a, CT).text).toBe(deriveText(b, CT).text); // same as text
    expect(sha256b(a)).not.toBe(sha256b(b)); // different as payload

    await storeCapture(capture({ document: a, derived: deriveText(a, CT) }));
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data['document']).toEqual(a);
    expect((data['document'] as Buffer).toString('utf8')).toContain('/report-adverse-event');
  });

  it('hashes the WHOLE payload, with no cap', async () => {
    const long = 'x'.repeat(40_000);
    await storeCapture(capture({ document: html(`${long}A`) }));
    await storeCapture(capture({ document: html(`${long}B`) }));

    const first = create.mock.calls[0][0].data as Record<string, string>;
    const second = create.mock.calls[1][0].data as Record<string, string>;
    expect(first['documentHash']).not.toBe(second['documentHash']);
    expect(first['documentHash']).toBe(sha256b(html(`${long}A`)));
  });

  it('refuses an empty payload rather than storing a capture without one', async () => {
    await expect(storeCapture(capture({ document: Buffer.alloc(0) }))).rejects.toThrow(/empty document/);
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("derives capturedAt and snapshotDate from the Archive timestamp, as UTC", async () => {
    // 23:30 UTC catches a local-time derivation: it is the next day in
    // Asia/Jerusalem and the previous day in US timezones.
    await storeCapture(capture({ waybackTimestamp: '20220622233000' }));
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data['capturedAt']).toEqual(new Date('2022-06-22T23:30:00.000Z'));
    expect(data['snapshotDate']).toBe('2022-06-22');
  });
});

// ---------------------------------------------------------------------------
// Provenance: every capture the store writes comes from the archive
// ---------------------------------------------------------------------------

describe('storeCapture keeps provenance honest', () => {
  it('records WAYBACK provenance, the Archive timestamp, and the viewer URL a reader opens', async () => {
    await storeCapture(capture());
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data['provenance']).toBe(CaptureProvenance.WAYBACK);
    expect(data['waybackTimestamp']).toBe(TS);
    expect(data['snapshotUrl']).toBe(viewerCaptureUrl(TS, PAGE));
  });

  it('refuses a malformed Archive timestamp before anything is read', async () => {
    await expect(storeCapture(capture({ waybackTimestamp: '2022-06-22' }))).rejects.toThrow(/expected 14 digits/);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// A capture already held — compared on the PAYLOAD, and its anchor retried
// ---------------------------------------------------------------------------

describe('storeCapture re-examines a capture it already holds', () => {
  it('returns the existing capture when this instant is already recorded', async () => {
    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(DOC) });

    const result = await storeCapture(capture());

    expect(result).toEqual({ snapshotId: 'already-here', created: false, documentComparison: 'MATCHES' });
    expect(create).not.toHaveBeenCalled();
  });

  it('compares the PAYLOAD, catching a change the derived text cannot see', async () => {
    // The exact failure that reopened this level: comparing normalised text let
    // three CDX rows carrying two distinct payload digests collapse to one
    // stored hash. Same visible text, different href — it must still fire.
    const storedDoc = html('<a href="/report-adverse-event">report an adverse event</a>');
    const refetched = html('<a href="/removed">report an adverse event</a>');
    expect(deriveText(storedDoc, CT).textHash).toBe(deriveText(refetched, CT).textHash);

    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(storedDoc), textHash: deriveText(storedDoc, CT).textHash });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await storeCapture(capture({ document: refetched, derived: deriveText(refetched, CT) }));

    expect(result.documentComparison).toBe('DIVERGED');
    expect(warn).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled(); // stored payload left untouched
    warn.mockRestore();
  });

  it('retries the anchor, AWAITED, for a stored capture that was never anchored — on the bytes it holds', async () => {
    findUnique.mockResolvedValue({ ...stored, onChainTxHash: null });

    await storeCapture(capture());

    // The row's own document, not the refetched one: the anchor attests the
    // bytes the corpus holds, and `anchoredCaptureHash` reads them off the row.
    expect(mockAnchor).toHaveBeenCalledWith(WINDOW, 'already-here', expect.objectContaining({ documentHash: stored.documentHash }));
  });

  it('anchors on the MISSING transaction, not on having created the row', async () => {
    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(DOC) });
    await storeCapture(capture());
    expect(mockAnchor).not.toHaveBeenCalled();
  });

  // RULED 2026-09-06 (M1): a stored capture whose text is not the derivation the
  // walk just handed over is a WALK DEFECT. The existing-row path is for a
  // capture re-reached after a halt; the same bytes under the same rules derive
  // the same text, so a different textHash means the walk is re-storing a
  // capture that has moved under it — supersession's job, never a silent retry.
  it('THROWS when the stored text is not the derivation handed over — naming both hashes and the capture — and anchors nothing', async () => {
    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(DOC), textHash: 'not-what-the-walk-derived', onChainTxHash: null });

    const attempt = storeCapture(capture());

    await expect(attempt).rejects.toThrow('not-what-the-walk-derived');
    await expect(attempt).rejects.toThrow(DOC_TEXT.textHash);
    await expect(attempt).rejects.toThrow(TS);
    expect(mockAnchor).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The anchor is AWAITED as the capture is stored — flows Phase 2, ruled
// 2026-09-02. A chain failure throws; the snapshot row stays; the next call
// finds it through the existing-row path above and retries.
// ---------------------------------------------------------------------------

describe('storeCapture anchors what it creates, and waits for it', () => {
  it('anchors the row it just wrote, through the window, before returning', async () => {
    await storeCapture(capture());

    expect(mockAnchor).toHaveBeenCalledTimes(1);
    expect(mockAnchor).toHaveBeenCalledWith(WINDOW, 'new-capture-id', expect.objectContaining({ documentHash: sha256b(DOC) }));
    const createdAt = create.mock.invocationCallOrder.at(0);
    const anchoredAt = mockAnchor.mock.invocationCallOrder.at(0);
    expect(Number(anchoredAt)).toBeGreaterThan(Number(createdAt));
  });

  it('a chain failure THROWS with its reason — the row stays, nothing is swallowed', async () => {
    mockAnchor.mockRejectedValueOnce(new Error('RPC down'));

    await expect(storeCapture(capture())).rejects.toThrow('RPC down');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a frozen registry surfaces as its own error, so the walk can name it', async () => {
    mockAnchor.mockRejectedValueOnce(new RegistryFrozenError('0xregistry', 'Public Health'));

    await expect(storeCapture(capture())).rejects.toBeInstanceOf(RegistryFrozenError);
  });

  // RULED 2026-09-06 (M2): WRITES_ALLOWED is asked BEFORE the row is created.
  // Flows A5: on a frozen registry "nothing is acquired" — a snapshot row with
  // no anchor, on a registry that will never take one, would be a capture the
  // corpus holds under a custody claim it cannot make. The window memoises the
  // verdict, so the anchoring module's own ask is free.
  it('asks the window BEFORE creating the row, and stores nothing on a frozen registry', async () => {
    windowWritable.mockResolvedValue({ allowed: false, indexZeroCategory: 'Public Health' });

    const attempt = storeCapture(capture());

    await expect(attempt).rejects.toBeInstanceOf(RegistryFrozenError);
    await expect(attempt).rejects.toThrow('Public Health');
    expect(create).not.toHaveBeenCalled();
    expect(mockAnchor).not.toHaveBeenCalled();
  });

  it('asks the window BEFORE re-anchoring a held row too — a frozen registry retries nothing', async () => {
    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(DOC), onChainTxHash: null });
    windowWritable.mockResolvedValue({ allowed: false, indexZeroCategory: 'Public Health' });

    await expect(storeCapture(capture())).rejects.toBeInstanceOf(RegistryFrozenError);
    expect(mockAnchor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Losing a race
// ---------------------------------------------------------------------------

describe('storeCapture survives losing a race', () => {
  it("finishes on the winner's row when a concurrent writer created it first — anchor included", async () => {
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'winner-row', documentHash: sha256b(DOC), textHash: DOC_TEXT.textHash, onChainTxHash: null });
    create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));

    const result = await storeCapture(capture());

    expect(result).toEqual({ snapshotId: 'winner-row', created: false, documentComparison: 'MATCHES' });
    expect(mockAnchor).toHaveBeenCalledWith(WINDOW, 'winner-row', expect.objectContaining({ documentHash: sha256b(DOC) }));
  });

  it('rethrows a create failure that is not a unique violation', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('disk on fire'), { code: 'P1001' }));
    await expect(storeCapture(capture())).rejects.toThrow('disk on fire');
    expect(mockAnchor).not.toHaveBeenCalled();
  });

  it('rethrows when the conflicting row cannot be found — the clash was elsewhere', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(storeCapture(capture())).rejects.toThrow('unique');
  });
});

// ---------------------------------------------------------------------------
// The one place the Archive's timestamp becomes an instant
// ---------------------------------------------------------------------------

describe('waybackTimestampToDate', () => {
  it('reads the Archive timestamp as UTC', () => {
    expect(waybackTimestampToDate('20220622054435').toISOString()).toBe('2022-06-22T05:44:35.000Z');
  });

  it.each(['2022062205443', '202206220544356', '', 'not-a-timestamp'])('refuses malformed input %p', (bad) => {
    expect(() => waybackTimestampToDate(bad)).toThrow(/expected 14 digits/);
  });

  it('refuses 14 digits that are not a real instant', () => {
    expect(() => waybackTimestampToDate('20221345054435')).toThrow(/not a valid instant/);
  });
});
