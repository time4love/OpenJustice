import { createHash } from 'crypto';

jest.mock('../src/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    urlSnapshot: { findMany: jest.fn() },
    urlVersionDiff: { upsert: jest.fn() },
    diffContentVersion: { createMany: jest.fn() },
  };
  prisma['$transaction'] = jest.fn(async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[]),
  );
  return { prisma };
});

import { prisma } from '../src/lib/prisma';
import { diffChunkPair } from '../src/lib/diffChunking';
import { SURVIVAL_CHECK_VERSION } from '../src/lib/diffSurvival';
import { DIFF_VERSION } from '../src/lib/diffVersion';
import { WRITE_TRANSACTION } from '../src/walk/pageLog';
import { contentVersionHash, recordDiff, type DiffWrite } from '../src/services/recordDiff';

// ---------------------------------------------------------------------------
// THE DIFF IN ITS TARGET SHAPE — docs/gf-evidence-flows.md §3, A1, A2. The pair
// is created once and reused; the content is a version named by its chunks;
// the opinion is stored whole and is never in the name; survival is judged per
// chunk against the texts the corpus HOLDS.
// ---------------------------------------------------------------------------

type Mock = jest.Mock;
const db = prisma as unknown as Record<string, Record<string, Mock>>;
const snapshotsFind = db['urlSnapshot']?.['findMany'] as Mock;
const pairUpsert = db['urlVersionDiff']?.['upsert'] as Mock;
const versionCreate = db['diffContentVersion']?.['createMany'] as Mock;
const transaction = (prisma as unknown as { $transaction: Mock }).$transaction;

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

/** Long enough for the presence check to judge it, so survival is a verdict rather than a floor. */
const KEPT = 'The ministry advises that adverse events are to be reported through the dedicated channel.';
const REMOVED = 'A link to the adverse-event reporting form was available on this page for every reader.';
const ADDED = 'The campaign for the fourth dose opens next week for everyone over sixty in every district.';

const BEFORE_TEXT = `${KEPT}\n${REMOVED}`;
const AFTER_TEXT = `${KEPT}\n${ADDED}`;

const stored = (id: string, text: string, version = 'v2-fixture-extractor') => ({
  id,
  text,
  textHash: sha256(text),
  textExtractionVersion: version,
  snapshotDate: id === 'snap-before' ? '2022-05-03' : '2022-05-25',
  snapshotUrl: `https://web.archive.org/web/2022/${id}`,
});

function write(overrides: Partial<DiffWrite> = {}): DiffWrite {
  return {
    trackedUrlId: 'page-1',
    beforeSnapshotId: 'snap-before',
    afterSnapshotId: 'snap-after',
    before: { waybackTimestamp: '20220503051621', text: BEFORE_TEXT, textHash: sha256(BEFORE_TEXT) },
    after: { waybackTimestamp: '20220525102648', text: AFTER_TEXT, textHash: sha256(AFTER_TEXT) },
    deletedItems: [],
    addedItems: [],
    legalSignificance: 'הוסר הקישור לדיווח על תופעות לוואי.',
    investigativeCategories: [],
    isLegallySignificant: false,
    editorial: true,
    editorialReason: 'The reporting link paragraph was removed and a campaign paragraph added.',
    coverage: { chunkCount: 2, coveredChunks: 2, uncoveredChunks: [], charCount: 10, coveredChars: 10, chunkRatio: 1, charRatio: 1, complete: true },
    draws: 1,
    classifierVersion: 'v5-editorial-verdict',
    classifiedInputVersion: 'v3-sentence-claims',
    classifierModel: 'test:model',
    classifierPromptHash: 'prompt-hash',
    summaryVersion: 'v3-self-contained-summary',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  snapshotsFind.mockResolvedValue([stored('snap-before', BEFORE_TEXT), stored('snap-after', AFTER_TEXT)]);
  pairUpsert.mockResolvedValue({ id: 'diff-1' });
  versionCreate.mockResolvedValue({ count: 1 });
});

describe('recordDiff — the pair', () => {
  it('creates the pair once, keyed on the two captures, with its legacy NOT NULL columns filled from them and nothing else', async () => {
    const result = await recordDiff(write());

    expect(pairUpsert).toHaveBeenCalledTimes(1);
    expect(pairUpsert.mock.calls[0]?.[0]).toEqual({
      where: { beforeSnapshotId_afterSnapshotId: { beforeSnapshotId: 'snap-before', afterSnapshotId: 'snap-after' } },
      create: {
        trackedUrlId: 'page-1',
        beforeSnapshotId: 'snap-before',
        afterSnapshotId: 'snap-after',
        beforeDate: '2022-05-03',
        afterDate: '2022-05-25',
        snapshotUrl: 'https://web.archive.org/web/2022/snap-after',
      },
      // Reused, never rewritten: an existing pair is left exactly as it is.
      update: {},
      select: { id: true },
    });
    expect(result.id).toBe('diff-1');
  });

  it('writes the pair and the version in ONE transaction, under the shared window', async () => {
    await recordDiff(write());
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[1]).toBe(WRITE_TRANSACTION);
  });

  // STEP 7 (refactor plan §3): a supersession re-derives every diff spanning
  // the superseded text as a new content version IN THE SAME TRANSACTION as
  // the text version and the snapshot's new text (evidence flows §3). The
  // walk hands its transaction in; the writer opens none of its own.
  it('writes through the caller’s transaction when given one, opening none of its own', async () => {
    await recordDiff(write(), prisma as unknown as Parameters<typeof recordDiff>[1]);
    expect(transaction).not.toHaveBeenCalled();
    expect(pairUpsert).toHaveBeenCalledTimes(1);
    expect(versionCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses a pair whose two sides are the same capture, reading and writing nothing', async () => {
    await expect(recordDiff(write({ afterSnapshotId: 'snap-before' }))).rejects.toThrow(/same capture/);
    expect(snapshotsFind).not.toHaveBeenCalled();
    expect(pairUpsert).not.toHaveBeenCalled();
  });
});

describe('recordDiff — the content version', () => {
  it('writes one version: the chunks in the differ’s order with a survival each, the provenance, and the opinion whole', async () => {
    const result = await recordDiff(write());

    expect(versionCreate).toHaveBeenCalledTimes(1);
    const call = versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[]; skipDuplicates: boolean };
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toHaveLength(1);
    const version = call.data[0] ?? {};
    expect(version).toEqual(
      expect.objectContaining({
        diffId: 'diff-1',
        beforeTextHash: sha256(BEFORE_TEXT),
        afterTextHash: sha256(AFTER_TEXT),
        diffVersion: DIFF_VERSION,
        survivalVersion: SURVIVAL_CHECK_VERSION,
        contentVersionHash: result.contentVersionHash,
      }),
    );
    // The chunks are the reused differ's, removed then added, and each survives
    // the documents: the removed paragraph is absent from the after text and
    // the added one from the before text.
    expect(version['chunks']).toEqual([
      { side: 'REMOVED', text: REMOVED, survival: 'SURVIVES' },
      { side: 'ADDED', text: ADDED, survival: 'SURVIVES' },
    ]);
    // The OPINION register: the classifier's whole output with its provenance,
    // and nothing of the pair in it.
    expect(version['classification']).toEqual(
      expect.objectContaining({
        editorial: true,
        editorialReason: 'The reporting link paragraph was removed and a campaign paragraph added.',
        legalSignificance: 'הוסר הקישור לדיווח על תופעות לוואי.',
        classifierVersion: 'v5-editorial-verdict',
        classifierModel: 'test:model',
        classifierPromptHash: 'prompt-hash',
        summaryVersion: 'v3-self-contained-summary',
        draws: 1,
      }),
    );
    expect(version['classification']).not.toHaveProperty('beforeSnapshotId');
    expect(version['classification']).not.toHaveProperty('before');
    expect(result.created).toBe(true);
  });

  it('the same content twice writes one version: the second call reports created false and the index decides', async () => {
    await recordDiff(write());
    versionCreate.mockResolvedValueOnce({ count: 0 });
    const again = await recordDiff(write());
    expect(again.created).toBe(false);
    expect(again.contentVersionHash).toBe((await recordDiff(write())).contentVersionHash);
  });

  it('a chunk the documents contradict is marked CONTRADICTED on its own, the others SURVIVES', async () => {
    // The corpus holds an after text that STILL CONTAINS the paragraph the diff
    // claims removed (the fixture keeps the stored hash equal to the compared
    // one, so the guard passes and only the checker speaks): that chunk's
    // removal does not survive the document, and only that chunk says so.
    snapshotsFind.mockResolvedValue([
      stored('snap-before', BEFORE_TEXT),
      { ...stored('snap-after', `${AFTER_TEXT}\n${REMOVED}`), textHash: sha256(AFTER_TEXT) },
    ]);
    await recordDiff(write());
    const version = (versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }).data[0] ?? {};
    expect(version['chunks']).toEqual([
      { side: 'REMOVED', text: REMOVED, survival: 'CONTRADICTED' },
      { side: 'ADDED', text: ADDED, survival: 'SURVIVES' },
    ]);
  });

  it('two captures extracted under different rules make every chunk UNCHECKABLE — the checker’s rule, unchanged', async () => {
    snapshotsFind.mockResolvedValue([stored('snap-before', BEFORE_TEXT, 'v1'), stored('snap-after', AFTER_TEXT, 'v2')]);
    await recordDiff(write());
    const chunks = (versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }).data[0]?.['chunks'] as ContentChunk[];
    expect(chunks.map((c) => c.survival)).toEqual(['UNCHECKABLE', 'UNCHECKABLE']);
  });

  it('is cut from the texts the corpus HOLDS: a side compared under a text the snapshot does not hold is a walk defect', async () => {
    snapshotsFind.mockResolvedValue([stored('snap-before', BEFORE_TEXT), { ...stored('snap-after', AFTER_TEXT), textHash: 'moved-under-the-walk' }]);
    const attempt = recordDiff(write());
    await expect(attempt).rejects.toThrow('moved-under-the-walk');
    await expect(attempt).rejects.toThrow('20220525102648');
    expect(pairUpsert).not.toHaveBeenCalled();
  });

  it('a side the corpus does not hold is a walk defect too', async () => {
    snapshotsFind.mockResolvedValue([stored('snap-before', BEFORE_TEXT)]);
    await expect(recordDiff(write())).rejects.toThrow('snap-after');
    expect(pairUpsert).not.toHaveBeenCalled();
  });
});

interface ContentChunk {
  side: 'REMOVED' | 'ADDED';
  text: string;
  survival: string;
}

/** The differ's chunks, named by side, in the differ's order — removed then added. */
function namedChunks(before: string, after: string): { side: 'REMOVED' | 'ADDED'; text: string }[] {
  const chunks = diffChunkPair(before, after);
  return [
    ...chunks.removed.map((text): { side: 'REMOVED' | 'ADDED'; text: string } => ({ side: 'REMOVED', text })),
    ...chunks.added.map((text): { side: 'REMOVED' | 'ADDED'; text: string } => ({ side: 'ADDED', text })),
  ];
}

describe('contentVersionHash — A1, the byte layout stated once', () => {
  it('is sha256 over the UTF-8 JSON of [{ side, text } …] in the differ’s order, bare lowercase hex', () => {
    const named = namedChunks(BEFORE_TEXT, AFTER_TEXT);
    expect(named.map((c) => c.side)).toEqual(['REMOVED', 'ADDED']);
    const byHand = createHash('sha256').update(JSON.stringify(named), 'utf8').digest('hex');

    expect(contentVersionHash(named)).toBe(byHand);
    expect(byHand).toMatch(/^[0-9a-f]{64}$/);
  });

  it('covers the chunks ONLY: survival and the opinion are not in the name', async () => {
    const byHand = contentVersionHash(namedChunks(BEFORE_TEXT, AFTER_TEXT));
    const editorial = await recordDiff(write({ editorial: true }));
    const notEditorial = await recordDiff(write({ editorial: false, legalSignificance: 'אחר לגמרי', draws: 3 }));
    expect(editorial.contentVersionHash).toBe(byHand);
    expect(notEditorial.contentVersionHash).toBe(byHand);

    // Survival is not in it either: the same chunks under different extractor
    // versions are UNCHECKABLE rather than SURVIVES, and the name does not move.
    snapshotsFind.mockResolvedValue([stored('snap-before', BEFORE_TEXT, 'v1'), stored('snap-after', AFTER_TEXT, 'v2')]);
    expect((await recordDiff(write())).contentVersionHash).toBe(byHand);
  });

  it('the hash reads survival off nothing — a chunk carrying a survival field hashes as its side and text alone', () => {
    const plain = contentVersionHash([{ side: 'REMOVED', text: REMOVED }]);
    const judged: ContentChunk = { side: 'REMOVED', text: REMOVED, survival: 'CONTRADICTED' };
    expect(contentVersionHash([judged])).toBe(plain);
  });
});
