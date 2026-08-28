// ---------------------------------------------------------------------------
// planRediff — what recomputing a diff from its snapshots would recover.
//
// The plan is the artifact a researcher approves, so the properties that matter
// are: it writes nothing, it refuses any pair whose text no longer hashes to the
// value that was anchored, and it does not inflate the repair by counting a
// chunk as recovered when a whitespace-different copy is already stored.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';

const db = {
  diffs: [] as Record<string, unknown>[],
  captures: {} as Record<string, Record<string, unknown>>,
};

const writeSpies = {
  update: jest.fn(),
  updateMany: jest.fn(),
  create: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: {
      findMany: jest.fn(async (a: { where?: { id?: string } }) =>
        a.where?.id === undefined ? db.diffs : db.diffs.filter((d) => d['id'] === a.where?.id),
      ),
      findUniqueOrThrow: jest.fn(async (a: { where: { id: string } }) => {
        const row = db.diffs.find((d) => d['id'] === a.where.id);
        if (row === undefined) throw new Error(`no diff ${a.where.id}`);
        return row;
      }),
      ...writeSpies,
    },
    // The rediff recomputes the Level 5 verdict against STORED capture text, so
    // the captures have to exist as rows and not only as relations on the diff.
    urlSnapshot: {
      findUniqueOrThrow: jest.fn(async (a: { where: { id: string } }) => {
        const stored = db.captures[a.where.id];
        if (stored === undefined) throw new Error(`no capture ${a.where.id}`);
        return stored;
      }),
    },
  },
}));

import { planRediff, applyRediff, REDIFF_TARGET_VERSION } from '../src/services/rediffFromSnapshots';
import { DIFF_INPUT_VERSION } from '../src/lib/diffChunking';
import { survivalSourceStateHash } from '../src/lib/diffSurvival';

function snap(text: string, corruptHash = false): Record<string, unknown> {
  return {
    fullText: text,
    contentHash: corruptHash
      ? 'deadbeef'
      : createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}

// The two deletions are separated by an unchanged line on purpose: groupDiffChunks
// merges CONSECUTIVE changed lines into one chunk, so adjacent removals would be a
// single chunk and the test would not exercise a partially-stored record.
const BEFORE =
  ['alpha line one', 'beta line two', 'keep this line', 'short', 'tail line'].join('\n') + '\n';
const AFTER =
  ['alpha line one', 'delta replaced', 'keep this line', 'tail line'].join('\n') + '\n';

function diffRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'diff-1',
    beforeDate: '2022-09-05',
    afterDate: '2022-09-06',
    beforeSnapshotId: 'cap-before',
    afterSnapshotId: 'cap-after',
    isLegallySignificant: true,
    diffInputVersion: null,
    // Truncated record: only ONE of the two real deletions was stored.
    rawDeletedText: JSON.stringify(['beta line two']),
    rawAddedText: JSON.stringify(['delta replaced']),
    beforeSnapshot: snap(BEFORE),
    afterSnapshot: snap(AFTER),
    evidence: [],
    ...over,
  };
}

const TEXT_VERSION = 'v2-inflate-decode-htmltotext-normalised';

/** A stored capture as `computeDiffSurvival` reads it, not as the diff embeds it. */
function capture(text: string): Record<string, unknown> {
  return {
    text,
    textHash: createHash('sha256').update(text, 'utf8').digest('hex'),
    textExtractionVersion: TEXT_VERSION,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.diffs = [];
  db.captures = { 'cap-before': capture(BEFORE), 'cap-after': capture(AFTER) };
});

describe('planRediff', () => {
  it('reports chunks the stored record is missing', async () => {
    db.diffs = [diffRow()];

    const plan = await planRediff();

    expect(plan.diffsNeedingRediff).toBe(1);
    expect(plan.chunksRecovered).toBeGreaterThan(0);
    const entry = plan.entries[0];
    expect(entry?.recoveredText.map((r) => r.text)).toContain('short');
    expect(entry?.recoveredText.every((r) => r.side === 'deleted' || r.side === 'added')).toBe(true);
  });

  it('writes nothing', async () => {
    db.diffs = [diffRow()];

    await planRediff();

    for (const [name, spy] of Object.entries(writeSpies)) {
      expect([name, spy.mock.calls.length]).toEqual([name, 0]);
    }
  });

  it('REFUSES a pair whose snapshot text no longer hashes to its contentHash', async () => {
    db.diffs = [diffRow({ beforeSnapshot: snap(BEFORE, true) })];

    const plan = await planRediff();

    // A recomputation over drifted text would silently attribute the drift to the
    // cap. Chain of custody is a different question and must not be folded in.
    expect(plan.snapshotHashFailures).toBe(1);
    expect(plan.diffsNeedingRediff).toBe(0);
    expect(plan.entries).toHaveLength(0);
  });

  it('skips a diff not linked to both snapshots rather than guessing', async () => {
    db.diffs = [diffRow({ afterSnapshot: null })];

    const plan = await planRediff();

    expect(plan.unlinkedDiffs).toBe(1);
    expect(plan.entries).toHaveLength(0);
  });

  it('reports nothing for a diff whose stored chunks are already complete', async () => {
    const raw = { rawDeletedText: JSON.stringify(['beta line two', 'short']) };
    db.diffs = [diffRow(raw)];

    const plan = await planRediff();

    expect(plan.diffsNeedingRediff).toBe(0);
    expect(plan.chunksRecovered).toBe(0);
  });

  it('does not count a whitespace-different copy as recovered', async () => {
    // The stored chunk survived a JSON round-trip; treating a spacing difference
    // as a new chunk would inflate the repair and overstate the damage.
    db.diffs = [
      diffRow({ rawDeletedText: JSON.stringify(['beta   line  two', '  short  ']) }),
    ];

    const plan = await planRediff();

    expect(plan.chunksRecovered).toBe(0);
  });

  it('flags entries whose diff already produced evidence', async () => {
    db.diffs = [
      diffRow({ evidence: [{ id: 'e1', status: 'CONFIRMED', fileHash: '0xabc123def456' }] }),
    ];

    const plan = await planRediff();

    // These are the ones a human has to look at: a promoted record whose source
    // diff is about to describe more of the page than it did when promoted.
    expect(plan.diffsWithEvidenceAffected).toBe(1);
    expect(plan.entries[0]?.evidence[0]?.status).toBe('CONFIRMED');
  });

  it('reports the version repaired rows would carry', () => {
    expect(REDIFF_TARGET_VERSION).toBe(DIFF_INPUT_VERSION);
  });
});

describe('applyRediff', () => {
  it('rewrites the raw chunks and stamps the input version', async () => {
    db.diffs = [diffRow()];

    const result = await applyRediff();

    expect(result.applied).toBe(1);
    expect(result.refused).toBe(0);
    const call = writeSpies.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { rawDeletedText: string; rawAddedText: string; diffInputVersion: string };
    };
    expect(call.where.id).toBe('diff-1');
    expect(call.data.diffInputVersion).toBe(REDIFF_TARGET_VERSION);
    const written = JSON.parse(call.data.rawDeletedText) as string[];
    expect(written).toContain('beta line two');
    expect(written).toContain('short');
  });

  it('never touches the classifier output', async () => {
    db.diffs = [diffRow()];

    await applyRediff();

    const data = (writeSpies.update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    // The chunks become current while the classification does not, and the two
    // provenance fields say so. Reclassification is a separate decision.
    //
    // WHAT THIS ASSERTION USED TO SAY. It required the write to consist of
    // EXACTLY these three keys, under the title "never touches the classifier
    // output or the verdict" — which made the defect below a requirement, and
    // would have failed the moment anyone fixed it. A test can encode a defect
    // more durably than a comment can, because it fails loudly when corrected.
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining(['diffInputVersion', 'rawAddedText', 'rawDeletedText']),
    );
    for (const classifierColumn of [
      'deletedText',
      'addedText',
      'aiSignificance',
      'investigativeCategories',
      'isLegallySignificant',
      'classifierVersion',
    ]) {
      expect(data).not.toHaveProperty(classifierColumn);
    }
  });

  it('RECOMPUTES the Level 5 verdict, because rewriting the chunks invalidates it', async () => {
    // ASSERTING THE CALLER. `checkDiffSurvival` was covered in isolation while
    // nothing asserted that the tool which rewrites its inputs reaches it — the
    // shape three surviving mutations shared in an earlier session. This is the
    // caller assertion.
    //
    // `rawDeletedText` / `rawAddedText` are two of the checker's four inputs. A
    // rediff that rewrote them and left the old verdict in place would leave a
    // row whose verdict is about chunks it no longer holds.
    db.diffs = [diffRow()];

    await applyRediff();

    const data = (writeSpies.update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining([
        'survivalVerdict',
        'survivalCheckedAt',
        'survivalSourceStateHash',
        'survivalTextVersion',
        'survivalContradicted',
        'survivalChunksChecked',
      ]),
    );
    expect(data['survivalVerdict']).toBe('SURVIVES');
    expect(data['survivalTextVersion']).toBe(TEXT_VERSION);
  });

  it('commits the verdict to the chunks it just wrote, not the ones it replaced', async () => {
    // The source-state hash has to cover the NEW payloads. If it committed only
    // to the captures — which this tool does not move — the stored verdict would
    // certify itself as current over chunks that had been replaced underneath it.
    db.diffs = [diffRow()];

    await applyRediff();

    const data = (writeSpies.update.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    expect(data['survivalSourceStateHash']).toBe(
      survivalSourceStateHash({
        beforeTextHash: createHash('sha256').update(BEFORE, 'utf8').digest('hex'),
        afterTextHash: createHash('sha256').update(AFTER, 'utf8').digest('hex'),
        rawDeletedText: data['rawDeletedText'] as string,
        rawAddedText: data['rawAddedText'] as string,
      }),
    );
    // Vacuity guard: this would pass trivially if the rediff had written the
    // chunks it read instead of the ones it recomputed.
    expect(data['rawDeletedText']).not.toBe(diffRow()['rawDeletedText']);
  });

  it('REFUSES an entry where applying would destroy stored text', async () => {
    // A stored chunk with no counterpart in the recomputation: rewriting would
    // lose it, turning a repair into a partial deletion.
    db.diffs = [diffRow({ rawDeletedText: JSON.stringify(['beta line two', 'text that no longer exists anywhere']) })];

    const result = await applyRediff();

    expect(result.applied).toBe(0);
    expect(result.refused).toBe(1);
    expect(writeSpies.update).not.toHaveBeenCalled();
  });

  it('refuses a pair whose snapshot hash no longer verifies', async () => {
    db.diffs = [diffRow({ afterSnapshot: snap(AFTER, true) })];

    const result = await applyRediff();

    expect(result.applied).toBe(0);
    expect(writeSpies.update).not.toHaveBeenCalled();
  });

  it('writes nothing when there is nothing to recover', async () => {
    db.diffs = [diffRow({ rawDeletedText: JSON.stringify(['beta line two', 'short']) })];

    const result = await applyRediff();

    expect(result.applied).toBe(0);
    expect(writeSpies.update).not.toHaveBeenCalled();
  });
});
