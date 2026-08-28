jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: { upsert: jest.fn() },
    urlSnapshot: { findUniqueOrThrow: jest.fn() },
  },
}));

import { createHash } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { recordDiff } from '../src/services/recordDiff';
import {
  checkDiffSurvival,
  survivalSourceStateHash,
  PRESENCE_FLOOR_CHARS,
} from '../src/lib/diffSurvival';

const upsert = prisma.urlVersionDiff.upsert as unknown as jest.Mock;
const findSnapshot = prisma.urlSnapshot.findUniqueOrThrow as unknown as jest.Mock;

const V2 = 'v2-inflate-decode-htmltotext-normalised';

/** Long enough to clear the presence floor, so a match is a finding not a coincidence. */
const SENTENCE =
  'The Ministry stated that side effects are mild and temporary in all reported cases.';

function snapshot(text: string, o: Record<string, unknown> = {}) {
  return {
    text,
    textHash: createHash('sha256').update(text).digest('hex'),
    textExtractionVersion: V2,
    ...o,
  };
}

function diffWrite(o: Record<string, unknown> = {}) {
  return {
    trackedUrlId: 'tracked-1',
    beforeSnapshotId: 'snap-before',
    afterSnapshotId: 'snap-after',
    beforeDate: '2022-05-03',
    afterDate: '2022-05-04',
    snapshotUrl: 'https://web.archive.org/web/x/',
    rawDeletedText: '[]',
    rawAddedText: '[]',
    ...o,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  upsert.mockResolvedValue({ id: 'diff-1' });
});

// ---------------------------------------------------------------------------
// THE INVARIANT ITSELF
// ---------------------------------------------------------------------------
describe('a reported change must survive the documents', () => {
  it('SURVIVES when a removed chunk is genuinely absent from the after document', () => {
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
      beforeText: `intro\n${SENTENCE}\noutro`,
      afterText: 'intro\noutro',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('SURVIVES');
    expect(result.chunksChecked).toBe(1);
  });

  it('CONTRADICTED when a chunk said to be REMOVED is still in the after document', () => {
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
      beforeText: `intro\n${SENTENCE}`,
      afterText: `intro\n${SENTENCE}`,
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('CONTRADICTED');
    expect(result.contradicted[0]?.side).toBe('REMOVED');
  });

  it('CONTRADICTED when a chunk said to be ADDED was already in the before document', () => {
    const result = checkDiffSurvival({
      rawDeletedText: '[]',
      rawAddedText: JSON.stringify([SENTENCE]),
      beforeText: `intro\n${SENTENCE}`,
      afterText: `intro\n${SENTENCE}`,
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('CONTRADICTED');
    expect(result.contradicted[0]?.side).toBe('ADDED');
  });

  it('checks at SENTENCE granularity, not only whole chunks', () => {
    // GRANULARITY IS NOT A DETAIL: whole-chunk matching found 2 contradictions of
    // 81 and missed the case this work exists for; sentence granularity found 7.
    // Here the chunk as a whole is absent from the after document, but one
    // sentence inside it survives — which whole-chunk matching would call SURVIVES.
    const chunk = `${SENTENCE} A second sentence that really was removed entirely.`;
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([chunk]),
      rawAddedText: '[]',
      beforeText: chunk,
      afterText: `intro\n${SENTENCE}`,
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('CONTRADICTED');
  });

  it('ignores fragments below the presence floor, which match by accident', () => {
    const short = 'yes';
    expect(short.length).toBeLessThan(PRESENCE_FLOOR_CHARS); // vacuity guard
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([short]),
      rawAddedText: '[]',
      beforeText: short,
      afterText: 'yes it is still here somewhere',
      beforeVersion: V2,
      afterVersion: V2,
    });
    expect(result.verdict).toBe('SURVIVES');
  });
});

// ---------------------------------------------------------------------------
// UNCHECKABLE IS A VERDICT ABOUT THE CHECK
// ---------------------------------------------------------------------------
describe('mixed extraction versions are UNCHECKABLE, not passed or failed', () => {
  it('refuses to compare text produced by different rules', () => {
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify([SENTENCE]),
      rawAddedText: '[]',
      beforeText: SENTENCE,
      afterText: SENTENCE,
      beforeVersion: 'v1-htmltotext-normalised',
      afterVersion: V2,
    });
    // Under a single version this would be CONTRADICTED. It is not reported as
    // one, because the two sides were never comparable — and it is not reported
    // as SURVIVES either, which is the failure §3 exists to prevent.
    expect(result.verdict).toBe('UNCHECKABLE');
    expect(result.reason).toContain('different rules');
    expect(result.contradicted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE WRITE PATH STORES IT — testing the CALLER, not the checker
// ---------------------------------------------------------------------------
describe('recordDiff runs the check and stores its verdict', () => {
  // Three mutations survived in earlier sessions with one shape: a collaborator
  // tested in isolation while nothing asserted its caller reaches it. These
  // assert the caller.
  it('stores CONTRADICTED rather than refusing the write', async () => {
    findSnapshot
      .mockResolvedValueOnce(snapshot(`intro\n${SENTENCE}`))
      .mockResolvedValueOnce(snapshot(`intro\n${SENTENCE}`));

    await recordDiff(diffWrite({ rawDeletedText: JSON.stringify([SENTENCE]) }));

    const { create } = upsert.mock.calls[0][0] as { create: Record<string, unknown> };
    // WRITTEN, NOT REFUSED — refusing would delete the evidence that the pipeline
    // is wrong, which is how this was found.
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(create['survivalVerdict']).toBe('CONTRADICTED');
    expect(create['survivalChunksChecked']).toBe(1);
    expect(create['survivalContradicted']).toEqual([
      expect.objectContaining({ side: 'REMOVED' }),
    ]);
  });

  it('stores SURVIVES when the report holds', async () => {
    findSnapshot
      .mockResolvedValueOnce(snapshot(`intro\n${SENTENCE}`))
      .mockResolvedValueOnce(snapshot('intro'));

    await recordDiff(diffWrite({ rawDeletedText: JSON.stringify([SENTENCE]) }));

    const { create } = upsert.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(create['survivalVerdict']).toBe('SURVIVES');
    expect(create['survivalContradicted']).toEqual([]);
  });

  it('stores the sourceStateHash the verdict was computed against', async () => {
    const before = snapshot('before text');
    const after = snapshot('after text');
    findSnapshot.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    await recordDiff(diffWrite());

    const { create } = upsert.mock.calls[0][0] as { create: Record<string, unknown> };
    // §3's sourceStateHash: staleness becomes computable rather than assumed.
    // Level 4 changes what text a diff compares; without this, that change
    // silently invalidates every verdict while the counts stay green.
    expect(create['survivalSourceStateHash']).toBe(
      survivalSourceStateHash({
        beforeTextHash: before.textHash,
        afterTextHash: after.textHash,
        rawDeletedText: '[]',
        rawAddedText: '[]',
      }),
    );
    expect(create['survivalTextVersion']).toBe(V2);
  });

  it('commits the hash to the DIFF’S OWN CHUNKS, not only to the captures', async () => {
    // FOUND BY READING THE CALLERS, NOT THE CHECKER. `rediffFromSnapshots`
    // rewrites rawDeletedText / rawAddedText — two of the checker's four inputs —
    // while the captures it re-derives them from do not move. A hash over the
    // captures alone would be IDENTICAL before and after that rewrite, so a
    // verdict about chunks that no longer exist would report itself as current.
    findSnapshot.mockResolvedValue(snapshot('some stored capture text'));
    await recordDiff(diffWrite({ rawDeletedText: JSON.stringify([SENTENCE]) }));
    const first = (upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

    upsert.mockClear();
    findSnapshot.mockResolvedValue(snapshot('some stored capture text'));
    await recordDiff(diffWrite({ rawDeletedText: JSON.stringify([`${SENTENCE} And more.`]) }));
    const second = (upsert.mock.calls[0][0] as { create: Record<string, unknown> }).create;

    // Same captures, different reported chunks: the commitment must differ.
    expect(second['survivalSourceStateHash']).not.toBe(first['survivalSourceStateHash']);
  });

  it('cannot be spoofed by moving content across the separator', async () => {
    // Every component is hashed to fixed-length hex before being joined, so no
    // payload can contain the delimiter and shift the framing — two different
    // input sets cannot collide by rearranging where one value ends.
    const a = survivalSourceStateHash({
      beforeTextHash: 'aa',
      afterTextHash: 'bb',
      rawDeletedText: 'x|y',
      rawAddedText: 'z',
    });
    const b = survivalSourceStateHash({
      beforeTextHash: 'aa',
      afterTextHash: 'bb',
      rawDeletedText: 'x',
      rawAddedText: 'y|z',
    });
    expect(a).not.toBe(b);
  });

  it('computes against STORED text, not text handed in by the caller', async () => {
    // The verdict must be re-derivable from stored state, so it has to be
    // computed against stored state. A verdict computed from in-memory text would
    // carry a hash nothing could reproduce.
    findSnapshot.mockResolvedValue(snapshot('stored'));
    await recordDiff(diffWrite());
    expect(findSnapshot).toHaveBeenCalledTimes(2);
    expect(findSnapshot.mock.calls[0][0].where).toEqual({ id: 'snap-before' });
    expect(findSnapshot.mock.calls[1][0].where).toEqual({ id: 'snap-after' });
  });
});
