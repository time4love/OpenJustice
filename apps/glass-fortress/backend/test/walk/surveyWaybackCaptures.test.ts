jest.mock('../../src/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    trackedUrl: { findUnique: jest.fn(), create: jest.fn() },
    cdxQuery: { create: jest.fn() },
    cdxIndexEntry: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
    rule: { findMany: jest.fn() },
    pageDecision: { findMany: jest.fn() },
  };
  prisma['$transaction'] = jest.fn(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return { prisma };
});

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

const mockQueryCdxIndex = jest.fn();
jest.mock('../../src/services/WaybackScraper', () => ({
  WaybackScraper: jest.fn().mockImplementation(() => ({ queryCdxIndex: mockQueryCdxIndex })),
}));

const mockFetchCaptureBytes = jest.fn();
jest.mock('../../src/lib/archiveHttp', () => ({
  ...jest.requireActual<typeof import('../../src/lib/archiveHttp')>('../../src/lib/archiveHttp'),
  fetchCaptureBytes: mockFetchCaptureBytes,
}));

import { prisma } from '../../src/lib/prisma';
import { rulesetId } from '../../src/walk/derivations';
import { surveyWaybackCapturesHandler } from '../../src/walk/tools';
import { T09, T14, T2, T3, EMPTY_ID, rule, D, log } from './fixtures';

// ---------------------------------------------------------------------------
// survey_wayback_captures — A5. Phase 0: the one entry to the corpus, and the
// work-list.
//
//   does      creates TrackedUrl if absent (createdById = researcher) · CDX
//             query, all pages · upserts WorkListRows (append only; existing
//             rows untouched) · records the query · LEGACY JOIN: a new row whose
//             (page, timestamp) matches an existing UrlSnapshot is written
//             ACQUIRED with that snapshotId, rulesetId = RULESET_ID(page, t) and
//             the snapshot's textExtractionVersion
//   returns   { trackedUrlId, created, captures, byteDistinct, span, held,
//               appended, unservable }
//   refuses   NO_RESEARCHER · ARCHIVE_UNAVAILABLE, nothing written
//
// Every refusal is a JSON { error, code }, never a throw. The handler reads the
// researcher from the request context, exactly as the existing tools do, and is
// tested at the same seams they are: the database mocked at `src/lib/prisma`,
// the archive mocked at the reused `queryCdxIndex`, and the capture fetch mocked
// to prove it is never made — Phase 0 is "one query, no page fetches".
//
// EFFECTS, NOT MECHANISM. The rows the survey leaves behind are read back from
// every write the mock saw, whichever verb produced them, so the file holds the
// contract and not one implementation of it.
//
// RED until step 2 builds `src/walk/tools`.
// ---------------------------------------------------------------------------

const RESEARCHER = 'researcher-1';
const URL = 'https://example.gov.il/page';
const TRACKED = 'page-1';

type Mock = jest.Mock;
// The mock's own shape, not the generated client's: `rule` and `pageDecision`
// reach PrismaClient with step 1's schema, and this file must not wait on it.
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const delegate = (name: string): Record<string, Mock> => db[name] ?? {};
const trackedFind = delegate('trackedUrl')['findUnique'] as Mock;
const trackedCreate = delegate('trackedUrl')['create'] as Mock;
const queryCreate = delegate('cdxQuery')['create'] as Mock;
const rowsFind = delegate('cdxIndexEntry')['findMany'] as Mock;
const rowsCreateMany = delegate('cdxIndexEntry')['createMany'] as Mock;
const rowUpdate = delegate('cdxIndexEntry')['update'] as Mock;
const rowsUpdateMany = delegate('cdxIndexEntry')['updateMany'] as Mock;
const snapshotsFind = delegate('urlSnapshot')['findMany'] as Mock;
const rulesFind = delegate('rule')['findMany'] as Mock;
const decisionsFind = delegate('pageDecision')['findMany'] as Mock;

const WRITES = [trackedCreate, queryCreate, rowsCreateMany, rowUpdate, rowsUpdateMany];

interface CdxRow {
  timestamp: string;
  digest: string;
}
const cdx = (timestamp: string, digest: string): CdxRow => ({ timestamp, digest });

/** One page of the archive's answer, in the shape the reused query returns. */
const page = (rows: CdxRow[], hasMore = false) => ({ snapshots: rows, hasMore, rawRows: rows });

/** An existing work-list row on the page. */
const existing = (waybackTimestamp: string, status: string, digest = 'A') => ({ waybackTimestamp, status, digest });

/** The first `waybackTimestamp` found anywhere in a `where` clause. */
function timestampIn(where: unknown): string | undefined {
  if (where === null || typeof where !== 'object') return undefined;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === 'waybackTimestamp' && typeof value === 'string') return value;
    const nested = timestampIn(value);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** The final state of every row the survey wrote, by timestamp, whichever verb wrote it. */
function rowsWritten(): Map<string, Record<string, unknown>> {
  const rows = new Map<string, Record<string, unknown>>();
  const merge = (timestamp: string | undefined, data: Record<string, unknown>) => {
    if (timestamp === undefined) return;
    rows.set(timestamp, { ...(rows.get(timestamp) ?? {}), ...data });
  };
  for (const [call] of rowsCreateMany.mock.calls as [{ data: Record<string, unknown>[] }][]) {
    for (const data of call.data) merge(data['waybackTimestamp'] as string | undefined, data);
  }
  for (const [call] of [...rowUpdate.mock.calls, ...rowsUpdateMany.mock.calls] as [
    { where: unknown; data: Record<string, unknown> },
  ][]) {
    merge(timestampIn(call.where), call.data);
  }
  return rows;
}

async function survey(): Promise<Record<string, unknown>> {
  return JSON.parse(await surveyWaybackCapturesHandler({ url: URL })) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(RESEARCHER);
  trackedFind.mockResolvedValue({ id: TRACKED, url: URL });
  trackedCreate.mockResolvedValue({ id: TRACKED, url: URL });
  queryCreate.mockResolvedValue({ id: 'q1' });
  rowsFind.mockResolvedValue([]);
  rowsCreateMany.mockResolvedValue({ count: 0 });
  rowUpdate.mockResolvedValue({});
  rowsUpdateMany.mockResolvedValue({ count: 0 });
  snapshotsFind.mockResolvedValue([]);
  rulesFind.mockResolvedValue([]);
  decisionsFind.mockResolvedValue([]);
  mockQueryCdxIndex.mockResolvedValue(page([cdx(T09, 'A'), cdx(T14, 'A'), cdx(T2, 'B')]));
});

describe('survey_wayback_captures — refusals, as JSON, with nothing written', () => {
  it('refuses NO_RESEARCHER with no researcher in context', async () => {
    mockResearcherId.mockReturnValue(null);
    await expect(survey()).resolves.toEqual({ error: expect.any(String), code: 'NO_RESEARCHER' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });

  // The TrackedUrl follows the archive's answer: a page the archive could not
  // be asked about has not entered the corpus.
  it('refuses ARCHIVE_UNAVAILABLE when the CDX query fails, and writes nothing — the TrackedUrl included', async () => {
    trackedFind.mockResolvedValue(null);
    mockQueryCdxIndex.mockRejectedValue(new Error('CDX timed out'));
    await expect(survey()).resolves.toEqual({ error: expect.any(String), code: 'ARCHIVE_UNAVAILABLE' });
    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
  });
});

describe('survey_wayback_captures — the one entry to the corpus', () => {
  it('creates the TrackedUrl on the first survey, attributed to the researcher', async () => {
    trackedFind.mockResolvedValue(null);
    const result = await survey();
    expect(trackedCreate).toHaveBeenCalledTimes(1);
    expect(trackedCreate.mock.calls[0]?.[0]).toEqual({
      data: expect.objectContaining({ url: URL, createdById: RESEARCHER }),
    });
    expect(result).toEqual(expect.objectContaining({ trackedUrlId: TRACKED, created: true }));
  });

  it('does not create it again on a second survey', async () => {
    const result = await survey();
    expect(trackedCreate).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ trackedUrlId: TRACKED, created: false }));
  });

  // RULED: zero rows is an answer. The page is in the corpus, the asking is
  // recorded — an empty answer is not the archive being unavailable, and it is
  // not the same as never having asked.
  it('with an empty answer, creates the TrackedUrl, records one query with rowCount 0, and writes nothing else', async () => {
    trackedFind.mockResolvedValue(null);
    mockQueryCdxIndex.mockResolvedValue(page([]));
    const result = await survey();
    expect(trackedCreate).toHaveBeenCalledTimes(1);
    expect(queryCreate).toHaveBeenCalledTimes(1);
    expect(queryCreate.mock.calls[0]?.[0]).toEqual({ data: expect.objectContaining({ rowCount: 0 }) });
    expect(rowsWritten().size).toBe(0);
    expect(result).toEqual(expect.objectContaining({ created: true, captures: 0, appended: 0, byteDistinct: 0, span: null }));
  });
});

describe('survey_wayback_captures — the work-list', () => {
  it('asks for every page the archive has, and records each query with its rowCount and hasMore', async () => {
    mockQueryCdxIndex
      .mockResolvedValueOnce(page([cdx(T09, 'A'), cdx(T14, 'A')], true))
      .mockResolvedValueOnce(page([cdx(T2, 'B')], true))
      .mockResolvedValueOnce(page([cdx(T3, 'B')], false));
    const result = await survey();
    expect(mockQueryCdxIndex).toHaveBeenCalledTimes(3);
    expect(queryCreate).toHaveBeenCalledTimes(3);
    const recorded = queryCreate.mock.calls.map(([call]: [{ data: { rowCount: number; hasMore: boolean } }]) => call.data);
    expect(recorded.map((q) => [q.rowCount, q.hasMore])).toEqual([[2, true], [1, true], [1, false]]);
    expect(result).toEqual(expect.objectContaining({ captures: 4 }));
  });

  it('appends only the rows the page does not hold, UNFETCHED with their digests, and touches no existing row', async () => {
    rowsFind.mockResolvedValue([existing(T09, 'UNFETCHED'), existing(T14, 'UNFETCHED')]);
    const result = await survey();
    const written = rowsWritten();
    expect([...written.keys()]).toEqual([T2]);
    expect(written.get(T2)).toEqual(expect.objectContaining({ digest: 'B', status: 'UNFETCHED' }));
    expect(result).toEqual(expect.objectContaining({ appended: 1, captures: 3 }));
  });

  // The migrating assertion from recoverMissingCaptures: "keeps every row,
  // reverts included". A page returning to a former state is a revert, and a
  // revert is a capture. The byte-distinct count is the archive's own change
  // signal — a digest differing from the one immediately before, the first
  // capture counting — and is the upper bound on fetches.
  it('keeps every row, reverts included, and counts byte-distinct captures against the one immediately before', async () => {
    mockQueryCdxIndex.mockResolvedValue(page([cdx(T09, 'A'), cdx(T14, 'A'), cdx(T2, 'B'), cdx(T3, 'A')]));
    const result = await survey();
    expect([...rowsWritten().keys()].sort()).toEqual([T09, T14, T2, T3]);
    expect(result).toEqual(expect.objectContaining({ captures: 4, byteDistinct: 3 }));
  });

  // Seen on the Walla page, 2026-09-05: the archive's index returned one
  // timestamp twice in a single answer. A capture is named by its timestamp
  // (A1), so a repeated row is the same capture reported twice, not a second
  // one. On a page that already holds the row the filter drops both copies; on
  // a NEW page both would reach the one createMany, and A2's unique key on
  // (page, timestamp) would make the survey THROW where A5 says a refusal,
  // never a throw. The answer is de-duplicated by timestamp before filtering,
  // first occurrence wins — asserted on the rows handed to createMany, because
  // rowsWritten() is keyed by timestamp and would hide a second copy.
  it('the archive reports one timestamp twice; one row is written', async () => {
    mockQueryCdxIndex.mockResolvedValue(page([cdx(T09, 'A'), cdx(T14, 'A'), cdx(T14, 'X'), cdx(T2, 'B')]));
    const result = await survey();
    const inserted = rowsCreateMany.mock.calls.flatMap(
      ([call]: [{ data: { waybackTimestamp: string; digest: string }[] }]) => call.data,
    );
    expect(inserted.map((row) => row.waybackTimestamp)).toEqual([T09, T14, T2]);
    expect(inserted.find((row) => row.waybackTimestamp === T14)?.digest).toBe('A');
    expect(result).toEqual(expect.objectContaining({ captures: 3, appended: 3, byteDistinct: 2 }));
  });

  it('reports the span as the ISO dates of the earliest and latest capture on the page', async () => {
    mockQueryCdxIndex.mockResolvedValue(page([cdx(T2, 'B'), cdx(T09, 'A'), cdx(T3, 'B')]));
    const result = await survey();
    expect(result['span']).toEqual({ from: '2020-03-01', to: '2020-03-03' });
  });

  it('counts held and unservable over the whole page after the survey', async () => {
    rowsFind.mockResolvedValue([existing(T09, 'ACQUIRED'), existing(T14, 'UNSERVABLE')]);
    snapshotsFind.mockResolvedValue([{ id: 'snap-2', waybackTimestamp: T2, textExtractionVersion: 'v2-x' }]);
    const result = await survey();
    expect(result).toEqual(expect.objectContaining({ held: 2, unservable: 1 }));
  });

  it('never fetches a capture — one query, no page fetches', async () => {
    await survey();
    expect(mockFetchCaptureBytes).not.toHaveBeenCalled();
  });

  it('returns exactly A5’s keys', async () => {
    const result = await survey();
    expect(Object.keys(result).sort()).toEqual(
      ['appended', 'byteDistinct', 'captures', 'created', 'held', 'span', 'trackedUrlId', 'unservable'].sort(),
    );
  });
});

describe('survey_wayback_captures — the legacy join', () => {
  // 83 of 112 staging snapshots predate the CDX table and have no row. Their
  // first survey writes the row and links it by page and timestamp, ACQUIRED,
  // carrying the ruleset id in force at that timestamp — the empty set's until a
  // rule exists — and the snapshot's extraction version, so a null never
  // reaches STALE.
  it('writes a new row whose timestamp matches an existing snapshot as ACQUIRED, with the empty ruleset and the snapshot’s version', async () => {
    snapshotsFind.mockResolvedValue([{ id: 'snap-2', waybackTimestamp: T2, textExtractionVersion: 'v2-x' }]);
    await survey();
    expect(rowsWritten().get(T2)).toEqual(
      expect.objectContaining({ status: 'ACQUIRED', snapshotId: 'snap-2', rulesetId: EMPTY_ID, textExtractionVersion: 'v2-x' }),
    );
    expect(rowsWritten().get(T09)).toEqual(expect.objectContaining({ status: 'UNFETCHED' }));
  });

  it('stamps the joined row with the id of the rules in force at its timestamp', async () => {
    const r1 = rule('r1', '.ad', T09, 'd1');
    rulesFind.mockResolvedValue([r1]);
    decisionsFind.mockResolvedValue(log([r1], [D.corrected(T09)]));
    snapshotsFind.mockResolvedValue([{ id: 'snap-2', waybackTimestamp: T2, textExtractionVersion: 'v2-x' }]);
    await survey();
    expect(rowsWritten().get(T2)).toEqual(expect.objectContaining({ status: 'ACQUIRED', rulesetId: rulesetId(['.ad']) }));
  });

  it('joins nothing when no timestamp matches a snapshot', async () => {
    snapshotsFind.mockResolvedValue([{ id: 'snap-x', waybackTimestamp: T3, textExtractionVersion: 'v2-x' }]);
    await survey();
    const acquired = [...rowsWritten().values()].filter((row) => row['status'] === 'ACQUIRED');
    expect(acquired).toEqual([]);
  });
});
