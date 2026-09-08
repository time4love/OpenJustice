import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getStoredClaimTrajectories } from '../services/claimTrajectory';

const router = Router();
// ---------------------------------------------------------------------------
// GET /api/forensics/tracked
//
// Returns all TrackedUrl records ordered by most recently created.
// ---------------------------------------------------------------------------

router.get('/tracked', async (_req: Request, res: Response): Promise<void> => {
  try {
    const trackedUrls = await prisma.trackedUrl.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { diffs: true } } },
    });

    const items = trackedUrls.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      status: t.status,
      createdAt: t.createdAt,
      totalDiffs: t._count.diffs,
    }));

    res.status(200).json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to list tracked URLs', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/forensics/tracked/:id/report
//
// Returns a print-ready HTML document containing the full diff timeline for
// a TrackedUrl. Opens in a new tab; the browser auto-triggers the print
// dialog so the user can save as PDF.
// ---------------------------------------------------------------------------

/**
 * Claim trajectories for a tracked page.
 *
 * The timeline above this shows diffs — each a comparison of two snapshots. This
 * shows what no diff can: one assertion followed across the entire archived
 * history, so "removed, restored, removed again" reads as a pattern rather than
 * as three unrelated edits.
 *
 * Public for the same reason the diff timeline is: it asserts nothing a reader
 * has to take on trust. Every finding ships the archived snapshot URLs it was
 * computed from, and the computation is a string search anyone can repeat.
 *
 * READ-ONLY, and that is load-bearing. Detection is stored state now, so
 * computing on a miss would insert rows — and this route is unauthenticated.
 * It serves what has been detected and reports NOT_COMPUTED otherwise; the
 * writers are the scan that completes and the gated MCP tool.
 */
router.get('/tracked/:id/trajectories', async (req: Request, res: Response): Promise<void> => {
  const trackedUrlId = String(req.params['id'] ?? '');
  try {
    const trackedUrl = await prisma.trackedUrl.findUnique({
      where: { id: trackedUrlId },
      select: { url: true },
    });
    if (!trackedUrl) {
      res.status(404).json({ error: 'TrackedUrl not found' });
      return;
    }

    const minTransitions = Number(req.query['minTransitions'] ?? 2);
    const result = await getStoredClaimTrajectories(trackedUrl.url, {
      minTransitions: Number.isFinite(minTransitions) ? Math.max(1, minTransitions) : 2,
    });

    if (!result) {
      // Distinct from "no claim oscillated". Detection has not run for this
      // state — reporting an empty result would make an unanswered question look
      // like a negative answer.
      res.status(200).json({
        state: 'NOT_COMPUTED',
        findingCount: 0,
        findings: [],
        explanation:
          'Claim trajectories have not been detected for this page yet. They are computed when a ' +
          'scan completes; re-scan the page to populate them.',
      });
      return;
    }

    res.status(200).json({
      state: 'COMPUTED',
      url: result.url,
      snapshotsExamined: result.snapshotsExamined,
      candidatesConsidered: result.candidatesConsidered,
      // Surfaced rather than hidden: candidates the archive never contained mean
      // extraction is drifting, and a thin result would otherwise look thorough.
      candidatesNotFoundInArchive: result.candidatesUnmatched,
      findingCount: result.groups.length,
      claimsTracked: result.trajectories.length,
      provenance: result.provenance,
      findings: result.groups.map((g) => ({
        patternHash: g.patternHash,
        transitions: g.transitions,
        firstSeen: g.firstSeen,
        lastSeen: g.lastSeen,
        finalState: g.finalState,
        claimCount: g.claims.length,
        changes: g.changes,
        claims: g.claims,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Trajectory detection failed' });
  }
});

export { router as forensicsRouter };
