// ---------------------------------------------------------------------------
// get_diff_input — the classifier's INPUT, and which rule produced it.
//
// The tool exists because rawDeletedText/rawAddedText were reachable over REST
// and through no MCP tool, so the truncation defect could not be investigated
// from the research interface at all. Its most important field is not the text —
// it is rawChunksMayBeTruncated, which tells a researcher that the row they are
// reading is UNDERSTATED and cannot be corrected by reclassification.
// ---------------------------------------------------------------------------

const db = {
  unique: null as Record<string, unknown> | null,
  many: [] as Record<string, unknown>[],
};

const writeSpies = {
  update: jest.fn(),
  create: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: {
      findUnique: jest.fn(async () => db.unique),
      findMany: jest.fn(async () => db.many),
      ...writeSpies,
    },
  },
}));

import { getDiffInput } from '../src/services/diffInput';
import { DIFF_INPUT_VERSION } from '../src/lib/diffChunking';

const LINK = 'לדיווח על תופעות לוואי >';

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'diff-1',
    trackedUrlId: 't-1',
    trackedUrl: { id: 't-1', url: 'https://corona.health.gov.il/vaccine-for-covid/' },
    beforeDate: '2025-04-25',
    afterDate: '2025-06-01',
    rawDeletedText: JSON.stringify(['a long deleted sentence about vaccination policy', LINK]),
    rawAddedText: JSON.stringify(['a long added sentence about vaccination policy']),
    deletedText: JSON.stringify([
      { summary: 's', exactQuote: 'a long deleted sentence about vaccination policy' },
    ]),
    addedText: JSON.stringify([
      { summary: 's', exactQuote: 'a long added sentence about vaccination policy' },
    ]),
    isLegallySignificant: false,
    investigativeCategories: [],
    aiSignificance: 'עדכון תחבירי',
    classifierVersion: 'v3-self-contained-summary',
    classifierPromptHash: 'hash',
    summaryVersion: null,
    diffInputVersion: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.unique = null;
  db.many = [];
});

describe('getDiffInput', () => {
  it('returns the raw chunks verbatim, including short ones', async () => {
    db.unique = row();

    const result = await getDiffInput({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    // The 24-character link is the whole point: it is in the record, and was
    // never shown to a classifier under the old rule.
    expect(result.raw.deletedChunks).toContain(LINK);
    expect(result.counts.rawChunkCount).toBe(3);
    expect(result.counts.itemCount).toBe(2);
  });

  it('flags a row written under the truncating rule as understated', async () => {
    db.unique = row({ diffInputVersion: null });

    const result = await getDiffInput({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    // null is not "unknown" — it is "computed under the cap".
    expect(result.provenance.diffInputVersion).toBeNull();
    expect(result.provenance.rawChunksMayBeTruncated).toBe(true);
    expect(result.provenance.currentDiffInputVersion).toBe(DIFF_INPUT_VERSION);
  });

  it('does not flag a row written under the current rule', async () => {
    db.unique = row({ diffInputVersion: DIFF_INPUT_VERSION });

    const result = await getDiffInput({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.provenance.rawChunksMayBeTruncated).toBe(false);
  });

  it('flags an unrecognised future version rather than assuming it is fine', async () => {
    db.unique = row({ diffInputVersion: 'v9-something-else' });

    const result = await getDiffInput({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.provenance.rawChunksMayBeTruncated).toBe(true);
  });

  it('writes nothing', async () => {
    db.unique = row();

    await getDiffInput({ diffId: 'diff-1' });

    for (const [name, spy] of Object.entries(writeSpies)) {
      expect([name, spy.mock.calls.length]).toEqual([name, 0]);
    }
  });

  it('resolves by url + afterDate so one prompt works in every environment', async () => {
    db.many = [row({ id: 'env-local-uuid' })];

    const result = await getDiffInput({
      url: 'https://corona.health.gov.il/vaccine-for-covid/',
      afterDate: '2025-06-01',
    });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.diff.diffId).toBe('env-local-uuid');
  });

  it('reports ambiguity instead of picking whichever row sorted first', async () => {
    db.many = [row({ id: 'a' }), row({ id: 'b', beforeDate: '2025-05-10' })];

    const result = await getDiffInput({
      url: 'https://corona.health.gov.il/vaccine-for-covid/',
      afterDate: '2025-06-01',
    });

    expect(result.status).toBe('AMBIGUOUS');
    if (result.status !== 'AMBIGUOUS') throw new Error('expected AMBIGUOUS');
    expect(result.candidates.map((c) => c.diffId)).toEqual(['a', 'b']);
  });

  it('explains that ids are per-environment when a diffId does not resolve', async () => {
    db.unique = null;

    const result = await getDiffInput({ diffId: 'from-another-env' });

    expect(result.status).toBe('NOT_FOUND');
    expect(result.explanation).toContain('per-environment');
  });

  it('refuses url without afterDate rather than guessing a diff', async () => {
    const result = await getDiffInput({ url: 'https://corona.health.gov.il/vaccine-for-covid/' });

    expect(result.status).toBe('NOT_FOUND');
    expect(result.explanation).toContain('url alone is not');
  });

  it('tolerates unparseable stored columns', async () => {
    db.unique = row({ rawDeletedText: 'not json', deletedText: '[]', addedText: '[]' });

    const result = await getDiffInput({ diffId: 'diff-1' });
    if (result.status !== 'OK') throw new Error('expected OK');

    expect(result.raw.deletedChunks).toEqual([]);
  });
});
