// ---------------------------------------------------------------------------
// Claim trajectories — following one assertion across a page's whole history.
//
// The finding no individual diff can see. On corona.health.gov.il the 4th-dose
// efficacy figures were added, removed, restored, removed, restored and removed
// again across six months; every diff that contained them saw only its own step.
//
// Detection is deterministic by design. Presence is a string search against the
// archived snapshot text, so the result is reproducible, complete, free, and —
// the part that matters for a forensic tool — verifiable by an outsider against
// web.archive.org without trusting anything this platform says.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
    urlVersionDiff: { findMany: jest.fn() },
    claimTrajectory: { upsert: jest.fn() },
  },
}));

import { prisma } from '../src/lib/prisma';
import {
  buildTrajectory,
  computeClaimTrajectories,
  normaliseClaim,
  claimHash,
} from '../src/services/claimTrajectory';
import { groupByMovement } from '../src/services/claimTrajectory';
import { getClaimTrajectoriesHandler } from '../src/mcp/tools/getClaimTrajectories';

const CLAIM =
  'הממצאים מראים כי מי שחוסנו בחיסון רביעי מוגנים מפני הדבקה פי 2 יותר ממי שחוסנו בשלושה חיסונים';

function snap(date: string, contains: boolean): {
  snapshotDate: string;
  waybackTimestamp: string;
  snapshotUrl: string;
  normalisedText: string;
} {
  return {
    snapshotDate: date,
    waybackTimestamp: date.replace(/-/g, '') + '000000',
    snapshotUrl: `https://web.archive.org/web/${date}/x`,
    normalisedText: contains ? `prefix ${CLAIM} suffix` : 'prefix suffix',
  };
}

describe('normalisation', () => {
  it('collapses whitespace so re-wrapped text still matches itself', () => {
    expect(normaliseClaim('  a \n\n b\t c ')).toBe('a b c');
  });

  it('gives identical text an identical hash — the trajectory identity', () => {
    expect(claimHash(normaliseClaim('a  b'))).toBe(claimHash(normaliseClaim('a\nb')));
  });
});

describe('buildTrajectory', () => {
  it('counts every presence flip across the timeline', () => {
    // The real corona.health.gov.il sequence: added, removed, restored,
    // removed, restored, removed.
    const t = buildTrajectory(CLAIM, [
      snap('2022-05-24', false),
      snap('2022-05-25', true),
      snap('2022-05-29', false),
      snap('2022-05-30', true),
      snap('2022-08-05', false),
      snap('2022-09-06', true),
      snap('2022-11-29', false),
    ]);

    expect(t?.transitions).toBe(6);
    expect(t?.finalState).toBe('REMOVED');
    expect(t?.firstSeen).toBe('2022-05-25');
    expect(t?.lastSeen).toBe('2022-09-06');
  });

  it('records absences too — they are half the finding', () => {
    const t = buildTrajectory(CLAIM, [snap('2022-01-01', false), snap('2022-02-01', true)]);

    expect(t?.observations.map((o) => o.present)).toEqual([false, true]);
  });

  it('reports a claim still on the page as PRESENT', () => {
    const t = buildTrajectory(CLAIM, [snap('2022-01-01', true), snap('2022-02-01', true)]);

    expect(t?.finalState).toBe('PRESENT');
    expect(t?.transitions).toBe(0);
  });

  it('returns null for a claim that appears in no snapshot', () => {
    // Usually an extracted quote that was paraphrased rather than copied — a
    // trajectory must never be invented from text the archive does not contain.
    expect(buildTrajectory('never appears anywhere', [snap('2022-01-01', true)])).toBeNull();
  });
});

describe('computeClaimTrajectories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 't-1' });
  });

  function withSnapshots(dates: [string, boolean][]): void {
    (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(
      dates.map(([d, c]) => ({
        snapshotDate: d,
        waybackTimestamp: d.replace(/-/g, '') + '000000',
        snapshotUrl: `https://web.archive.org/web/${d}/x`,
        fullText: c ? `prefix ${CLAIM} suffix` : 'prefix suffix',
      })),
    );
  }

  function withCandidates(quotes: string[]): void {
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([
      {
        deletedText: JSON.stringify(quotes.map((q) => ({ summary: 's', exactQuote: q }))),
        addedText: '[]',
      },
    ]);
  }

  it('finds the oscillation and keeps it', async () => {
    withSnapshots([
      ['2022-05-25', true],
      ['2022-05-29', false],
      ['2022-05-30', true],
      ['2022-11-29', false],
    ]);
    withCandidates([CLAIM]);

    const r = await computeClaimTrajectories('https://health.gov.il/x');

    expect(r.trajectories).toHaveLength(1);
    expect(r.trajectories[0].transitions).toBe(3);
    expect(r.snapshotsExamined).toBe(4);
  });

  it('drops single-transition claims — an ordinary removal is already a diff', async () => {
    withSnapshots([
      ['2022-05-25', true],
      ['2022-11-29', false],
    ]);
    withCandidates([CLAIM]);

    const r = await computeClaimTrajectories('https://health.gov.il/x');

    expect(r.trajectories).toHaveLength(0);
    expect(r.candidatesConsidered).toBe(1);
  });

  it('ignores short quotes that recur incidentally', async () => {
    withSnapshots([['2022-05-25', true]]);
    withCandidates(['החיסון בטוח']);

    const r = await computeClaimTrajectories('https://health.gov.il/x');

    expect(r.candidatesConsidered).toBe(0);
  });

  it('counts candidates the archive never contained rather than hiding them', async () => {
    withSnapshots([
      ['2022-05-25', true],
      ['2022-05-29', false],
    ]);
    withCandidates(['a quote long enough to pass the length gate but never on the page']);

    const r = await computeClaimTrajectories('https://health.gov.il/x');

    expect(r.candidatesUnmatched).toBe(1);
    expect(r.trajectories).toHaveLength(0);
  });

  it('dedupes identical candidates extracted from several diffs', async () => {
    withSnapshots([['2022-05-25', true]]);
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([
      { deletedText: JSON.stringify([{ summary: 's', exactQuote: CLAIM }]), addedText: '[]' },
      { deletedText: JSON.stringify([{ summary: 's', exactQuote: `  ${CLAIM}  ` }]), addedText: '[]' },
    ]);

    const r = await computeClaimTrajectories('https://health.gov.il/x');

    expect(r.candidatesConsidered).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Detection reads; it never writes.
  //
  // The result is deterministic and cheap to recompute, so storing it would only
  // create a second copy able to fall behind the snapshots it describes — and a
  // write path with no reader invites building on rows from an older detection
  // pass. ClaimTrajectory stays in the schema for when citation needs a stable
  // identity to point at.
  // -------------------------------------------------------------------------
  it('never writes — the result is recomputed, not stored', async () => {
    withSnapshots([
      ['2022-05-25', true],
      ['2022-05-29', false],
      ['2022-05-30', true],
    ]);
    withCandidates([CLAIM]);

    await computeClaimTrajectories('https://health.gov.il/x');

    expect(prisma.claimTrajectory.upsert).not.toHaveBeenCalled();
  });

  it('gives identical text the same hash every run, so results are stable to cite', () => {
    expect(claimHash(normaliseClaim(CLAIM))).toBe(claimHash(normaliseClaim(`  ${CLAIM}  `)));
  });
});

// ---------------------------------------------------------------------------
// get_claim_trajectories — the researcher-facing surface.
//
// Without it the detection service was deployed dead code and the only way to
// see a trajectory was running a script on a developer's laptop. That is the
// same defect as the whistleblower call: a real capability, unreachable from the
// workflow the platform is built around.
// ---------------------------------------------------------------------------
describe('get_claim_trajectories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 't-1' });
  });

  function setup(present: boolean[]): void {
    (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(
      present.map((c, i) => ({
        snapshotDate: `2022-0${i + 1}-01`,
        waybackTimestamp: `20220${i + 1}01000000`,
        snapshotUrl: `https://web.archive.org/web/20220${i + 1}01/x`,
        fullText: c ? `prefix ${CLAIM} suffix` : 'prefix suffix',
      })),
    );
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([
      { deletedText: JSON.stringify([{ summary: 's', exactQuote: CLAIM }]), addedText: '[]' },
    ]);
  }

  it('returns only the flips, each with a verifiable snapshot URL', async () => {
    setup([true, true, false, true]);

    const r = JSON.parse(
      await getClaimTrajectoriesHandler({ url: 'https://health.gov.il/x' }),
    ) as { findings: { changes: { snapshotUrl: string; present: boolean }[] }[] };

    // First observation plus each flip — not all four snapshots.
    expect(r.findings[0].changes.map((c) => c.present)).toEqual([true, false, true]);
    expect(r.findings[0].changes[0].snapshotUrl).toContain('web.archive.org');
  });

  it('reports candidates the archive never contained rather than hiding them', async () => {
    (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue([
      { snapshotDate: '2022-01-01', waybackTimestamp: 'x', snapshotUrl: 'u', fullText: 'nothing here' },
    ]);
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([
      { deletedText: JSON.stringify([{ summary: 's', exactQuote: CLAIM }]), addedText: '[]' },
    ]);

    const r = JSON.parse(
      await getClaimTrajectoriesHandler({ url: 'https://health.gov.il/x' }),
    ) as { candidatesNotFoundInArchive: number };

    expect(r.candidatesNotFoundInArchive).toBe(1);
  });

  it('tells an unscanned page apart from one with no oscillations', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue(null);

    const r = JSON.parse(
      await getClaimTrajectoriesHandler({ url: 'https://health.gov.il/never-scanned' }),
    ) as { error: string; explanation: string };

    expect(r.error).toBe('NOT_TRACKED');
    expect(r.explanation).toContain('start_forensic_scan');
  });
});

// ---------------------------------------------------------------------------
// Grouping by shared movement.
//
// Pages are edited in blocks, so a section added and later removed produces one
// trajectory per paragraph inside it. The first real run on
// corona.health.gov.il reported 47 trajectories that were only 15 events — ten
// of them sharing a single pattern — and a reader had no way to tell one block
// edit from ten independent findings.
//
// The grouping is also the stronger evidentiary claim: eight assertions about
// infant vaccination safety appearing together and vanishing together is much
// harder to explain as routine editing than eight unrelated removals.
// ---------------------------------------------------------------------------
describe('groupByMovement', () => {
  function traj(text: string, presence: boolean[]): Parameters<typeof groupByMovement>[0][number] {
    const observations = presence.map((present, i) => ({
      snapshotDate: `2022-0${i + 1}-01`,
      waybackTimestamp: `20220${i + 1}01000000`,
      snapshotUrl: `https://web.archive.org/web/20220${i + 1}01/x`,
      present,
    }));
    const shown = observations.filter((o) => o.present);
    return {
      claimHash: claimHash(text),
      claimText: text,
      observations,
      transitions: observations.filter((o, i) => i > 0 && o.present !== observations[i - 1].present).length,
      firstSeen: shown[0]?.snapshotDate ?? '',
      lastSeen: shown[shown.length - 1]?.snapshotDate ?? '',
      finalState: observations[observations.length - 1].present ? 'PRESENT' : 'REMOVED',
    };
  }

  it('collapses claims that moved as one block', () => {
    const groups = groupByMovement([
      traj('a', [false, true, false]),
      traj('b', [false, true, false]),
      traj('c', [false, true, false]),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].claims).toHaveLength(3);
  });

  it('keeps claims apart when they flip on the same dates but differ in between', () => {
    // Same first and last state, same flip dates — but one was absent in the
    // middle. Merging them would assert a co-movement that did not happen.
    const groups = groupByMovement([
      traj('a', [true, true, true, false]),
      traj('b', [true, false, true, false]),
    ]);

    expect(groups).toHaveLength(2);
  });

  it('reports the largest block first — a section moving as a unit is the stronger finding', () => {
    const groups = groupByMovement([
      traj('lonely', [true, false, true, false]),
      traj('a', [false, true, false, false]),
      traj('b', [false, true, false, false]),
      traj('c', [false, true, false, false]),
    ]);

    expect(groups[0].claims).toHaveLength(3);
    expect(groups[1].claims).toHaveLength(1);
  });

  it('carries the shared shape as flips only, not every snapshot', () => {
    const groups = groupByMovement([traj('a', [false, false, true, true, false])]);

    expect(groups[0].changes.map((c) => c.present)).toEqual([false, true, false]);
  });
});

describe('get_claim_trajectories grouping', () => {
  it('reports findings as groups, with claims nested and counted', async () => {
    (prisma.trackedUrl.findUnique as jest.Mock).mockResolvedValue({ id: 't-1' });
    const OTHER = `${CLAIM} וגם משפט נוסף שנע יחד עם הראשון בדיוק באותם צילומים`;
    (prisma.urlSnapshot.findMany as jest.Mock).mockResolvedValue(
      [true, false, true].map((c, i) => ({
        snapshotDate: `2022-0${i + 1}-01`,
        waybackTimestamp: `20220${i + 1}01000000`,
        snapshotUrl: `https://web.archive.org/web/20220${i + 1}01/x`,
        fullText: c ? `prefix ${OTHER} suffix` : 'prefix suffix',
      })),
    );
    (prisma.urlVersionDiff.findMany as jest.Mock).mockResolvedValue([
      {
        deletedText: JSON.stringify([
          { summary: 's', exactQuote: CLAIM },
          { summary: 's', exactQuote: OTHER },
        ]),
        addedText: '[]',
      },
    ]);

    const r = JSON.parse(
      await getClaimTrajectoriesHandler({ url: 'https://health.gov.il/x' }),
    ) as { findingCount: number; claimsTracked: number; findings: { claimCount: number }[] };

    // Both claims move identically, so they are one finding covering two claims.
    expect(r.findingCount).toBe(1);
    expect(r.claimsTracked).toBe(2);
    expect(r.findings[0].claimCount).toBe(2);
  });
});
