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

import { Prisma } from '@prisma/client';
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

/**
 * A stored capture as the writer reads it: its derived text, and the DOCUMENT
 * the text was cut from — survival is checked against the document (F2,
 * 2026-09-07; evidence flows §3 "against the raw documents"). By default the
 * document shows exactly the text; a case that wants the page to have said
 * more than the rules kept passes `pageText`.
 */
const stored = (id: string, text: string, version = 'v2-fixture-extractor', pageText = text) => ({
  id,
  text,
  textHash: sha256(text),
  textExtractionVersion: version,
  snapshotDate: id === 'snap-before' ? '2022-05-03' : '2022-05-25',
  snapshotUrl: `https://web.archive.org/web/2022/${id}`,
  document: Buffer.from(`<html><head><title>t</title></head><body>${pageText.split('\n').map((l) => `<p>${l}</p>`).join('')}</body></html>`, 'utf8'),
  documentContentType: 'text/html; charset=utf-8',
  documentContentEncoding: null,
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
  // AMENDED 2026-09-12. This asserted that the create payload carried
  // `beforeDate`, `afterDate` and `snapshotUrl` — "its legacy NOT NULL columns
  // filled from them". Evidence step 11b DROPPED those columns on 2026-09-08 and
  // this test went on requiring them, green, because it asserts against a MOCKED
  // Prisma client: a mock validates a payload against nothing. It was therefore
  // pinning the defect in place, and `recordDiff` threw `Unknown argument
  // 'beforeDate'` the first time a walk wrote a diff against the real database
  // (corona 20220105113501, staging). A test that asserts the shape of a write
  // to a mock is a test about this file, never about the schema —
  // test/prismaPayloadFields.test.ts is what holds it to the schema now.
  it('creates the pair once, keyed on the two captures, and carries THE PAIR AND NOTHING ELSE', async () => {
    const result = await recordDiff(write());

    expect(pairUpsert).toHaveBeenCalledTimes(1);
    expect(pairUpsert.mock.calls[0]?.[0]).toEqual({
      where: { beforeSnapshotId_afterSnapshotId: { beforeSnapshotId: 'snap-before', afterSnapshotId: 'snap-after' } },
      create: {
        trackedUrlId: 'page-1',
        beforeSnapshotId: 'snap-before',
        afterSnapshotId: 'snap-after',
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

  // F2 (2026-09-07): SURVIVAL IS CHECKED AGAINST THE DOCUMENTS, not against the
  // other side's extracted text. The exercise's corpus held a sentence "removed"
  // in 2021 that the 2021 page still showed — a positional rule had cut an inline
  // link out of it — and the text-based check called that SURVIVES. Against the
  // document it is CONTRADICTED: the page never lost it. And the "added" half
  // of the same artefact never appeared on the after page either.
  it('a removal the after DOCUMENT still shows — a rule cut it, not the page — is CONTRADICTED', async () => {
    snapshotsFind.mockResolvedValue([
      stored('snap-before', BEFORE_TEXT),
      // The rules kept AFTER_TEXT; the page itself still says REMOVED.
      stored('snap-after', AFTER_TEXT, 'v2-fixture-extractor', `${AFTER_TEXT}\n${REMOVED}`),
    ]);
    await recordDiff(write());
    const chunks = (versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }).data[0]?.['chunks'] as ContentChunk[];
    expect(chunks).toEqual([
      { side: 'REMOVED', text: REMOVED, survival: 'CONTRADICTED' },
      { side: 'ADDED', text: ADDED, survival: 'SURVIVES' },
    ]);
  });

  it('an addition the after document never showed — a rule-manufactured sentence — is CONTRADICTED', async () => {
    const manufactured = 'The campaign opens next week for everyone over sixty in every district.';
    snapshotsFind.mockResolvedValue([
      stored('snap-before', BEFORE_TEXT),
      // The derived text carries a sentence the page never displayed in that form.
      { ...stored('snap-after', `${KEPT}\n${manufactured}`, 'v2-fixture-extractor', AFTER_TEXT) },
    ]);
    await recordDiff(write({ after: { waybackTimestamp: '20220525102648', text: `${KEPT}\n${manufactured}`, textHash: sha256(`${KEPT}\n${manufactured}`) } }));
    const chunks = (versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }).data[0]?.['chunks'] as ContentChunk[];
    expect(chunks.find((c) => c.side === 'ADDED')).toEqual({ side: 'ADDED', text: manufactured, survival: 'CONTRADICTED' });
  });

  // RULED 2026-09-07: survival compares the extractor alone — a rule change
  // (the `+chrome-<id>` suffix) leaves every chunk checkable.
  it('two captures under different RULES by one extractor are checked chunk by chunk', async () => {
    snapshotsFind.mockResolvedValue([
      stored('snap-before', BEFORE_TEXT, 'v2-fixture-extractor+chrome-58404310'),
      stored('snap-after', AFTER_TEXT, 'v2-fixture-extractor+chrome-567ddbb3'),
    ]);
    await recordDiff(write());
    const chunks = (versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[] }).data[0]?.['chunks'] as ContentChunk[];
    expect(chunks.map((c) => c.survival)).toEqual(['SURVIVES', 'SURVIVES']);
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

// THE CLASSIFICATION IS WHOLE OR ABSENT — 2026-09-08, with the empty-diff guard.
// Making it `Partial` so an unclassified diff can be written also made a HALF
// classification expressible, and a half one is the worst of the three: the
// version would carry `editorial` with no `classifierVersion` beside it, so a
// verdict would be stored with no way to say which model under which prompt
// gave it — the provenance A2 exists to keep. Absent is a fact (nothing
// classified this derivation); whole is a judgement with its provenance; the
// state between is a walk defect and THROWS, naming what is missing, as every
// other defect in this layer does.
describe('recordDiff — the classification is whole or absent (2026-09-08)', () => {
  /** Every key of DiffClassification, from the fixture that carries them all. */
  const classificationKeys = (): string[] => {
    const { trackedUrlId, beforeSnapshotId, afterSnapshotId, before, after, ...classification } = write();
    void trackedUrlId, beforeSnapshotId, afterSnapshotId, before, after;
    return Object.keys(classification);
  };

  it('absent: no classification key at all writes the version with classification NULL', async () => {
    const { deletedItems, addedItems, legalSignificance, investigativeCategories, isLegallySignificant, editorial, editorialReason, coverage, draws, classifierVersion, classifiedInputVersion, classifierModel, classifierPromptHash, summaryVersion, ...bare } = write();
    void deletedItems, addedItems, legalSignificance, investigativeCategories, isLegallySignificant, editorial, editorialReason, coverage, draws, classifierVersion, classifiedInputVersion, classifierModel, classifierPromptHash, summaryVersion;
    await recordDiff(bare);
    const call = versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[] };
    expect(call.data[0]?.['classification']).toBe(Prisma.DbNull);
  });

  it('half: a write carrying editorial alone THROWS naming the missing keys, and writes nothing', async () => {
    const { deletedItems, addedItems, legalSignificance, investigativeCategories, isLegallySignificant, editorialReason, coverage, draws, classifierVersion, classifiedInputVersion, classifierModel, classifierPromptHash, summaryVersion, ...half } = write();
    void deletedItems, addedItems, legalSignificance, investigativeCategories, isLegallySignificant, editorialReason, coverage, draws, classifierVersion, classifiedInputVersion, classifierModel, classifierPromptHash, summaryVersion;
    await expect(recordDiff(half)).rejects.toThrow(/classifierVersion/);
    await expect(recordDiff(half)).rejects.toThrow(/Walk defect/);
    expect(versionCreate).not.toHaveBeenCalled();
  });

  it('whole: every key present writes the opinion, as before', async () => {
    await recordDiff(write());
    const call = versionCreate.mock.calls[0]?.[0] as { data: Record<string, unknown>[] };
    expect(Object.keys(call.data[0]?.['classification'] as object).sort()).toEqual(classificationKeys().sort());
  });
});
