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

  it('writes nothing unless asked to persist', async () => {
    withSnapshots([
      ['2022-05-25', true],
      ['2022-05-29', false],
      ['2022-05-30', true],
    ]);
    withCandidates([CLAIM]);

    await computeClaimTrajectories('https://health.gov.il/x');

    expect(prisma.claimTrajectory.upsert).not.toHaveBeenCalled();
  });

  it('upserts on content-derived identity, so recomputation cannot duplicate', async () => {
    withSnapshots([
      ['2022-05-25', true],
      ['2022-05-29', false],
      ['2022-05-30', true],
    ]);
    withCandidates([CLAIM]);

    await computeClaimTrajectories('https://health.gov.il/x', { persist: true });

    const call = (prisma.claimTrajectory.upsert as jest.Mock).mock.calls[0][0] as {
      where: { trackedUrlId_claimHash: { trackedUrlId: string; claimHash: string } };
    };
    expect(call.where.trackedUrlId_claimHash.trackedUrlId).toBe('t-1');
    expect(call.where.trackedUrlId_claimHash.claimHash).toBe(claimHash(CLAIM));
  });
});
