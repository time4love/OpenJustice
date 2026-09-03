jest.mock('../../src/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    trackedUrl: { findUnique: jest.fn() },
    cdxIndexEntry: { findMany: jest.fn(), update: jest.fn() },
    rule: { findMany: jest.fn() },
    pageDecision: { findMany: jest.fn() },
    ruleMatch: { createMany: jest.fn() },
    urlSnapshot: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    textVersion: { create: jest.fn() },
  };
  prisma['$transaction'] = jest.fn(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return { prisma };
});

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

const mockFetch = jest.fn();
jest.mock('../../src/lib/archiveHttp', () => ({
  ...jest.requireActual<typeof import('../../src/lib/archiveHttp')>('../../src/lib/archiveHttp'),
  fetchCaptureBytes: mockFetch,
}));

// ESM-only through jsdom: mocked here, and reached by the walk through the
// dynamic-import pattern the plan's hazards list names.
const mockDerive = jest.fn();
jest.mock('../../src/lib/chromeRulesetApply', () => ({ deriveTextUnderRuleset: mockDerive }));

const mockStoreCapture = jest.fn();
jest.mock('../../src/services/recordCapture', () => ({ storeCapture: mockStoreCapture }));

const mockRecordDiff = jest.fn();
jest.mock('../../src/services/recordDiff', () => ({ recordDiff: mockRecordDiff }));

const mockAnalyzeChange = jest.fn();
jest.mock('../../src/services/ForensicAgent', () => ({
  ForensicAgent: jest.fn().mockImplementation(() => ({ analyzeChange: mockAnalyzeChange })),
}));

// The gates are gateOrder's; here they are a seam. A mock that calls
// `input.classify` stands in for Gate 5 having run.
const mockEvaluate = jest.fn();
jest.mock('../../src/walk/evaluate', () => ({ evaluateCapture: mockEvaluate }));

import { WaybackFetchError } from '../../src/lib/archiveHttp';
import { prisma } from '../../src/lib/prisma';
import { rulesetId } from '../../src/walk/derivations';
import { scanCapturesHandler } from '../../src/walk/tools';
import { T09, T14, T2, T3, BASE, EMPTY_ID, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// scan_captures — A5. Phases 1–4 and Flow 3: the walk, bootstrap included.
//
//   does      from NEXT_ROW, up to maxCaptures rows · fetches RAW replay,
//             verifies the digest · derives under RULES_IN_FORCE at the row's
//             timestamp · compares with the PREDECESSOR · the gates · stores and
//             anchors, or holds the bytes and stops
//   returns   { walked, outcomes: { identical, duplicate, acquired, unservable,
//               superseded, restamped }, stop, next }
//   refuses   NOT_SURVEYED · maxCaptures < 1 · NO_RESEARCHER · a stop already
//             pending → returns it, walks nothing
//
// THREE RULINGS, 2026-09-03. A RESOLVED novel capture skips the GATES, not the
// classifier: its diff is written with a classification and stops nothing.
// `restamped` counts a stale ACQUIRED row re-derived to the same textHash — no
// version written, the ruleset id moves. A transient fetch failure leaves the
// row UNFETCHED and returns ARCHIVE_UNAVAILABLE at that row, everything before
// it kept; a durable 404 is UNSERVABLE.
//
// ONE PAID CALL PER ACQUIRED CAPTURE. When Gate 5 ran, the walk carries its
// verdict to the diff; when the gates were skipped, the walk classifies at
// acquisition. Either way `analyzeChange` is called exactly once, which the
// evaluate mock makes observable by calling `input.classify` itself.
//
// RED until step 4 (reporting) and step 5 (writing) build `src/walk/tools`.
// ---------------------------------------------------------------------------

const RESEARCHER = 'researcher-1';
const URL = 'https://example.gov.il/page';
const TRACKED = 'page-1';
const ABC = Buffer.from('<html>abc</html>');
const DIGEST_OF_ABC = '2ALYL55WYSWHKBLTC6NABOPUYCJ36ZBI';

type Mock = jest.Mock;
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const delegate = (name: string): Record<string, Mock> => db[name] ?? {};
const trackedFind = delegate('trackedUrl')['findUnique'] as Mock;
const rowsFind = delegate('cdxIndexEntry')['findMany'] as Mock;
const rowUpdate = delegate('cdxIndexEntry')['update'] as Mock;
const rulesFind = delegate('rule')['findMany'] as Mock;
const decisionsFind = delegate('pageDecision')['findMany'] as Mock;
const snapshotFind = delegate('urlSnapshot')['findUnique'] as Mock;
const snapshotsFind = delegate('urlSnapshot')['findMany'] as Mock;
const snapshotUpdate = delegate('urlSnapshot')['update'] as Mock;
const versionCreate = delegate('textVersion')['create'] as Mock;
const transaction = (prisma as unknown as { $transaction: Mock }).$transaction;

interface Row {
  id: string;
  trackedUrlId: string;
  waybackTimestamp: string;
  digest: string;
  status: string;
  comparedTo: string | null;
  rulesetId: string | null;
  textHash: string | null;
  textExtractionVersion: string | null;
  snapshotId: string | null;
  heldBody: Buffer | null;
  stop: { gates: { gate: number | string; material: unknown }[] } | null;
  digestVerified: boolean | null;
  contentType: string | null;
  contentEncoding: string | null;
}

function row(waybackTimestamp: string, status: string, extra: Partial<Row> = {}): Row {
  return {
    id: `row-${waybackTimestamp}`,
    trackedUrlId: TRACKED,
    waybackTimestamp,
    digest: DIGEST_OF_ABC,
    status,
    comparedTo: null,
    rulesetId: null,
    textHash: null,
    textExtractionVersion: null,
    snapshotId: null,
    heldBody: null,
    stop: null,
    digestVerified: null,
    contentType: null,
    contentEncoding: null,
    ...extra,
  };
}

/** An ACQUIRED row and the snapshot it became, derived under `rulesetId` to `textHash`. */
function acquired(ts: string, textHash = 'hash-old', rulesetIdOfRow = EMPTY_ID) {
  const snapshotId = `snap-${ts}`;
  return {
    row: row(ts, 'ACQUIRED', { snapshotId, rulesetId: rulesetIdOfRow, textHash, textExtractionVersion: BASE }),
    snapshot: {
      id: snapshotId,
      trackedUrlId: TRACKED,
      waybackTimestamp: ts,
      text: `text of ${ts}`,
      textHash,
      textExtractionVersion: BASE,
      document: ABC,
      documentContentType: 'text/html',
      documentContentEncoding: null,
    },
  };
}

/** What the reused derivation returns, for a given textHash. */
const derived = (textHash: string, removed: { selector: string; text: string }[] = []) => ({
  text: `derived ${textHash}`,
  textHash,
  textExtractionVersion: BASE,
  chrome: {
    html: '<html/>',
    removedText: removed.map((r) => r.text).join('\n'),
    removedSegments: removed,
    matchCounts: Object.fromEntries(removed.map((r) => [r.selector, 1])),
    invalidSelectors: [],
  },
});

const fired = (capture: string, gate: number | string, material: unknown = {}) => ({ capture, gates: [{ gate, material }] });

/** The merged `data` of every update to the row at `ts`. */
function updatesTo(ts: string): Record<string, unknown> {
  return rowUpdate.mock.calls
    .map(([call]: [{ where: { id?: string }; data: Record<string, unknown> }]) => call)
    .filter((call) => call.where.id === `row-${ts}`)
    .reduce((merged, call) => ({ ...merged, ...call.data }), {});
}

function page(rows: Row[], snapshots: ReturnType<typeof acquired>['snapshot'][] = []) {
  rowsFind.mockResolvedValue(rows);
  snapshotsFind.mockResolvedValue(snapshots);
  snapshotFind.mockImplementation(async ({ where }: { where: { id: string } }) =>
    snapshots.find((s) => s.id === where.id) ?? null,
  );
}

async function scan(maxCaptures = 10): Promise<Record<string, unknown>> {
  return JSON.parse(await scanCapturesHandler({ url: URL, maxCaptures })) as Record<string, unknown>;
}

const T09_ACQUIRED = acquired(T09);

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(RESEARCHER);
  trackedFind.mockResolvedValue({ id: TRACKED, url: URL });
  rulesFind.mockResolvedValue([]);
  decisionsFind.mockResolvedValue(log([], [D.accepted(T09)]));
  rowUpdate.mockResolvedValue({});
  snapshotUpdate.mockResolvedValue({});
  versionCreate.mockResolvedValue({ id: 'version-1' });
  mockFetch.mockResolvedValue({ bytes: ABC, contentType: 'text/html', contentEncoding: null });
  mockDerive.mockReturnValue(derived('hash-new'));
  mockEvaluate.mockResolvedValue(null);
  mockAnalyzeChange.mockResolvedValue({ editorial: true, deletedItems: [], addedItems: [], legalSignificance: '', investigativeCategories: [], isLegallySignificant: false });
  mockStoreCapture.mockResolvedValue({ snapshotId: 'snap-new' });
  mockRecordDiff.mockResolvedValue({ id: 'diff-1' });
  page([T09_ACQUIRED.row, row(T14, 'UNFETCHED')], [T09_ACQUIRED.snapshot]);
});

describe('scan_captures — refusals', () => {
  it('refuses NOT_SURVEYED for a page with no TrackedUrl, fetching and writing nothing', async () => {
    trackedFind.mockResolvedValue(null);
    await expect(scan()).resolves.toEqual({ error: expect.any(String), code: 'NOT_SURVEYED' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(rowUpdate).not.toHaveBeenCalled();
  });

  it('refuses maxCaptures below one', async () => {
    await expect(scan(0)).resolves.toEqual({ error: expect.any(String), code: 'INVALID_MAX_CAPTURES' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses NO_RESEARCHER with no researcher in context', async () => {
    mockResearcherId.mockReturnValue(null);
    await expect(scan()).resolves.toEqual({ error: expect.any(String), code: 'NO_RESEARCHER' });
  });

  // RULED: the row holds the stop it stopped on, `{ gates }`, so a pending stop
  // is returned VERBATIM — material included — not re-derived.
  it('returns a pending stop verbatim from the row, and walks nothing', async () => {
    const gates = [{ gate: 1, material: { nowRemoved: [], nowKept: ['ticker'], against: 'PREDECESSOR' } }];
    page([T09_ACQUIRED.row, row(T14, 'PENDING_JUDGEMENT', { heldBody: ABC, stop: { gates } })], [T09_ACQUIRED.snapshot]);
    const result = await scan();
    expect(result['walked']).toBe(0);
    expect(result['stop']).toEqual({ capture: T14, gates, markingUrl: expect.any(String) });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockEvaluate).not.toHaveBeenCalled();
    expect(rowUpdate).not.toHaveBeenCalled();
  });

  // RULED: "a stop already pending" means a PENDING row WITH a stop. A reset
  // clears the stop and keeps the bytes; such a row is awaiting evaluation,
  // and the walk evaluates it — Gate 0, by construction — rather than
  // returning a stop written under authority that no longer exists.
  it('evaluates a PENDING_JUDGEMENT row whose stop is null, from its held bytes, rather than returning it', async () => {
    page([T09_ACQUIRED.row, row(T14, 'PENDING_JUDGEMENT', { heldBody: ABC, stop: null })], [T09_ACQUIRED.snapshot]);
    decisionsFind.mockResolvedValue(log([], [D.accepted(T09), D.reset()]));
    mockEvaluate.mockResolvedValue(fired(T14, 0));
    const result = await scan();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockEvaluate).toHaveBeenCalledTimes(1);
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'PENDING_JUDGEMENT', stop: { gates: [{ gate: 0, material: {} }] } }));
    expect(result['stop']).toEqual(expect.objectContaining({ capture: T14, gates: [{ gate: 0, material: {} }] }));
  });
});

describe('scan_captures — the digest shortcut', () => {
  it('records IDENTICAL without fetching when the digest equals the preceding row’s and its text is KNOWN', async () => {
    const result = await scan();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDerive).not.toHaveBeenCalled();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'IDENTICAL', comparedTo: T09 }));
    expect(result['outcomes']).toEqual(expect.objectContaining({ identical: 1 }));
  });

  it('fetches when the preceding row with the same digest is UNSERVABLE — bytes we never read say nothing', async () => {
    page([T09_ACQUIRED.row, row(T14, 'UNSERVABLE'), row(T2, 'UNFETCHED')], [T09_ACQUIRED.snapshot]);
    await scan();
    expect(mockFetch).toHaveBeenCalledWith(URL, T2, expect.anything());
  });

  it('fetches when the preceding row with the same digest is SKIPPED — a verdict is not inferred', async () => {
    page([T09_ACQUIRED.row, row(T14, 'SKIPPED'), row(T2, 'UNFETCHED')], [T09_ACQUIRED.snapshot]);
    await scan();
    expect(mockFetch).toHaveBeenCalledWith(URL, T2, expect.anything());
    expect(mockEvaluate).toHaveBeenCalled();
  });

  // RULED: the shortcut rests on replay serving the bytes the crawler stored.
  // One mismatch on a page is the finding that makes it unsafe there, so while
  // any row on the page carries digestVerified = false the shortcut is off —
  // derived from the rows, observable, and in practice permanent.
  it('fetches a same-digest row when any row on the page carries digestVerified false, the mismatch long resolved', async () => {
    const mismatch = row(T14, 'SKIPPED', { digest: 'Z', digestVerified: false });
    const known = acquired(T2);
    page([T09_ACQUIRED.row, mismatch, known.row, row(T3, 'UNFETCHED')], [T09_ACQUIRED.snapshot, known.snapshot]);
    await scan();
    expect(mockFetch).toHaveBeenCalledWith(URL, T3, expect.anything());
    expect(updatesTo(T3)['status']).not.toBe('IDENTICAL');
  });
});

describe('scan_captures — the fetch', () => {
  const differentBytes = () => page([T09_ACQUIRED.row, row(T14, 'UNFETCHED', { digest: 'OTHERDIGEST' })], [T09_ACQUIRED.snapshot]);

  it('fetches the raw replay through the reused fetch, by page URL and timestamp', async () => {
    differentBytes();
    await scan();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(URL, T14, expect.anything());
  });

  it('records a durable 404 as UNSERVABLE and walks on', async () => {
    page([T09_ACQUIRED.row, row(T14, 'UNFETCHED', { digest: 'X' }), row(T2, 'UNFETCHED', { digest: 'Y' })], [T09_ACQUIRED.snapshot]);
    mockFetch
      .mockRejectedValueOnce(new WaybackFetchError('replay refuses it', false, 404))
      .mockResolvedValueOnce({ bytes: ABC, contentType: 'text/html', contentEncoding: null });
    const result = await scan();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'UNSERVABLE', fetchedAt: expect.anything() }));
    expect(result['walked']).toBe(2);
    expect(result['outcomes']).toEqual(expect.objectContaining({ unservable: 1 }));
  });

  // RULED: a transient failure is not a fact about the archive. The row stays
  // UNFETCHED, the walk returns ARCHIVE_UNAVAILABLE at that row, and what it
  // did before is kept — the permanent-gap-versus-retryable distinction the
  // schema's own comments insist on.
  it('leaves the row UNFETCHED and returns ARCHIVE_UNAVAILABLE on a transient failure, keeping everything before it', async () => {
    page([T09_ACQUIRED.row, row(T14, 'UNFETCHED'), row(T2, 'UNFETCHED', { digest: 'Y' })], [T09_ACQUIRED.snapshot]);
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('timeout'), { isAxiosError: true }));
    const result = await scan();
    expect(result).toEqual(expect.objectContaining({ code: 'ARCHIVE_UNAVAILABLE', capture: T2 }));
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'IDENTICAL' }));
    expect(updatesTo(T2)['status']).toBeUndefined();
  });

  it('uses the bytes held on a PENDING_JUDGEMENT row and fetches nothing', async () => {
    const held = Buffer.from('<html>held</html>');
    page([T09_ACQUIRED.row, row(T14, 'PENDING_JUDGEMENT', { heldBody: held, stop: { gates: [{ gate: 1, material: {} }] }, contentType: 'text/html' })], [T09_ACQUIRED.snapshot]);
    decisionsFind.mockResolvedValue(log([], [D.accepted(T09), D.accepted(T14)]));
    await scan();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDerive).toHaveBeenCalledWith(held, 'text/html', null, expect.anything());
  });

  it('records rawBytesHash and digestVerified on every fetched row', async () => {
    differentBytes();
    await scan();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ rawBytesHash: expect.any(String), digestVerified: true, fetchedAt: expect.anything() }));
  });
});

describe('scan_captures — derive and compare', () => {
  const novel = () => page([T09_ACQUIRED.row, row(T14, 'UNFETCHED', { digest: 'X' })], [T09_ACQUIRED.snapshot]);

  it('derives under the rules in force at the row’s timestamp, not today’s', async () => {
    const r1 = rule('r1', '.ad', T3, 'd1');
    rulesFind.mockResolvedValue([r1]);
    decisionsFind.mockResolvedValue(log([r1], [D.accepted(T09), D.corrected(T3)]));
    novel();
    await scan();
    expect(mockDerive).toHaveBeenCalledWith(ABC, 'text/html', null, { selectors: [] });
  });

  it('records DUPLICATE when the textHash equals the predecessor’s — no store, no diff, no chain, no spend', async () => {
    novel();
    mockDerive.mockReturnValue(derived('hash-old'));
    const result = await scan();
    expect(updatesTo(T14)).toEqual(
      expect.objectContaining({ status: 'DUPLICATE', comparedTo: T09, rulesetId: EMPTY_ID, textHash: 'hash-old', textExtractionVersion: BASE }),
    );
    expect(mockStoreCapture).not.toHaveBeenCalled();
    expect(mockRecordDiff).not.toHaveBeenCalled();
    expect(mockAnalyzeChange).not.toHaveBeenCalled();
    expect(result['outcomes']).toEqual(expect.objectContaining({ duplicate: 1 }));
  });

  it('acquires a novel, quiet capture: stored once, classified once by Gate 5, the diff carrying that verdict, the row ACQUIRED', async () => {
    novel();
    mockEvaluate.mockImplementation(async (input: { classify: (d: unknown) => Promise<unknown> }) => {
      await input.classify({ removed: [], added: ['derived hash-new'] });
      return null;
    });
    const result = await scan();
    expect(mockStoreCapture).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeChange).toHaveBeenCalledTimes(1);
    expect(mockRecordDiff).toHaveBeenCalledTimes(1);
    expect(mockRecordDiff.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ beforeSnapshotId: 'snap-' + T09, afterSnapshotId: 'snap-new', editorial: true }),
    );
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'ACQUIRED', snapshotId: 'snap-new', heldBody: null, stop: null }));
    expect(result['outcomes']).toEqual(expect.objectContaining({ acquired: 1 }));
  });

  // RULED: RESOLVED skips the GATES, not the classifier. The diff is written
  // with a classification; its editorial answer is recorded and stops nothing.
  it('acquires a RESOLVED capture without the gates: stored once, classified once at acquisition, the diff carrying the verdict', async () => {
    novel();
    decisionsFind.mockResolvedValue(log([], [D.accepted(T09), D.accepted(T14)]));
    mockAnalyzeChange.mockResolvedValue({ editorial: false, deletedItems: [], addedItems: [], legalSignificance: '', investigativeCategories: [], isLegallySignificant: false });
    const result = await scan();
    expect(mockEvaluate).not.toHaveBeenCalled();
    expect(mockStoreCapture).toHaveBeenCalledTimes(1);
    expect(mockAnalyzeChange).toHaveBeenCalledTimes(1);
    expect(mockRecordDiff.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ editorial: false }));
    expect(result['stop']).toBeNull();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'ACQUIRED' }));
  });
});

describe('scan_captures — stops', () => {
  const novel = () => page([T09_ACQUIRED.row, row(T14, 'UNFETCHED', { digest: 'X' }), row(T2, 'UNFETCHED', { digest: 'Y' })], [T09_ACQUIRED.snapshot]);

  it('holds the bytes and halts when a gate fires: PENDING_JUDGEMENT, the stop written on the row, nothing stored, later rows untouched', async () => {
    novel();
    const material = { nowRemoved: [], nowKept: ['ticker'], against: 'PREDECESSOR' };
    mockEvaluate.mockResolvedValue(fired(T14, 1, material));
    const result = await scan();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'PENDING_JUDGEMENT', heldBody: ABC, stop: { gates: [{ gate: 1, material }] } }));
    expect(mockStoreCapture).not.toHaveBeenCalled();
    expect(updatesTo(T2)).toEqual({});
    expect(result['walked']).toBe(1);
    expect(result['stop']).toEqual({ capture: T14, gates: [{ gate: 1, material }], markingUrl: expect.any(String) });
  });

  it('carries the marking URL, ending in /article-rules/<trackedUrlId>/<capture>', async () => {
    novel();
    mockEvaluate.mockResolvedValue(fired(T14, 1));
    const result = await scan();
    expect((result['stop'] as { markingUrl: string }).markingUrl.endsWith(`/article-rules/${TRACKED}/${T14}`)).toBe(true);
  });

  it('records a digest mismatch: digestVerified false, the DIGEST stop with expected and got', async () => {
    novel();
    const material = { expected: 'X', got: DIGEST_OF_ABC };
    mockEvaluate.mockResolvedValue(fired(T14, 'DIGEST', material));
    const result = await scan();
    expect(updatesTo(T14)).toEqual(
      expect.objectContaining({ status: 'PENDING_JUDGEMENT', digestVerified: false, heldBody: ABC, stop: { gates: [{ gate: 'DIGEST', material }] } }),
    );
    expect(result['stop']).toEqual(expect.objectContaining({ gates: [{ gate: 'DIGEST', material }] }));
  });

  it('the bootstrap: Gate 0 on a bare page holds the first capture’s bytes', async () => {
    page([row(T09, 'UNFETCHED')]);
    decisionsFind.mockResolvedValue([]);
    mockEvaluate.mockResolvedValue(fired(T09, 0));
    const result = await scan();
    expect(updatesTo(T09)).toEqual(expect.objectContaining({ status: 'PENDING_JUDGEMENT', heldBody: ABC, stop: { gates: [{ gate: 0, material: {} }] } }));
    expect(result['stop']).toEqual(expect.objectContaining({ capture: T09, gates: [{ gate: 0, material: {} }] }));
  });
});

describe('scan_captures — the chunk', () => {
  const three = () => page([T09_ACQUIRED.row, row(T14, 'UNFETCHED'), row(T2, 'UNFETCHED')], [T09_ACQUIRED.snapshot]);

  it('walks maxCaptures rows and names the next', async () => {
    three();
    const result = await scan(1);
    expect(result['walked']).toBe(1);
    expect(result['next']).toBe(T2);
    expect(updatesTo(T2)).toEqual({});
  });

  it('reports next null when the work-list is exhausted', async () => {
    three();
    const result = await scan(10);
    expect(result['walked']).toBe(2);
    expect(result['next']).toBeNull();
  });

  it('resumes from NEXT_ROW, not from the start of the page', async () => {
    page([T09_ACQUIRED.row, row(T14, 'IDENTICAL', { comparedTo: T09 }), row(T2, 'UNFETCHED', { digest: 'X' })], [T09_ACQUIRED.snapshot]);
    await scan();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(URL, T2, expect.anything());
    expect(updatesTo(T14)).toEqual({});
  });
});

describe('scan_captures — Flow 3, the re-walk over rows that already have an outcome', () => {
  const r1 = rule('r1', '.ad', T09, 'd1');
  const withRule = () => {
    rulesFind.mockResolvedValue([r1]);
    decisionsFind.mockResolvedValue(log([r1], [D.corrected(T09), D.accepted(T09)]));
  };
  const NEW_ID = rulesetId(['.ad']);

  it('re-fetches and re-derives a STALE DUPLICATE: ACQUIRED when novel now, re-recorded under this ruleset when not', async () => {
    withRule();
    const predecessor = acquired(T09, 'hash-old', NEW_ID);
    page([predecessor.row, row(T14, 'DUPLICATE', { digest: 'X', comparedTo: T09, rulesetId: EMPTY_ID, textHash: 'hash-old', textExtractionVersion: BASE })], [predecessor.snapshot]);
    mockDerive.mockReturnValue(derived('hash-new'));
    let result = await scan();
    expect(mockFetch).toHaveBeenCalledWith(URL, T14, expect.anything());
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'ACQUIRED', snapshotId: 'snap-new' }));
    expect(result['outcomes']).toEqual(expect.objectContaining({ acquired: 1 }));

    jest.clearAllMocks();
    withRule();
    page([predecessor.row, row(T14, 'DUPLICATE', { digest: 'X', comparedTo: T09, rulesetId: EMPTY_ID, textHash: 'hash-old', textExtractionVersion: BASE })], [predecessor.snapshot]);
    mockFetch.mockResolvedValue({ bytes: ABC, contentType: 'text/html', contentEncoding: null });
    mockDerive.mockReturnValue(derived('hash-old'));
    mockEvaluate.mockResolvedValue(null);
    result = await scan();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ status: 'DUPLICATE', rulesetId: NEW_ID }));
    expect(mockStoreCapture).not.toHaveBeenCalled();
  });

  it('supersedes a STALE ACQUIRED capture whose text changed: the previous text kept as a TextVersion, in one transaction, nothing re-stored', async () => {
    withRule();
    const predecessor = acquired(T09, 'hash-09', NEW_ID);
    const stale = acquired(T14, 'hash-old', EMPTY_ID);
    page([predecessor.row, stale.row], [predecessor.snapshot, stale.snapshot]);
    mockDerive.mockReturnValue(derived('hash-new'));
    const result = await scan();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockDerive).toHaveBeenCalledWith(ABC, 'text/html', null, { selectors: ['.ad'] });
    expect(transaction).toHaveBeenCalled();
    expect(versionCreate.mock.calls[0]?.[0]).toEqual({
      data: expect.objectContaining({ snapshotId: stale.snapshot.id, text: stale.snapshot.text, textHash: 'hash-old', textExtractionVersion: BASE, rulesetId: EMPTY_ID }),
    });
    expect(snapshotUpdate.mock.calls[0]?.[0]).toEqual({
      where: { id: stale.snapshot.id },
      data: expect.objectContaining({ text: 'derived hash-new', textHash: 'hash-new' }),
    });
    expect(mockStoreCapture).not.toHaveBeenCalled();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ rulesetId: NEW_ID, textHash: 'hash-new' }));
    expect(result['outcomes']).toEqual(expect.objectContaining({ superseded: 1 }));
  });

  // RULED: the same textHash under the new rules is not a new version. The row
  // is re-stamped with the ruleset id and counted as `restamped`.
  it('re-stamps a STALE ACQUIRED capture whose text did not change: no version, the ruleset id moves', async () => {
    withRule();
    const predecessor = acquired(T09, 'hash-09', NEW_ID);
    const stale = acquired(T14, 'hash-old', EMPTY_ID);
    page([predecessor.row, stale.row], [predecessor.snapshot, stale.snapshot]);
    mockDerive.mockReturnValue(derived('hash-old'));
    const result = await scan();
    expect(versionCreate).not.toHaveBeenCalled();
    expect(snapshotUpdate).not.toHaveBeenCalled();
    expect(updatesTo(T14)).toEqual(expect.objectContaining({ rulesetId: NEW_ID }));
    expect(result['outcomes']).toEqual(expect.objectContaining({ restamped: 1, superseded: 0 }));
  });

  it('leaves IDENTICAL, SKIPPED and UNSERVABLE rows untouched by a re-walk', async () => {
    withRule();
    const predecessor = acquired(T09, 'hash-09', NEW_ID);
    page([predecessor.row, row(T14, 'IDENTICAL', { comparedTo: T09 }), row(T2, 'SKIPPED'), row(T3, 'UNSERVABLE')], [predecessor.snapshot]);
    const result = await scan();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(rowUpdate).not.toHaveBeenCalled();
    expect(result['walked']).toBe(0);
    expect(result['next']).toBeNull();
  });
});

describe('scan_captures — the return', () => {
  it('returns exactly A5’s keys, and the six outcome counts', async () => {
    const result = await scan();
    expect(Object.keys(result).sort()).toEqual(['next', 'outcomes', 'stop', 'walked']);
    expect(Object.keys(result['outcomes'] as object).sort()).toEqual(
      ['acquired', 'duplicate', 'identical', 'restamped', 'superseded', 'unservable'].sort(),
    );
  });
});
