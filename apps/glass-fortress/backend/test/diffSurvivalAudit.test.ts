// ---------------------------------------------------------------------------
// A VERDICT CAN BE ABSENT, AND THAT MUST NOT LOOK LIKE A PASS.
//
// `survivalVerdict` is nullable because rows written before Level 5 exist. NULL
// MEANS NEVER CHECKED, WHICH IS NOT THE SAME AS PASSING — conflating the two is
// an unavailable check counting as a result, the failure §3 exists to prevent.
//
// These tests hold two things the corpus cannot demonstrate on its own:
//
//   1. an unchecked diff is DETECTABLE, not silently indistinguishable from a
//      passing one;
//   2. the backfill that acts on that detection REACHES THE CHECKER — the caller
//      assertion, the shape three surviving mutations shared in an earlier
//      session, where a collaborator was tested in isolation while nothing
//      asserted anyone reaches it.
// ---------------------------------------------------------------------------

const db = {
  diffs: [] as Record<string, unknown>[],
  captures: {} as Record<string, Record<string, unknown>>,
};
const update = jest.fn();

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    urlVersionDiff: {
      findMany: jest.fn(async () => db.diffs),
      findUniqueOrThrow: jest.fn(async (a: { where: { id: string } }) => {
        const row = db.diffs.find((d) => d['id'] === a.where.id);
        if (row === undefined) throw new Error(`no diff ${a.where.id}`);
        return row;
      }),
      update,
    },
    urlSnapshot: {
      findUniqueOrThrow: jest.fn(async (a: { where: { id: string } }) => {
        const cap = db.captures[a.where.id];
        if (cap === undefined) throw new Error(`no capture ${a.where.id}`);
        return cap;
      }),
    },
  },
}));

import { createHash } from 'crypto';
import { auditDiffSurvival, diffSurvivalView } from '../src/services/auditDiffSurvival';
import { backfillDiffSurvival } from '../src/services/backfillDiffSurvival';
import { SURVIVAL_CHECK_VERSION, survivalSourceStateHash } from '../src/lib/diffSurvival';

const V2 = 'v2-inflate-decode-htmltotext-normalised';

/** Long enough to clear the presence floor, so a match is a finding not a coincidence. */
const SENTENCE =
  'The Ministry stated that side effects are mild and temporary in all reported cases.';

const BEFORE = `intro\n${SENTENCE}\noutro`;
const AFTER_REMOVED = 'intro\noutro';
/** The after document still says it: the reported removal never happened. */
const AFTER_KEPT = `intro\n${SENTENCE}\noutro`;

function capture(text: string, version = V2): Record<string, unknown> {
  return {
    text,
    textHash: createHash('sha256').update(text, 'utf8').digest('hex'),
    textExtractionVersion: version,
  };
}

function hashOf(beforeText: string, afterText: string, deleted: string, added: string): string {
  return survivalSourceStateHash({
    beforeTextHash: createHash('sha256').update(beforeText, 'utf8').digest('hex'),
    afterTextHash: createHash('sha256').update(afterText, 'utf8').digest('hex'),
    rawDeletedText: deleted,
    rawAddedText: added,
  });
}

/**
 * A diff row as both the audit and the backfill read it.
 *
 * The embedded relations and the capture store must agree, because the audit
 * classifies from the relations while the backfill re-reads the captures — the
 * fixture would otherwise prove a consistency the code does not have.
 */
function diffRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  const afterText = (over['__afterText'] as string | undefined) ?? AFTER_REMOVED;
  delete over['__afterText'];
  const rawDeletedText = (over['rawDeletedText'] as string | undefined) ?? JSON.stringify([SENTENCE]);
  const rawAddedText = (over['rawAddedText'] as string | undefined) ?? '[]';
  return {
    id: 'diff-1',
    beforeDate: '2022-09-05',
    afterDate: '2022-09-06',
    beforeSnapshotId: 'cap-before',
    afterSnapshotId: 'cap-after',
    rawDeletedText,
    rawAddedText,
    survivalVerdict: null,
    survivalSourceStateHash: null,
    survivalTextVersion: null,
    survivalCheckVersion: null,
    beforeSnapshot: capture(BEFORE),
    afterSnapshot: capture(afterText),
    ...over,
  };
}

function loadCaptures(afterText = AFTER_REMOVED, beforeVersion = V2): void {
  db.captures = {
    'cap-before': capture(BEFORE, beforeVersion),
    'cap-after': capture(afterText),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.diffs = [];
  loadCaptures();
});

// ---------------------------------------------------------------------------
describe('an absent verdict is a state of its own', () => {
  it('reports a null verdict as UNCHECKED — never as a pass', async () => {
    db.diffs = [diffRow()];

    const report = await auditDiffSurvival();

    expect(report.summary.unchecked).toBe(1);
    expect(report.summary.current).toBe(0);
    // The distribution counts CURRENT verdicts only, so an unchecked diff cannot
    // be read out of the SURVIVES line by someone skimming the summary.
    expect(report.summary.survives).toBe(0);
    expect(report.diffs[0]?.state).toBe('UNCHECKED');
  });

  it('reports a verdict with no provenance as UNCHECKED, not CURRENT', async () => {
    // A verdict whose source state was never recorded cannot be checked for
    // staleness, so it is not a verdict that can be relied on.
    db.diffs = [diffRow({ survivalVerdict: 'SURVIVES', survivalSourceStateHash: null })];

    const report = await auditDiffSurvival();

    expect(report.summary.unchecked).toBe(1);
    expect(report.summary.survives).toBe(0);
  });

  it('reports a current verdict as CURRENT and counts it once', async () => {
    db.diffs = [
      diffRow({
        survivalVerdict: 'SURVIVES',
        survivalTextVersion: V2,
        survivalCheckVersion: SURVIVAL_CHECK_VERSION,
        survivalSourceStateHash: hashOf(BEFORE, AFTER_REMOVED, JSON.stringify([SENTENCE]), '[]'),
      }),
    ];

    const report = await auditDiffSurvival();

    expect(report.summary).toMatchObject({ unchecked: 0, stale: 0, current: 1, survives: 1 });
  });
});

// ---------------------------------------------------------------------------
describe('a verdict about inputs the row no longer holds is STALE', () => {
  it('detects chunks rewritten under an unchanged capture pair', async () => {
    // THE CASE THE CAPTURE-ONLY HASH COULD NOT SEE. `rediffFromSnapshots`
    // rewrites the chunks; the captures do not move. Hashing only the captures
    // would leave this row reporting itself as current.
    db.diffs = [
      diffRow({
        rawDeletedText: JSON.stringify(['a completely different chunk than was checked']),
        survivalVerdict: 'SURVIVES',
        survivalTextVersion: V2,
        survivalCheckVersion: SURVIVAL_CHECK_VERSION,
        survivalSourceStateHash: hashOf(BEFORE, AFTER_REMOVED, JSON.stringify([SENTENCE]), '[]'),
      }),
    ];

    const report = await auditDiffSurvival();

    expect(report.summary.stale).toBe(1);
    expect(report.summary.survives).toBe(0);
    expect(report.diffs[0]?.reason).toContain('different inputs');
  });

  it('detects a verdict decided under a superseded extraction rule', async () => {
    db.diffs = [
      diffRow({
        survivalVerdict: 'SURVIVES',
        survivalTextVersion: 'v1-htmltotext-normalised',
        survivalCheckVersion: SURVIVAL_CHECK_VERSION,
        survivalSourceStateHash: hashOf(BEFORE, AFTER_REMOVED, JSON.stringify([SENTENCE]), '[]'),
      }),
    ];

    const report = await auditDiffSurvival();

    expect(report.summary.stale).toBe(1);
    expect(report.diffs[0]?.reason).toContain('v1-htmltotext-normalised');
  });
});

// ---------------------------------------------------------------------------
describe('the backfill reaches the checker — asserting the CALLER', () => {
  it('computes and stores a real verdict for an unchecked diff', async () => {
    db.diffs = [diffRow({ __afterText: AFTER_KEPT })];
    loadCaptures(AFTER_KEPT);

    const report = await backfillDiffSurvival();

    expect(report.eligible).toBe(1);
    expect(report.written).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };
    // Not merely "a verdict was written" — the CORRECT one. The after document
    // still contains the sentence the diff says was removed.
    expect(data['survivalVerdict']).toBe('CONTRADICTED');
    expect(data['survivalChunksChecked']).toBe(1);
    expect(data['survivalContradicted']).toEqual([expect.objectContaining({ side: 'REMOVED' })]);
  });

  it('writes the survival columns and NOTHING else — a backfill is not a repair', async () => {
    db.diffs = [diffRow()];

    await backfillDiffSurvival();

    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(data).sort()).toEqual(
      [
        'survivalCheckedAt',
        'survivalCheckVersion',
        'survivalChunksChecked',
        'survivalContradicted',
        'survivalSourceStateHash',
        'survivalTextVersion',
        'survivalVerdict',
      ].sort(),
    );
  });

  it('leaves a CONTRADICTED diff’s content untouched — the contradiction is the finding', async () => {
    // The seven contradicted diffs in each environment are the only real-world
    // material that shows the check fires. Repairing them destroys the test set.
    db.diffs = [diffRow({ __afterText: AFTER_KEPT })];
    loadCaptures(AFTER_KEPT);

    await backfillDiffSurvival();

    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty('rawDeletedText');
    expect(data).not.toHaveProperty('rawAddedText');
    expect(data).not.toHaveProperty('isLegallySignificant');
    expect(data).not.toHaveProperty('aiSignificance');
  });

  it('CONVERGES — a second run over a backfilled corpus writes nothing', async () => {
    db.diffs = [diffRow()];
    await backfillDiffSurvival();
    const { data } = update.mock.calls[0][0] as { data: Record<string, unknown> };

    // Feed the first run's own output back in, as the database would hold it.
    db.diffs = [diffRow(data)];
    update.mockClear();

    const second = await backfillDiffSurvival();

    expect(second.eligible).toBe(0);
    expect(second.written).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('refreshes a STALE verdict as well as an absent one', async () => {
    db.diffs = [
      diffRow({
        survivalVerdict: 'SURVIVES',
        survivalTextVersion: V2,
        survivalCheckVersion: SURVIVAL_CHECK_VERSION,
        survivalSourceStateHash: 'a hash from inputs this row no longer holds',
      }),
    ];

    const report = await backfillDiffSurvival();

    expect(report.fromStale).toBe(1);
    expect(report.fromUnchecked).toBe(0);
    expect(report.written).toBe(1);
  });

  it('writes nothing at all in dry-run, while still reporting the work', async () => {
    // A suggested remedy has to be safe when the diagnosis is wrong, and the
    // rehearsal is what makes that checkable before anything is written.
    db.diffs = [diffRow()];

    const report = await backfillDiffSurvival({ dryRun: true });

    expect(report.eligible).toBe(1);
    expect(report.written).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('the audit is not vacuous', () => {
  it('an empty corpus reports zero TOTAL, so no line above it reads as a pass', async () => {
    db.diffs = [];

    const report = await auditDiffSurvival();

    // Zero unchecked and zero contradicted are both true here and both
    // meaningless. `total` is the field that says so, and the script exits 1 on it.
    expect(report.summary.total).toBe(0);
    expect(report.summary.unchecked).toBe(0);
    expect(report.summary.contradicted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// UNCHECKABLE HAS TWO CAUSES AND THEY ARE NOT INTERCHANGEABLE
//
// One fixed sentence per state would tell a legitimate no-change diff that its
// captures were "extracted under different rules" — a reason invented for a
// reader, which is worse than none. Both causes are re-derived from stored
// state, so no column carries them and none can go stale.
// ---------------------------------------------------------------------------
describe('the UNCHECKABLE reason names the cause that actually applied', () => {
  /** A stored UNCHECKABLE row whose provenance reads as CURRENT. */
  function uncheckable(over: Record<string, unknown> = {}): Record<string, unknown> {
    return diffRow({
      rawDeletedText: '[]',
      rawAddedText: '[]',
      survivalVerdict: 'UNCHECKABLE',
      survivalTextVersion: V2,
      survivalCheckVersion: SURVIVAL_CHECK_VERSION,
      survivalChunksChecked: 0,
      survivalSourceStateHash: hashOf(BEFORE, AFTER_REMOVED, '[]', '[]'),
      ...over,
    });
  }

  it('says NOTHING TO CHECK when the diff reported no changes', async () => {
    db.diffs = [uncheckable()];

    const report = await auditDiffSurvival();
    const view = diffSurvivalView(db.diffs[0] as never);

    expect(report.summary.uncheckable).toBe(1);
    expect(view.reason).toContain('nothing to check');
    expect(view.reason).not.toContain('different rules');
  });

  it('says DIFFERENT RULES when the captures were never comparable', async () => {
    // The extraction versions disagree between the two captures, while the
    // stored verdict still matches the BEFORE side — so this is UNCHECKABLE for
    // the original reason, not STALE.
    db.diffs = [
      uncheckable({
        survivalChunksChecked: 3,
        afterSnapshot: capture(AFTER_REMOVED, 'v1-htmltotext-normalised'),
      }),
    ];

    const view = diffSurvivalView(db.diffs[0] as never);

    expect(view.reason).toContain('different rules');
    expect(view.reason).not.toContain('nothing to check');
  });

  it('never invents a cause it cannot support', async () => {
    // Versions agree and chunks were checked: neither known cause fits. Saying so
    // plainly beats a confident wrong explanation.
    db.diffs = [uncheckable({ survivalChunksChecked: 5 })];

    const view = diffSurvivalView(db.diffs[0] as never);

    expect(view.reason).toContain('does not say which cause');
  });

  it('attaches no reason to a verdict that IS an answer', async () => {
    db.diffs = [
      diffRow({
        survivalVerdict: 'SURVIVES',
        survivalTextVersion: V2,
        survivalCheckVersion: SURVIVAL_CHECK_VERSION,
        survivalChunksChecked: 2,
        survivalSourceStateHash: hashOf(BEFORE, AFTER_REMOVED, JSON.stringify([SENTENCE]), '[]'),
      }),
    ];

    const view = diffSurvivalView(db.diffs[0] as never);

    expect(view.state).toBe('SURVIVES');
    expect(view.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// THE RULE CAN MOVE WHILE THE DATA STANDS STILL
//
// `sourceStateHash` commits to the check's four INPUTS, so it catches a verdict
// whose data changed underneath it. It cannot catch a verdict whose RULE changed:
// when zero-chunk diffs stopped counting as SURVIVES, 88 of 103 stored verdicts
// on staging became wrong while the hash still matched and the audit called every
// one of them CURRENT.
// ---------------------------------------------------------------------------
describe('a verdict reached under a superseded check rule is STALE', () => {
  function current(over: Record<string, unknown> = {}): Record<string, unknown> {
    return diffRow({
      survivalVerdict: 'SURVIVES',
      survivalTextVersion: V2,
      survivalCheckVersion: SURVIVAL_CHECK_VERSION,
      survivalSourceStateHash: hashOf(BEFORE, AFTER_REMOVED, JSON.stringify([SENTENCE]), '[]'),
      ...over,
    });
  }

  it('detects an older named rule, with every input untouched', async () => {
    db.diffs = [current({ survivalCheckVersion: 'v1-zero-chunks-survive' })];

    const report = await auditDiffSurvival();

    expect(report.summary.stale).toBe(1);
    expect(report.summary.survives).toBe(0);
    expect(report.diffs[0]?.reason).toContain('v1-zero-chunks-survive');
  });

  it('treats a verdict with NO recorded rule as STALE, never as current', async () => {
    // Every verdict written before the column existed. Same reasoning as a NULL
    // verdict meaning UNCHECKED: absent provenance is not passing provenance.
    db.diffs = [current({ survivalCheckVersion: null })];

    const report = await auditDiffSurvival();

    expect(report.summary.stale).toBe(1);
    expect(report.diffs[0]?.reason).toContain('none recorded');
  });

  it('leaves a verdict under the CURRENT rule alone', async () => {
    // Vacuity guard: if every row were stale the two tests above would pass while
    // proving nothing about the version comparison.
    db.diffs = [current()];

    const report = await auditDiffSurvival();

    expect(report.summary).toMatchObject({ stale: 0, current: 1, survives: 1 });
  });

  it('the backfill picks a rule-stale verdict up as work', async () => {
    // The whole point: a rule change must REACH the corpus, not merely disagree
    // with it. Without this the fix would be correct in code and absent in data.
    db.diffs = [current({ survivalCheckVersion: 'v1-zero-chunks-survive' })];

    const report = await backfillDiffSurvival();

    expect(report.fromStale).toBe(1);
    expect(report.written).toBe(1);
  });
});
