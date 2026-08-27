jest.mock('../src/lib/prisma', () => ({
  prisma: {
    cdxQuery: { create: jest.fn() },
    cdxIndexEntry: { createMany: jest.fn(), updateMany: jest.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import {
  recordCdxObservation,
  markCdxEntryStored,
  markCdxEntryUnservable,
} from '../src/services/recordCdxObservation';

const queryCreate = prisma.cdxQuery.create as unknown as jest.Mock;
const entryCreateMany = prisma.cdxIndexEntry.createMany as unknown as jest.Mock;
const entryUpdateMany = prisma.cdxIndexEntry.updateMany as unknown as jest.Mock;

const TRACKED = 'tracked-1';
const AT = new Date('2026-08-27T22:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  queryCreate.mockResolvedValue({ id: 'q1' });
  entryCreateMany.mockResolvedValue({ count: 0 });
  entryUpdateMany.mockResolvedValue({ count: 1 });
});

describe('a CDX query is recorded even when it returned NOTHING', () => {
  // This is the entire justification for the CdxQuery table, and the case Level 2
  // Phase B routes on. Zero rows create zero entries, so without a record of the
  // ASKING, an empty answer is indistinguishable from never having asked — the
  // never-looked-versus-nothing-there conflation that has already cost this
  // project four times (UNAVAILABLE vs data, the 404 in a JSON blob,
  // documentContentEncoding, and totalSnapshots: 0).
  it('writes a query row with rowCount 0 and creates no entries', async () => {
    await recordCdxObservation({
      trackedUrlId: TRACKED,
      queriedAt: AT,
      fromDate: undefined,
      rows: [],
      hasMore: false,
    });

    expect(queryCreate).toHaveBeenCalledTimes(1);
    const { data } = queryCreate.mock.calls[0][0];
    expect(data.rowCount).toBe(0);
    expect(data.trackedUrlId).toBe(TRACKED);
    expect(data.queriedAt).toBe(AT);
    expect(data.fromDate).toBeNull();

    expect(entryCreateMany).not.toHaveBeenCalled();
  });

  it('records the fromDate bound, so an empty answer is interpretable', async () => {
    // "Nothing after 2026-03-05" and "nothing at all" are different facts, and a
    // rowCount of 0 alone cannot tell them apart.
    await recordCdxObservation({
      trackedUrlId: TRACKED,
      queriedAt: AT,
      fromDate: '20260305020414',
      rows: [],
      hasMore: false,
    });
    expect(queryCreate.mock.calls[0][0].data.fromDate).toBe('20260305020414');
  });
});

describe('index entries are appended, never overwritten', () => {
  it('creates one UNFETCHED entry per row, stamped with when the Archive said it', async () => {
    await recordCdxObservation({
      trackedUrlId: TRACKED,
      queriedAt: AT,
      rows: [
        { timestamp: '20220403152841', digest: 'AAA' },
        { timestamp: '20220404152841', digest: 'BBB' },
      ],
      hasMore: false,
    });

    const { data, skipDuplicates } = entryCreateMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      trackedUrlId: TRACKED,
      waybackTimestamp: '20220403152841',
      digest: 'AAA',
      status: 'UNFETCHED',
      observedAt: AT,
    });
    // skipDuplicates rather than upsert: observedAt means WHEN WE FIRST SAW THIS,
    // so re-observing an unchanged entry must not move it — that timestamp is
    // what makes drift legible when a second row appears with a later one. It
    // also stops a later scan resetting a STORED entry back to UNFETCHED.
    expect(skipDuplicates).toBe(true);
  });

  it('never issues an update from the observation path', async () => {
    await recordCdxObservation({
      trackedUrlId: TRACKED,
      queriedAt: AT,
      rows: [{ timestamp: '20220403152841', digest: 'AAA' }],
      hasMore: true,
    });
    expect(entryUpdateMany).not.toHaveBeenCalled();
  });
});

describe('an entry is keyed on the digest when its status advances', () => {
  it('links a stored capture to the entry whose digest it actually came from', async () => {
    await markCdxEntryStored({
      trackedUrlId: TRACKED,
      waybackTimestamp: '20220403152841',
      digest: 'AAA',
      snapshotId: 'snap-1',
    });

    const { where, data } = entryUpdateMany.mock.calls[0][0];
    // Without the digest in the key, a drifted re-observation of the same instant
    // could receive the link — attaching our capture to an index entry it did not
    // come from, which is the drift-detection capability defeating itself.
    expect(where.digest).toBe('AAA');
    expect(where.waybackTimestamp).toBe('20220403152841');
    expect(data).toEqual({ status: 'STORED', snapshotId: 'snap-1' });
  });

  it('marks UNSERVABLE without ever demoting a capture we hold', async () => {
    await markCdxEntryUnservable({
      trackedUrlId: TRACKED,
      waybackTimestamp: '20240829085520',
      digest: 'CCC',
    });

    const { where, data } = entryUpdateMany.mock.calls[0][0];
    expect(data).toEqual({ status: 'UNSERVABLE' });
    // A 404 on a re-fetch of something already stored is a fact about the replay,
    // not a reason to forget the bytes.
    expect(where.status).toEqual({ not: 'STORED' });
  });
});
