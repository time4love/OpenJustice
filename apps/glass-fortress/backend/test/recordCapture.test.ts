import { createHash } from 'crypto';

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlSnapshot: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../src/services/anchorSnapshots', () => ({
  registerSnapshotOnChain: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../src/lib/prisma';
import { registerSnapshotOnChain } from '../src/services/anchorSnapshots';
import { recordCapture, waybackTimestampToDate } from '../src/services/recordCapture';
import { CaptureProvenance } from '@prisma/client';

const findUnique = prisma.urlSnapshot.findUnique as jest.Mock;
const findFirst = prisma.urlSnapshot.findFirst as jest.Mock;
const create = prisma.urlSnapshot.create as jest.Mock;
const anchor = registerSnapshotOnChain as jest.Mock;

const TRACKED = 'tracked-url-1';
const PAGE = 'https://corona.health.gov.il/vaccine-for-covid/';

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

/** A well-formed archived capture, overridable per test. */
function archived(overrides: Partial<Parameters<typeof recordCapture>[0]> = {}) {
  return {
    trackedUrlId: TRACKED,
    provenance: CaptureProvenance.WAYBACK,
    capturedAt: new Date('2022-06-22T05:44:35.000Z'),
    waybackTimestamp: '20220622054435',
    sourceUrl: PAGE,
    document: 'the article and the chrome around it',
    extraction: 'the article',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findUnique.mockResolvedValue(null);
  findFirst.mockResolvedValue(null);
  create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'new-capture-id', waybackTimestamp: data['waybackTimestamp'] }),
  );
});

// ---------------------------------------------------------------------------
// The invariant: a capture holds its document
// ---------------------------------------------------------------------------

describe('recordCapture stores the document', () => {
  it('writes the document and BOTH hashes in the creating statement', async () => {
    const result = await recordCapture(archived());

    expect(result.outcome).toBe('CREATED');
    const data = create.mock.calls[0][0].data as Record<string, string>;
    expect(data['rawText']).toBe('the article and the chrome around it');
    expect(data['fullText']).toBe('the article');

    // Recomputed, not shape-checked. A shape assertion (64 hex chars, and the
    // two differing) passes for sha256('') too, which is exactly the mutation
    // this file has to be able to catch.
    expect(data['rawContentHash']).toBe(sha256('the article and the chrome around it'));
    expect(data['contentHash']).toBe(sha256('the article'));
    expect(result.documentHash).toBe(sha256('the article and the chrome around it'));
  });

  it('hashes the WHOLE document, with no cap', async () => {
    // Direct-URL evidence used to hash url + text[0:40k], so any two pages
    // identical for forty thousand characters and divergent after shared one
    // identity. Same failure family as the 8-chunk diff cap and
    // MIN_CLAIM_LENGTH = 40 — an arbitrary limit applied at write time,
    // invisible in the output, silently deciding what counts.
    const long = 'x'.repeat(40_000);
    await recordCapture(archived({ document: `${long}A`, extraction: 'irrelevant' }));
    await recordCapture(archived({ document: `${long}B`, extraction: 'irrelevant' }));

    const first = create.mock.calls[0][0].data as Record<string, string>;
    const second = create.mock.calls[1][0].data as Record<string, string>;
    expect(first['rawContentHash']).not.toBe(second['rawContentHash']);
    expect(first['rawContentHash']).toBe(sha256(`${long}A`));
  });

  it('derives snapshotDate as the Archive timestamp\'s own UTC date', async () => {
    // snapshotDate used to come from timestampToDate, which slices the raw UTC
    // digits. It now derives from capturedAt, and the two must agree: snapshotDate
    // is what range queries filter on, so a timezone slip would move captures
    // between days and quietly change which ones a date-bounded query returns.
    //
    // 23:30 UTC is the case that catches it — it is the NEXT day in Asia/Jerusalem
    // and the PREVIOUS day in US timezones, so a local-time derivation disagrees
    // here while passing for a midday capture.
    await recordCapture(
      archived({
        capturedAt: waybackTimestampToDate('20220622233000'),
        waybackTimestamp: '20220622233000',
      }),
    );
    const data = create.mock.calls[0][0].data as Record<string, string>;
    expect(data['snapshotDate']).toBe('2022-06-22');
  });

  it.each([
    ['empty', ''],
    ['spaces', '   '],
    ['newlines and tabs', '\n\t\r\n  '],
  ])('refuses a %s document rather than storing a capture without one', async (_label, doc) => {
    // Whitespace-only counts. It carries exactly as much of the page as an empty
    // string, and forensics:backfill-raw-text already uses the stricter trim()
    // test — so a looser test here would admit a row the repair script considers
    // document-less.
    await expect(recordCapture(archived({ document: doc }))).rejects.toThrow(/empty document/);
    expect(create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The invariant: provenance and its timestamp agree
// ---------------------------------------------------------------------------

describe('recordCapture keeps provenance honest', () => {
  it('refuses a WAYBACK capture with no Archive timestamp', async () => {
    await expect(
      recordCapture(archived({ waybackTimestamp: undefined })),
    ).rejects.toThrow(/requires its waybackTimestamp/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an Archive timestamp on a capture the Archive does not hold', async () => {
    // Storing one would assert the Archive holds a capture it does not, which is
    // a claim a stranger would try to re-check and fail to find.
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
// The invariant: ONE answer to "is this capture new?"
// ---------------------------------------------------------------------------

describe('recordCapture decides novelty in one place', () => {
  it('drops a capture identical to the one IMMEDIATELY preceding it', async () => {
    const document = 'the page, unchanged';
    findFirst.mockResolvedValue({
      id: 'preceding-id',
      waybackTimestamp: '20220620061146',
      capturedAt: new Date('2022-06-20T06:11:46.000Z'),
      contentHash: sha256('whatever'),
      rawContentHash: sha256(document),
    });

    const result = await recordCapture(archived({ document }));

    expect(result.outcome).toBe('UNCHANGED');
    expect(result.id).toBe('preceding-id');
    expect(create).not.toHaveBeenCalled();
  });

  it('KEEPS a capture that reverts to a state seen earlier but not immediately before', async () => {
    // The forensic case, and the one the removed `seenDigests` Set discarded.
    // The page held STATE_A, changed to STATE_B, and returned to STATE_A. Only
    // the immediately preceding capture (STATE_B) is consulted, so the revert is
    // a new observation and is stored.
    //
    // On the real corpus this is not hypothetical: the tracked MOH page returned
    // to an earlier state twice within six hours on 2022-06-22, and eleven such
    // observations were never stored.
    findFirst.mockResolvedValue({
      id: 'state-b-id',
      waybackTimestamp: '20220620061146',
      capturedAt: new Date('2022-06-20T06:11:46.000Z'),
      contentHash: sha256('STATE_B extraction'),
      rawContentHash: sha256('STATE_B'),
    });

    const result = await recordCapture(archived({ document: 'STATE_A' }));

    expect(result.outcome).toBe('CREATED');
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data as Record<string, string>;
    expect(data['rawContentHash']).toBe(sha256('STATE_A'));
  });

  it('orders by capturedAt, so the answer cannot depend on arrival order', async () => {
    // The old rule's answer depended on where a CDX page boundary fell: a revert
    // whose twin landed in the previous batch survived, one in the same batch did
    // not. Comparing against the row preceding IN TIME removes that dependence.
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
      rawContentHash: sha256('the article and the chrome around it'),
      onChainTxHash: '0xabc',
    });

    const result = await recordCapture(archived());

    expect(result.outcome).toBe('EXISTS');
    expect(result.id).toBe('already-here');
    expect(result.divergedFromStored).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Properties that existed in CODE before this write path and must not be
// demoted to prose by it
// ---------------------------------------------------------------------------

describe('recordCapture re-examines a capture it already holds', () => {
  const storedElsewhere = {
    id: 'already-here',
    waybackTimestamp: '20220622054435',
    contentHash: sha256('stored extraction'),
    rawContentHash: sha256('WHAT WE STORED'),
    onChainTxHash: '0xabc',
  };

  it('reports divergence when the refetched document differs from the stored one', async () => {
    // The comment on this path claimed a disagreement "is a finding to surface"
    // while nothing compared anything — the exact shape of defect this level
    // exists to stop repeating, reappearing inside the fix for it.
    findUnique.mockResolvedValue(storedElsewhere);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await recordCapture(archived({ document: 'WHAT WE JUST FETCHED' }));

    expect(result.outcome).toBe('EXISTS');
    expect(result.divergedFromStored).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('DIVERGENCE'),
      ...Array<unknown>(6).fill(expect.anything()),
    );
    // Stored text is never rewritten on the strength of a refetch.
    expect(create).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('retries the anchor for a stored capture that was never anchored', async () => {
    // The upsert this replaced anchored whenever onChainTxHash was null,
    // including on rows it did not create, so a resumed scan repaired a capture
    // stored but never anchored. 83 captures once sat in exactly that state.
    findUnique.mockResolvedValue({ ...storedElsewhere, onChainTxHash: null });

    await recordCapture(archived({ document: 'WHAT WE STORED' }));

    expect(anchor).toHaveBeenCalledWith('already-here', sha256('stored extraction'));
  });

  it('does not re-anchor a capture that already has its transaction', async () => {
    findUnique.mockResolvedValue(storedElsewhere);
    await recordCapture(archived({ document: 'WHAT WE STORED' }));
    expect(anchor).not.toHaveBeenCalled();
  });
});

describe('recordCapture survives losing a race', () => {
  it('finishes on the winner\'s row when a concurrent writer created it first', async () => {
    // findUnique + create are two statements; the upsert they replaced was one.
    // A concurrent scan of the same URL can insert between them, and the loser
    // must not report a failure for a capture that IS now stored.
    findUnique
      .mockResolvedValueOnce(null) // the pre-check: not there yet
      .mockResolvedValueOnce({
        id: 'winner-row',
        waybackTimestamp: '20220622054435',
        contentHash: sha256('the article'),
        rawContentHash: sha256('the article and the chrome around it'),
        onChainTxHash: null,
      });
    create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));

    const result = await recordCapture(archived());

    expect(result.outcome).toBe('EXISTS');
    expect(result.id).toBe('winner-row');
    // And the winner's row still gets its anchor retried.
    expect(anchor).toHaveBeenCalledWith('winner-row', sha256('the article'));
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
// Anchoring belongs to the write path
// ---------------------------------------------------------------------------

describe('recordCapture anchors what it creates', () => {
  it('anchors a newly created capture on its contentHash', async () => {
    await recordCapture(archived());
    expect(anchor).toHaveBeenCalledWith('new-capture-id', sha256('the article'));
  });

  it('anchors on the MISSING transaction, not on having created the row', async () => {
    // The distinction matters: keying anchoring on creation loses the repair a
    // resumed scan used to perform, against a corpus where 83 captures once sat
    // stored-but-unanchored. An existing row with a transaction is left alone; an
    // existing row without one is retried — see the re-examination tests above.
    findUnique.mockResolvedValue({
      id: 'already-here',
      waybackTimestamp: '20220622054435',
      contentHash: sha256('x'),
      rawContentHash: sha256('the article and the chrome around it'),
      onChainTxHash: '0xalready-anchored',
    });
    await recordCapture(archived());
    expect(anchor).not.toHaveBeenCalled();
  });

  it('records the capture even when anchoring rejects', async () => {
    // A chain hiccup must not fail a write that already holds the
    // irreplaceable half.
    anchor.mockRejectedValueOnce(new Error('RPC down'));
    const result = await recordCapture(archived());
    expect(result.outcome).toBe('CREATED');
  });
});

// ---------------------------------------------------------------------------
// The one place the Archive's timestamp becomes an instant
// ---------------------------------------------------------------------------

describe('waybackTimestampToDate', () => {
  it('reads the Archive timestamp as UTC', () => {
    // Not local time. The same corpus must produce the same instants on a laptop
    // in Israel and a container in UTC, or capturedAt orders differently per
    // machine.
    expect(waybackTimestampToDate('20220622054435').toISOString()).toBe(
      '2022-06-22T05:44:35.000Z',
    );
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
