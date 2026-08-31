import { Router, type Request, type Response } from 'express';
import { CalibrationDecisionType } from '@prisma/client';
import { z } from 'zod';
import { requireResearcher } from '../middleware/researcherIdentity';
import {
  abandonCalibrationRun,
  appendCalibrationDecision,
  commitCalibrationRuleset,
  describeCalibrationRun,
  CalibrationRunClosedError,
  StaleCalibrationVersionError,
} from '../services/calibrationRun';
import { renderApprovalEffect } from '../services/approvalEffect';

// ---------------------------------------------------------------------------
// LEVEL 4 — the browser's half of the MCP handoff.
//
// THE UI WRITES DECISIONS. THE BACKEND APPLIES EFFECTS. Nothing reachable from
// here calls `recordCapture`, writes a snapshot or triggers an anchor: the
// browser appends "capture X was shown", "the rules are now these", and the
// scanner — the same code path that runs headless — does the writing. Three
// consequences the plan names: an effect cannot depend on a browser staying
// open, every UI write is reversible run state, and the interactive and headless
// paths are THE SAME PATH.
//
// THE RUN ID IN THE PATH IS A POINTER, NOT A CREDENTIAL. Every route is behind
// `requireResearcher`, the auth the rest of the researcher surface already uses.
// A bearer token in a URL leaks through history and referrers, which is why the
// plan forbids one here.
//
// THIS SHAPE IS `oauthInteractionRoutes`', deliberately — an id in the path, a
// read-only GET the frontend fetches for state, and posts that advance it. The
// plan: extend that handoff, do not invent a second one.
// ---------------------------------------------------------------------------

const router = Router();
router.use(requireResearcher);

/** A decision the browser may append. RUN_OPENED and RUN_CLOSED are the server's. */
const decisionBody = z.object({
  expectedVersion: z.number().int().nonnegative(),
  type: z.enum([
    CalibrationDecisionType.CAPTURE_SHOWN,
    CalibrationDecisionType.RULESET_CORRECTED,
    CalibrationDecisionType.CAPTURE_ACCEPTED,
    CalibrationDecisionType.CAPTURE_REJECTED,
    CalibrationDecisionType.CAPTURE_SKIPPED,
  ]),
  selectors: z.array(z.string()).optional(),
  snapshotId: z.string().optional(),
  waybackTimestamp: z.string().optional(),
  observationId: z.string().optional(),
  reason: z.string().optional(),
});

const versionBody = z.object({ expectedVersion: z.number().int().nonnegative() });

/**
 * One translation of the service's refusals into status codes.
 *
 * 409 FOR A STALE VERSION, and it is not an error in the ordinary sense: the
 * researcher's browser is simply a version behind another tab. The page re-reads
 * and re-offers. A 500 here would present a race as a fault.
 *
 * 410 FOR A RUN THAT IS GONE OR CLOSED — the same treatment OAuth's expired
 * interaction already gets, which the plan asks for by name.
 */
function respondToFailure(res: Response, err: unknown): void {
  if (err instanceof StaleCalibrationVersionError) {
    res.status(409).json({ error: 'stale_version', message: err.message });
    return;
  }
  if (err instanceof CalibrationRunClosedError) {
    res.status(410).json({ error: 'run_closed', message: err.message });
    return;
  }
  if (err instanceof Error && /not found/i.test(err.message)) {
    res.status(410).json({ error: 'run_not_found', message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error('[articleRules] unexpected failure:', err instanceof Error ? err.stack : err);
  res.status(500).json({ error: 'internal_error', message });
}

/** The run's whole state, folded. Everything the page renders comes from here. */
function present(detail: Awaited<ReturnType<typeof describeCalibrationRun>>) {
  return {
    ...detail.state,
    staleSelectors: detail.staleSelectors,
    storedCaptures: detail.storedCaptures,
    effect: renderApprovalEffect(detail.effect),
    effectDeclaration: detail.effect,
  };
}

/**
 * The path parameter, TYPED rather than read through an index signature.
 *
 * `req.params['runId']` is what the tsconfig's `noPropertyAccessFromIndexSignature`
 * forces on an untyped `Request` — and `dot-notation` then objects to the
 * brackets, the two-ratchets conflict in its third form. Naming the params gives
 * `runId` a real property type, which satisfies both and drops seven
 * `String(...)` coercions that only existed to launder the index read.
 */
type RunRequest<B = unknown> = Request<{ runId: string }, unknown, B>;

// GET /api/article-rules/:runId — read-only state for the marking page.
router.get('/:runId', async (req: RunRequest, res: Response): Promise<void> => {
  try {
    res.json(present(await describeCalibrationRun(req.params.runId)));
  } catch (err) {
    respondToFailure(res, err);
  }
});

// POST /api/article-rules/:runId/decisions — append one decision.
router.post('/:runId/decisions', async (req: RunRequest, res: Response): Promise<void> => {
  const parsed = decisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_decision', message: parsed.error.message });
    return;
  }
  const { expectedVersion, ...decision } = parsed.data;
  try {
    await appendCalibrationDecision(req.params.runId, expectedVersion, decision);
    res.json(present(await describeCalibrationRun(req.params.runId)));
  } catch (err) {
    respondToFailure(res, err);
  }
});

// POST /api/article-rules/:runId/commit — put these rules in force.
router.post('/:runId/commit', async (req: RunRequest, res: Response): Promise<void> => {
  const parsed = versionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', message: parsed.error.message });
    return;
  }
  try {
    // The EFFECT is applied here, server-side, exactly as the plan requires —
    // and it is only the pointer move. Re-deriving the stored captures is the
    // scanner's, in step 2b.
    const result = await commitCalibrationRuleset(req.params.runId, parsed.data.expectedVersion);
    res.json({
      ...present(await describeCalibrationRun(req.params.runId)),
      articleRulesetId: result.articleRulesetId,
      committedRulesetId: result.rulesetId,
    });
  } catch (err) {
    respondToFailure(res, err);
  }
});

// POST /api/article-rules/:runId/abandon — close without committing.
router.post('/:runId/abandon', async (req: RunRequest, res: Response): Promise<void> => {
  const parsed = versionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', message: parsed.error.message });
    return;
  }
  try {
    await abandonCalibrationRun(req.params.runId, parsed.data.expectedVersion);
    res.json(present(await describeCalibrationRun(req.params.runId)));
  } catch (err) {
    respondToFailure(res, err);
  }
});

export { router as articleRulesRouter };
