// MOVED TO THE `extraction` PROJECT 2026-09-01, when `recordCapture` began deriving
// text UNDER THE ERA'S RULESET. That reaches `chromeRulesetApply`, which brings
// jsdom and an ESM-only dependency chain the `unit` project does not transform.
//
// The alternative was to keep `deriveText` for the uncalibrated case and reach for
// the ruleset only when one exists — which would leave TWO derivation paths that
// agree today and could drift tomorrow. Recording a capture now IS an extraction,
// so the test moved to where extraction is tested.
import { createHash } from 'crypto';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    urlSnapshot: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    // WHICH ERA GOVERNS THIS CAPTURE. Recording one now looks up the URL's
    // committed calibration; these fixtures describe an UNCALIBRATED url, so the
    // lookup finds no runs, the ruleset is empty and the derivation is
    // byte-identical to what it was before rulesets applied at all.
    calibrationRun: { findMany: jest.fn() },
    calibrationDecision: { findMany: jest.fn() },
    calibrationReset: { findFirst: jest.fn() },
  },
}));

jest.mock('../../src/services/anchorSnapshots', () => ({
  registerSnapshotOnChain: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../src/lib/prisma';
import { registerSnapshotOnChain } from '../../src/services/anchorSnapshots';
import {
  anchoredCaptureHash,
  type AnchorableCapture,
} from '../../src/lib/anchoredCaptureHash';
import { recordCapture, waybackTimestampToDate } from '../../src/services/recordCapture';
import { deriveText, TEXT_EXTRACTION_VERSION } from '../../src/lib/captureDocument';
import { CaptureProvenance } from '@prisma/client';

const findUnique = prisma.urlSnapshot.findUnique as jest.Mock;
const findFirst = prisma.urlSnapshot.findFirst as jest.Mock;
const create = prisma.urlSnapshot.create as jest.Mock;
const anchor = registerSnapshotOnChain as jest.Mock;

/** What the nth anchoring call was about: the snapshot id, and the hash the rule derives. */
function anchoredOf(nth: number): [string, string] {
  const [snapshotId, capture] = anchor.mock.calls[nth] as [string, AnchorableCapture];
  return [snapshotId, anchoredCaptureHash(capture)];
}

const TRACKED = 'tracked-url-1';
const PAGE = 'https://corona.health.gov.il/vaccine-for-covid/';
const CT = 'text/html; charset=utf-8';

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const sha256b = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const html = (s: string) => Buffer.from(s, 'utf8');

/** The default payload, and the text it derives to. */
const DOC = html('<p>the article</p><a href="/report">report an adverse event</a>');
const DOC_TEXT = deriveText(DOC, CT);

function archived(overrides: Partial<Parameters<typeof recordCapture>[0]> = {}) {
  return {
    trackedUrlId: TRACKED,
    provenance: CaptureProvenance.WAYBACK,
    capturedAt: new Date('2022-06-22T05:44:35.000Z'),
    waybackTimestamp: '20220622054435',
    sourceUrl: PAGE,
    document: DOC,
    documentContentType: CT,
    extraction: 'the article',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(null);
  findFirst.mockResolvedValue(null);
  // An UNCALIBRATED url: no runs, so no eras, so an empty ruleset — and the
  // derivation these fixtures assert is byte-identical to the pre-ruleset one.
  (prisma.calibrationRun.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.calibrationDecision.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.calibrationReset.findFirst as jest.Mock).mockResolvedValue(null);
  // Returns the ANCHORABLE COLUMNS too, because the real `create` is asked for
  // them by its `select` and the write path anchors the row as written rather
  // than the local variables that produced it. A mock that answered less would
  // let `anchoredCaptureHash` read undefined and every assertion below still pass.
  create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: 'new-capture-id',
      waybackTimestamp: data['waybackTimestamp'],
      contentHash: data['contentHash'],
      documentHash: data['documentHash'],
    }),
  );
});

// ---------------------------------------------------------------------------
// The invariant this level was REOPENED for: a capture holds the PAYLOAD
// ---------------------------------------------------------------------------

describe('recordCapture stores the payload, not a view of it', () => {
  it('writes the bytes, its charset, and every hash in the creating statement', async () => {
    const result = await recordCapture(archived());

    expect(result.outcome).toBe('CREATED');
    const data = create.mock.calls[0][0].data as Record<string, unknown>;

    expect(Buffer.isBuffer(data['document'])).toBe(true);
    expect(data['document']).toEqual(DOC);
    expect(data['documentContentType']).toBe(CT);

    // Recomputed, not shape-checked: a shape assertion passes for the hash of
    // the wrong input, which mutation testing has already caught here once.
    expect(data['documentHash']).toBe(sha256b(DOC));
    expect(data['textHash']).toBe(sha256(DOC_TEXT.text));
    expect(data['contentHash']).toBe(sha256('the article'));
    expect(data['textExtractionVersion']).toBe(TEXT_EXTRACTION_VERSION);
  });

  it('KEEPS what the text derivation discards — the defect that reopened Level 1', async () => {
    // htmlToText discards hrefs while keeping anchor text, and this platform's
    // central finding is that a REPORTING-CHANNEL LINK was removed. Two
    // different links reading the same were previously the same page to us.
    const a = html('<a href="/report-adverse-event">report an adverse event</a>');
    const b = html('<a href="/removed">report an adverse event</a>');

    expect(deriveText(a, CT).text).toBe(deriveText(b, CT).text); // same as text
    expect(sha256b(a)).not.toBe(sha256b(b)); // different as payload

    await recordCapture(archived({ document: a }));
    const stored = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(stored['document']).toEqual(a);
    expect((stored['document'] as Buffer).toString('utf8')).toContain('/report-adverse-event');
  });

  it('hashes the WHOLE payload, with no cap', async () => {
    const long = 'x'.repeat(40_000);
    await recordCapture(archived({ document: html(`${long}A`) }));
    await recordCapture(archived({ document: html(`${long}B`) }));

    const first = create.mock.calls[0][0].data as Record<string, string>;
    const second = create.mock.calls[1][0].data as Record<string, string>;
    expect(first['documentHash']).not.toBe(second['documentHash']);
    expect(first['documentHash']).toBe(sha256b(html(`${long}A`)));
  });

  it('refuses an empty payload rather than storing a capture without one', async () => {
    await expect(recordCapture(archived({ document: Buffer.alloc(0) }))).rejects.toThrow(
      /empty document/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("derives snapshotDate as the Archive timestamp's own UTC date", async () => {
    // 23:30 UTC catches a local-time derivation: it is the next day in
    // Asia/Jerusalem and the previous day in US timezones.
    await recordCapture(
      archived({
        capturedAt: waybackTimestampToDate('20220622233000'),
        waybackTimestamp: '20220622233000',
      }),
    );
    const data = create.mock.calls[0][0].data as Record<string, string>;
    expect(data['snapshotDate']).toBe('2022-06-22');
  });
});

// ---------------------------------------------------------------------------
// Provenance and its timestamp agree
// ---------------------------------------------------------------------------

describe('recordCapture keeps provenance honest', () => {
  it('refuses a WAYBACK capture with no Archive timestamp', async () => {
    await expect(recordCapture(archived({ waybackTimestamp: undefined }))).rejects.toThrow(
      /requires its waybackTimestamp/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an Archive timestamp on a capture the Archive does not hold', async () => {
    await expect(
      recordCapture(
        archived({ provenance: CaptureProvenance.DIRECT, waybackTimestamp: '20220622054435' }),
      ),
    ).rejects.toThrow(/meaningless for a DIRECT capture/);
    expect(create).not.toHaveBeenCalled();
  });

  it('records a DIRECT capture with no Archive timestamp', async () => {
    const result = await recordCapture(
      archived({ provenance: CaptureProvenance.DIRECT, waybackTimestamp: undefined }),
    );
    expect(result.outcome).toBe('CREATED');
    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data['waybackTimestamp']).toBeNull();
    expect(data['provenance']).toBe(CaptureProvenance.DIRECT);
  });
});

// ---------------------------------------------------------------------------
// Novelty is decided on TEXT, explicitly — and in one place
// ---------------------------------------------------------------------------

describe('recordCapture decides novelty in one place', () => {
  it('drops a capture whose TEXT matches the one immediately preceding it', async () => {
    findFirst.mockResolvedValue({
      id: 'preceding-id',
      waybackTimestamp: '20220620061146',
      capturedAt: new Date('2022-06-20T06:11:46.000Z'),
      contentHash: sha256('whatever'),
      textHash: DOC_TEXT.textHash,
    });

    const result = await recordCapture(archived());

    expect(result.outcome).toBe('UNCHANGED');
    expect(result.id).toBe('preceding-id');
    expect(create).not.toHaveBeenCalled();
  });

  it('keys novelty on TEXT, not the payload — a markup-only change is not new', async () => {
    // Decided explicitly rather than inherited. Byte-identity is too sensitive to
    // be the novelty key: a rotating cache-buster or a timestamp in a comment
    // would make every capture distinct and store hundreds of near-identical
    // payloads. Nothing is discarded either way — the payload is kept whole;
    // only whether a NEW ROW appears changes.
    const withComment = html(
      '<p>the article</p><a href="/report">report an adverse event</a><!-- built 12:04 -->',
    );
    expect(sha256b(withComment)).not.toBe(sha256b(DOC));
    expect(deriveText(withComment, CT).textHash).toBe(DOC_TEXT.textHash);

    findFirst.mockResolvedValue({
      id: 'preceding-id',
      waybackTimestamp: '20220620061146',
      capturedAt: new Date('2022-06-20T06:11:46.000Z'),
      contentHash: sha256('whatever'),
      textHash: DOC_TEXT.textHash,
    });

    const result = await recordCapture(archived({ document: withComment }));
    expect(result.outcome).toBe('UNCHANGED');
  });

  it('KEEPS a capture that reverts to a state seen earlier but not immediately before', async () => {
    // The forensic case the removed `seenDigests` Set discarded. Only the
    // IMMEDIATELY preceding capture is consulted, so a revert is a new
    // observation — the tracked page returned to an earlier state twice within
    // six hours on 2022-06-22.
    const stateA = html('<p>STATE A</p>');
    findFirst.mockResolvedValue({
      id: 'state-b-id',
      waybackTimestamp: '20220620061146',
      capturedAt: new Date('2022-06-20T06:11:46.000Z'),
      contentHash: sha256('STATE_B extraction'),
      textHash: deriveText(html('<p>STATE B</p>'), CT).textHash,
    });

    const result = await recordCapture(archived({ document: stateA }));

    expect(result.outcome).toBe('CREATED');
    const data = create.mock.calls[0][0].data as Record<string, string>;
    expect(data['textHash']).toBe(deriveText(stateA, CT).textHash);
  });

  it('orders by capturedAt, so the answer cannot depend on arrival order', async () => {
    await recordCapture(archived());
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { capturedAt: 'desc' } }),
    );
    const where = findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where['capturedAt']).toEqual({ lt: new Date('2022-06-22T05:44:35.000Z') });
  });

  it('returns the existing capture when this instant is already recorded', async () => {
    findUnique.mockResolvedValue({
      id: 'already-here',
      waybackTimestamp: '20220622054435',
      contentHash: sha256('stored extraction'),
      documentHash: sha256b(DOC),
      onChainTxHash: '0xabc',
    });

    const result = await recordCapture(archived());

    expect(result.outcome).toBe('EXISTS');
    expect(result.id).toBe('already-here');
    expect(result.documentComparison).toBe('MATCHES');
    expect(create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Re-examining a capture already held — compared on the PAYLOAD
// ---------------------------------------------------------------------------

describe('recordCapture re-examines a capture it already holds', () => {
  const stored = {
    id: 'already-here',
    waybackTimestamp: '20220622054435',
    contentHash: sha256('stored extraction'),
    documentHash: sha256b(html('<p>WHAT WE STORED</p>')),
    onChainTxHash: '0xabc',
  };

  it('compares the PAYLOAD, catching a change the derived text cannot see', async () => {
    // The exact failure that reopened this level: comparing normalised text let
    // three CDX rows carrying two distinct payload digests collapse to one
    // stored hash. Same visible text, different href — it must still fire.
    const storedDoc = html('<a href="/report-adverse-event">report an adverse event</a>');
    const refetched = html('<a href="/removed">report an adverse event</a>');
    expect(deriveText(storedDoc, CT).textHash).toBe(deriveText(refetched, CT).textHash);

    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(storedDoc) });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await recordCapture(archived({ document: refetched }));

    expect(result.documentComparison).toBe('DIVERGED');
    expect(warn).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled(); // stored payload left untouched
    warn.mockRestore();
  });

  it('reports UNAVAILABLE, never MATCHES, when there is no stored payload to compare', async () => {
    // §3: UNAVAILABLE is a verdict about a CHECK, never about data. A row stored
    // before the payload column existed cannot be compared, and saying so is the
    // difference between "we compared and they match" and "we could not compare".
    findUnique.mockResolvedValue({ ...stored, documentHash: null });

    const result = await recordCapture(archived());

    expect(result.documentComparison).toBe('UNAVAILABLE');
  });

  it('retries the anchor for a stored capture that was never anchored', async () => {
    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(DOC), onChainTxHash: null });
    await recordCapture(archived());
    // The DOCUMENT, not the extraction — Level 3 clause 1. The row is anchored on
    // the payload it holds, which is the layer that carries the hrefs.
    expect(anchoredOf(0)).toEqual(['already-here', sha256b(DOC)]);
  });

  it('anchors on the MISSING transaction, not on having created the row', async () => {
    findUnique.mockResolvedValue({ ...stored, documentHash: sha256b(DOC) });
    await recordCapture(archived());
    expect(anchor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Anchoring, and the promise callers may ignore
// ---------------------------------------------------------------------------

describe('recordCapture anchors what it creates', () => {
  it('anchors the row it just wrote, on whichever hash the rule names', async () => {
    // The write path hands over the CAPTURE and `anchoredCaptureHash` picks the
    // hash. Asserting through the same symbol is deliberate: this pins that
    // anchoring happens for the created row, and follows the rule when it moves.
    await recordCapture(archived());
    expect(anchoredOf(0)).toEqual(['new-capture-id', sha256b(DOC)]);
  });

  it('records the capture even when anchoring rejects, and the promise still does not reject', async () => {
    // `anchoring` is handed to callers who may IGNORE it (the scanner does). An
    // ignored promise that rejects is an unhandled rejection, which in Node ends
    // the process — this suite crashed with exactly that before the guarantee
    // was made local instead of borrowed from anchorSnapshots.
    anchor.mockRejectedValueOnce(new Error('RPC down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await recordCapture(archived());

    expect(result.outcome).toBe('CREATED');
    await expect(result.anchoring).resolves.toBeNull();
    warn.mockRestore();
  });

  it('leaves the promise safe to ignore entirely', async () => {
    anchor.mockRejectedValueOnce(new Error('RPC down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await recordCapture(archived());
    await new Promise((r) => setImmediate(r));
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Losing a race
// ---------------------------------------------------------------------------

describe('recordCapture survives losing a race', () => {
  it("finishes on the winner's row when a concurrent writer created it first", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'winner-row',
      waybackTimestamp: '20220622054435',
      contentHash: sha256('the article'),
      documentHash: sha256b(DOC),
      onChainTxHash: null,
    });
    create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));

    const result = await recordCapture(archived());

    expect(result.outcome).toBe('EXISTS');
    expect(result.id).toBe('winner-row');
    expect(anchoredOf(0)).toEqual(['winner-row', sha256b(DOC)]);
  });

  it('rethrows a create failure that is not a unique violation', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('disk on fire'), { code: 'P1001' }));
    await expect(recordCapture(archived())).rejects.toThrow('disk on fire');
  });

  it('rethrows when the conflicting row cannot be found — the clash was elsewhere', async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(recordCapture(archived())).rejects.toThrow('unique');
  });
});

// ---------------------------------------------------------------------------
// The one place the Archive's timestamp becomes an instant
// ---------------------------------------------------------------------------

describe('waybackTimestampToDate', () => {
  it('reads the Archive timestamp as UTC', () => {
    expect(waybackTimestampToDate('20220622054435').toISOString()).toBe('2022-06-22T05:44:35.000Z');
  });

  it.each(['2022062205443', '202206220544356', '', 'not-a-timestamp'])(
    'refuses malformed input %p',
    (bad) => {
      expect(() => waybackTimestampToDate(bad)).toThrow(/expected 14 digits/);
    },
  );

  it('refuses 14 digits that are not a real instant', () => {
    expect(() => waybackTimestampToDate('20221345054435')).toThrow(/not a valid instant/);
  });
});

// ---------------------------------------------------------------------------
// BUILD ORDER STEP 2 — the ruleset is actually applied.
//
// EVERY OTHER TEST HERE DESCRIBES AN UNCALIBRATED URL, where the derivation is
// byte-identical to the pre-ruleset one — so they would all still pass if
// recording ignored rulesets entirely, which is exactly what it did until now
// (I16). This is the case that fails if it goes back to ignoring them.
// ---------------------------------------------------------------------------
describe('recordCapture derives under the era that governs the capture', () => {
  const WITH_FURNITURE = html(
    '<html><body><nav class="menu">home sport money</nav><p>the article</p></body></html>',
  );

  function calibrated(selectors: string[]) {
    (prisma.calibrationRun.findMany as jest.Mock).mockResolvedValue([
      { id: 'run-1', status: 'COMMITTED' },
    ]);
    (prisma.calibrationDecision.findMany as jest.Mock).mockResolvedValue([
      { calibrationRunId: 'run-1', type: 'RULESET_CORRECTED', selectors, snapshotId: 'a' },
    ]);
  }

  it('removes the marked furniture from `text`, and so from the novelty key', async () => {
    calibrated(['nav.menu']);
    await recordCapture(archived({ document: WITH_FURNITURE }));
    const stored = create.mock.calls[0][0].data as Record<string, unknown>;

    expect(stored['text']).toContain('the article');
    // THE POINT OF THE WHOLE LEVEL: the navigation no longer reaches `text`, so
    // it no longer reaches `textHash`, so a rotating strip stops making every
    // capture look new.
    expect(stored['text']).not.toContain('home sport money');
  });

  it('records WHICH ruleset produced the text, in the extraction version', async () => {
    calibrated(['nav.menu']);
    await recordCapture(archived({ document: WITH_FURNITURE }));
    const stored = create.mock.calls[0][0].data as Record<string, unknown>;
    // The stamp step 2 was written to add — and it already existed, naming the
    // extraction version AND the ruleset, so a re-derivation forced by a pipeline
    // change is distinguishable from one forced by a rules change.
    expect(String(stored['textExtractionVersion'])).toContain('+chrome-');
  });

  it('an uncalibrated URL keeps the furniture, which is what makes the case above meaningful', async () => {
    await recordCapture(archived({ document: WITH_FURNITURE }));
    const stored = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(stored['text']).toContain('home sport money');
    expect(String(stored['textExtractionVersion'])).not.toContain('+chrome-');
  });
});
