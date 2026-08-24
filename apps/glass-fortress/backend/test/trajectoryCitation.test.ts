// ---------------------------------------------------------------------------
// Resolving a cited claim trajectory (docs/gf-trajectory-citation-dev-plan.md).
//
// The design in one sentence: a citation names a ClaimTrajectory.id, which
// belongs to exactly one detection pass, so it resolves permanently to what was
// cited — and the resolution ALSO reports whether the newest pass still agrees.
// Pinned for integrity, current for honesty.
//
// The comparison is the FLIP SEQUENCE, never patternHash. patternHash is a hash
// of the presence vector and changes the moment a capture is added, so an
// advisory built on it would fire on every scan and be ignored within a week.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  computationId: string;
  trackedUrlId: string;
  claimHash: string;
  claimText: string;
  observations: string;
  /** Written at detection time by the real write path; the fixture does the same. */
  patternHash: string;
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
}
interface Computation {
  id: string;
  trackedUrlId: string;
  sourceStateHash: string;
  detectionVersion: string;
  computedAt: Date;
  snapshotsExamined: number;
}

const db = { rows: [] as Row[], computations: [] as Computation[] };

/**
 * Computation ids are unique per test.
 *
 * The resolver memoises a computation's rows, which is sound because a
 * computation is never updated in place — new state means a new computation. A
 * fixture that reused one id with different rows would be asserting against a
 * state the system cannot reach, and would read as a caching bug when the
 * second test got the first test's rows.
 */
let testRun = 0;
const cid = (name: string): string => `${String(testRun)}-${name}`;

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    claimTrajectory: {
      findMany: jest.fn(
        async ({ where }: { where: { id?: { in: string[] }; computationId?: string } }) => {
          const rows = where.id
            ? db.rows.filter((r) => where.id?.in.includes(r.id))
            : db.rows.filter((r) => r.computationId === where.computationId);
          return rows.map((r) => ({
            ...r,
            computation: db.computations.find((c) => c.id === r.computationId),
            trackedUrl: { url: URL_UNDER_TEST },
          }));
        },
      ),
    },
    claimTrajectoryComputation: {
      findFirst: jest.fn(async ({ where }: { where: { trackedUrlId: string } }) => {
        const latest = [...db.computations]
          .filter((c) => c.trackedUrlId === where.trackedUrlId)
          .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime())[0];
        if (!latest) return null;
        return { ...latest, trajectories: db.rows.filter((r) => r.computationId === latest.id) };
      }),
    },
  },
}));

import { claimHash, normaliseClaim, presencePatternHash } from '../src/services/claimTrajectory';
import {
  loadTrajectoryCitationLabels,
  resolveTrajectoryCitations,
  trajectoriesAgree,
  TRAJECTORY_EXTRACTION_CAVEAT,
} from '../src/services/trajectoryCitation';

const URL_UNDER_TEST = 'https://corona.health.gov.il/vaccine-for-covid/';
const TRACKED = 'tracked-1';

/** Captures, oldest first. Presence is a flag per capture. */
const CAPTURES = ['2022-07-24', '2022-08-05', '2022-08-14', '2022-09-05'];

function observations(dates: readonly string[], presence: readonly boolean[]) {
  return dates.map((snapshotDate, i) => ({
    snapshotDate,
    waybackTimestamp: snapshotDate.replace(/-/g, '') + '000000',
    snapshotUrl: `https://web.archive.org/web/${snapshotDate.replace(/-/g, '')}000000/x`,
    present: presence[i],
  }));
}

function addComputation(id: string, computedAt: string, snapshotsExamined: number): void {
  db.computations.push({
    id,
    trackedUrlId: TRACKED,
    sourceStateHash: `state-${id}`,
    detectionVersion: 'v1-collapse-ws-min40-substring-presence',
    computedAt: new Date(computedAt),
    snapshotsExamined,
  });
}

function addRow(
  id: string,
  computationId: string,
  text: string,
  dates: readonly string[],
  presence: readonly boolean[],
): Row {
  const obs = observations(dates, presence);
  const shown = obs.filter((o) => o.present);
  const row: Row = {
    id,
    computationId,
    trackedUrlId: TRACKED,
    claimHash: claimHash(normaliseClaim(text)),
    claimText: text,
    observations: JSON.stringify(obs),
    patternHash: presencePatternHash(obs),
    transitions: obs.filter((o, i) => i > 0 && o.present !== obs[i - 1].present).length,
    firstSeen: shown[0]?.snapshotDate ?? '',
    lastSeen: shown.at(-1)?.snapshotDate ?? '',
    finalState: obs.at(-1)?.present ? 'PRESENT' : 'REMOVED',
  };
  db.rows.push(row);
  return row;
}

const CLAIM = 'במהלך הניסויים הקליניים של חיסוני הפעוטות לא התגלו בעיות בטיחות חריגות או תופעות לא צפויות';

beforeEach(() => {
  db.rows = [];
  db.computations = [];
  testRun++;
});

// ---------------------------------------------------------------------------
// The agreement rule itself, in isolation.
// ---------------------------------------------------------------------------
describe('trajectoriesAgree — the flip-sequence comparison', () => {
  const cited = {
    observations: observations(CAPTURES, [true, false, false, false]),
    finalState: 'REMOVED' as const,
  };

  it('agrees when a new capture continues an unchanged history', () => {
    // The ordinary case, and the reason patternHash is not the comparison: the
    // vector changed, the story did not.
    const latest = {
      observations: observations([...CAPTURES, '2022-10-01'], [true, false, false, false, false]),
      finalState: 'REMOVED' as const,
    };
    expect(trajectoriesAgree(cited, latest)).toEqual({ agrees: true });
  });

  it('disagrees when the claim comes back — the exact failure claimHash would have hidden', () => {
    const latest = {
      observations: observations([...CAPTURES, '2022-10-01'], [true, false, false, false, true]),
      finalState: 'PRESENT' as const,
    };
    const result = trajectoriesAgree(cited, latest);
    expect(result.agrees).toBe(false);
    expect(result.agrees === false && result.difference).toContain('2022-10-01');
  });

  it('disagrees when a capture is backfilled into the middle of the history', () => {
    const latest = {
      observations: observations(
        ['2022-07-24', '2022-07-30', '2022-08-05', '2022-08-14', '2022-09-05'],
        [true, false, true, false, false],
      ),
      finalState: 'REMOVED' as const,
    };
    expect(trajectoriesAgree(cited, latest).agrees).toBe(false);
  });
});

describe('resolving a citation', () => {
  it('resolves to the PINNED pass after a later scan writes a new one', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const cited = addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);

    // A later scan, one capture longer, in which the claim came back.
    addComputation(cid('comp-2'), '2026-08-24T10:00:00Z', 5);
    addRow('traj-9', cid('comp-2'), CLAIM, [...CAPTURES, '2022-10-01'], [true, false, false, false, true]);

    const { resolved } = await resolveTrajectoryCitations([cited.id]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].computation.id).toBe(cid('comp-1'));
    // The cited reading, not the current one: four captures, ending REMOVED.
    expect(resolved[0].observations).toHaveLength(4);
    expect(resolved[0].finalState).toBe('REMOVED');
  });

  it('reports RECOMPUTED_DISAGREES when a newer pass contradicts the cited one', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const cited = addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);
    addComputation(cid('comp-2'), '2026-08-24T10:00:00Z', 5);
    addRow('traj-9', cid('comp-2'), CLAIM, [...CAPTURES, '2022-10-01'], [true, false, false, false, true]);

    const { resolved } = await resolveTrajectoryCitations([cited.id]);

    expect(resolved[0].currency.state).toBe('RECOMPUTED_DISAGREES');
    expect(resolved[0].currency.state === 'RECOMPUTED_DISAGREES' && resolved[0].currency.latestFinalState).toBe(
      'PRESENT',
    );
  });

  it('reports RECOMPUTED_AGREES when the newer pass tells the same story', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const cited = addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);
    addComputation(cid('comp-2'), '2026-08-24T10:00:00Z', 5);
    addRow('traj-9', cid('comp-2'), CLAIM, [...CAPTURES, '2022-10-01'], [true, false, false, false, false]);

    const { resolved } = await resolveTrajectoryCitations([cited.id]);

    expect(resolved[0].currency.state).toBe('RECOMPUTED_AGREES');
  });

  it('reports PINNED_IS_LATEST when nothing has been recomputed since', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const cited = addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);

    const { resolved } = await resolveTrajectoryCitations([cited.id]);

    expect(resolved[0].currency.state).toBe('PINNED_IS_LATEST');
  });

  it('calls it silence, not disagreement, when the newest pass no longer follows the claim', async () => {
    // A reclassification can stop surfacing a candidate. The newer pass then
    // makes no statement about it, and silence must not read as a contradiction.
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const cited = addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);
    addComputation(cid('comp-2'), '2026-08-24T10:00:00Z', 4);
    addRow('traj-9', cid('comp-2'), 'a completely different claim that is long enough to be followed', CAPTURES, [
      true,
      false,
      true,
      false,
    ]);

    const { resolved } = await resolveTrajectoryCitations([cited.id]);

    expect(resolved[0].currency.state).toBe('NOT_FOLLOWED_BY_LATEST');
  });

  it('reports ids that no longer resolve rather than dropping them', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const cited = addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);

    const { resolved, missing } = await resolveTrajectoryCitations([cited.id, 'traj-deleted']);

    expect(resolved.map((r) => r.id)).toEqual(['traj-1']);
    expect(missing).toEqual(['traj-deleted']);
  });
});

describe('co-movement', () => {
  it('renders eight cited member rows as ONE group carrying the count', async () => {
    // The co-movement is the finding: eight assertions appearing together and
    // vanishing together is much harder to explain as routine editing than
    // eight unrelated removals. The group has no citable id of its own, so a
    // thesis cites all eight and the renderer regroups them.
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const ids = Array.from({ length: 8 }, (_, i) =>
      addRow(`traj-${String(i + 1)}`, cid('comp-1'), `${CLAIM} — variant number ${String(i + 1)}`, CAPTURES, [
        false,
        true,
        true,
        false,
      ]).id,
    );
    // One claim on the same page that moved differently — must not be swept in.
    addRow('traj-other', cid('comp-1'), `${CLAIM} — moved alone and stayed`, CAPTURES, [true, true, true, true]);

    const { resolved } = await resolveTrajectoryCitations(ids);

    expect(resolved).toHaveLength(8);
    for (const r of resolved) {
      expect(r.coMovement.claimCount).toBe(8);
      expect(r.coMovement.members.every((m) => m.cited)).toBe(true);
    }
    expect(new Set(resolved.map((r) => r.coMovement.patternHash)).size).toBe(1);
  });

  it('marks group members that the thesis did NOT cite', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const a = addRow('traj-1', cid('comp-1'), `${CLAIM} — one`, CAPTURES, [false, true, true, false]);
    addRow('traj-2', cid('comp-1'), `${CLAIM} — two`, CAPTURES, [false, true, true, false]);

    const { resolved } = await resolveTrajectoryCitations([a.id]);

    expect(resolved[0].coMovement.claimCount).toBe(2);
    expect(resolved[0].coMovement.members.filter((m) => m.cited)).toHaveLength(1);
  });
});

describe('what a trajectory citation is allowed to claim', () => {
  // §3.3 of the plan, and the one sentence of it that had to survive review:
  // trajectories are computed over a Readability EXTRACTION that discards part
  // of every page, so a citation describes the extraction and links the
  // capture. Asserted as an ABSENCE because this is what a future edit is most
  // likely to "improve" into a stronger, false claim.
  const FORBIDDEN = [
    'the page contained',
    'the page said',
    'was on the page',
    'was removed from the page',
    'disappeared from the page',
  ];

  it('never says what the PAGE contained', () => {
    const lowered = TRAJECTORY_EXTRACTION_CAVEAT.toLowerCase();
    for (const phrase of FORBIDDEN) expect(lowered).not.toContain(phrase);
  });

  it('says what it IS computed over, and tells the reader to check the capture', () => {
    const lowered = TRAJECTORY_EXTRACTION_CAVEAT.toLowerCase();
    expect(lowered).toContain('extraction');
    expect(lowered).toContain('capture');
  });

  it('travels with every resolved citation, not with the docs', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    const cited = addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);

    const { resolved } = await resolveTrajectoryCitations([cited.id]);

    expect(resolved[0].caveat).toBe(TRAJECTORY_EXTRACTION_CAVEAT);
    // Every capture examined carries its archived URL, including the ones where
    // the claim was absent: the absences are half the finding.
    expect(resolved[0].observations).toHaveLength(4);
    expect(resolved[0].observations.every((o) => o.snapshotUrl.startsWith('https://web.archive.org/'))).toBe(true);
  });
});

describe('loadTrajectoryCitationLabels', () => {
  it('names the ids that do not exist, so a typo is caught before anything is written', async () => {
    addComputation(cid('comp-1'), '2026-08-23T10:00:00Z', 4);
    addRow('traj-1', cid('comp-1'), CLAIM, CAPTURES, [true, false, false, false]);

    const { labels, unknown } = await loadTrajectoryCitationLabels(['traj-1', 'traj-typo']);

    expect(labels.get('traj-1')).toBe(CLAIM.slice(0, 40));
    expect(unknown).toEqual(['traj-typo']);
  });
});
