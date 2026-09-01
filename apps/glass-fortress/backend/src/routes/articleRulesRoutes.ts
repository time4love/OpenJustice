import { Router, type Request, type Response } from 'express';
import { CalibrationDecisionType } from '@prisma/client';
import { z } from 'zod';
import { requireResearcher } from '../middleware/researcherIdentity';
import {
  abandonCalibrationRun,
  appendCalibrationDecision,
  commitCalibrationRuleset,
  describeCalibrationRun,
  ensureCurrentRuleset,
  readCalibrationRun,
  CalibrationRunClosedError,
  StaleCalibrationVersionError,
} from '../services/calibrationRun';
import { renderApprovalEffect } from '../services/approvalEffect';
import {
  loadCaptureForMarking,
  previewUnderSelectors,
  recordObservationForCapture,
} from '../services/captureMarking';
import { CAPTURE_SAMPLE, stratifiedSample } from '../lib/timelineSample';
import { prisma } from '../lib/prisma';

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

// -------------------------------------------------------------------------
// The capture surface. Reads only — none of this writes a capture, a snapshot
// or an anchor; it renders bytes already held and derives views over them.
// -------------------------------------------------------------------------

// `CAPTURE_SAMPLE` now lives beside the sampler — the adaptive policy needs it too.

// GET /api/article-rules/:runId/captures — which captures to mark against.
//
// TIMELINE-STRATIFIED, NOT THE FIRST N. The first captures are consecutive and
// from the page's earliest era, possibly a template that no longer exists and
// possibly predating the site's advertising entirely. The whole history costs
// the same number of pages to look at and surfaces the redesigns.
router.get('/:runId/captures', async (req: RunRequest, res: Response): Promise<void> => {
  try {
    const state = await readCalibrationRun(req.params.runId);
    const all = await prisma.urlSnapshot.findMany({
      where: { trackedUrlId: state.trackedUrlId },
      select: { id: true, capturedAt: true, waybackTimestamp: true, snapshotDate: true },
      orderBy: { capturedAt: 'asc' },
    });
    res.json({
      total: all.length,
      // The sample is what to look at; `total` is what exists. Reporting only
      // the sample would let twelve captures read as the whole history.
      sample: stratifiedSample(all, CAPTURE_SAMPLE),
    });
  } catch (err) {
    respondToFailure(res, err);
  }
});

// GET /api/article-rules/:runId/captures/:snapshotId — one capture to look at.
router.get(
  '/:runId/captures/:snapshotId',
  async (req: Request<{ runId: string; snapshotId: string }>, res: Response): Promise<void> => {
    try {
      res.json(await loadCaptureForMarking(req.params.snapshotId));
    } catch (err) {
      respondToFailure(res, err);
    }
  },
);

// POST /api/article-rules/:runId/captures/:snapshotId/preview — draft rules,
// applied. PURE: called on every edit, so it must leave nothing behind.
router.post(
  '/:runId/captures/:snapshotId/preview',
  async (
    req: Request<{ runId: string; snapshotId: string }, unknown, unknown>,
    res: Response,
  ): Promise<void> => {
    const parsed = z.object({ selectors: z.array(z.string()) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', message: parsed.error.message });
      return;
    }
    try {
      res.json(await previewUnderSelectors(req.params.snapshotId, parsed.data.selectors));
    } catch (err) {
      respondToFailure(res, err);
    }
  },
);

// POST /api/article-rules/:runId/decisions — append one decision.
router.post('/:runId/decisions', async (req: RunRequest, res: Response): Promise<void> => {
  const parsed = decisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_decision', message: parsed.error.message });
    return;
  }
  const { expectedVersion, ...decision } = parsed.data;
  try {
    // THE OBSERVATION IS COMPUTED HERE, NOT POSTED BY THE PAGE. The browser has
    // just rendered a preview and could send the figures back a round trip
    // cheaper — which would make a scan's deviation baseline something a client
    // asserts. Deriving again costs one parse per capture a human looks at.
    //
    // Written BEFORE the append, and that ordering is safe: an observation is a
    // measurement of (ruleset, capture) that is true whether or not the decision
    // lands, and the write is an idempotent upsert. A stale-version refusal
    // therefore leaves a correct row, not a stray one.
    let observationId: string | undefined;
    if (decision.snapshotId !== undefined && decision.type !== 'RULESET_CORRECTED') {
      const ruleset = await ensureCurrentRuleset(req.params.runId);
      ({ observationId } = await recordObservationForCapture({
        articleRulesetId: ruleset.id,
        snapshotId: decision.snapshotId,
        selectors: (await readCalibrationRun(req.params.runId)).selectors,
      }));
    }

    await appendCalibrationDecision(req.params.runId, expectedVersion, {
      ...decision,
      ...(observationId === undefined ? {} : { observationId }),
    });
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
