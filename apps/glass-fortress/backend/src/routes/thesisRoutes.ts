import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { MentionType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { parseMentions } from '../utils/parseMentions';
import { DevilsAdvocateOutputSchema } from '../services/DevilsAdvocateAgent';
import { FoiaLetterAgent } from '../services/FoiaLetterAgent';
import { RevisionAgent } from '../services/RevisionAgent';
import { Web3Service } from '../services/Web3Service';
import { analyzeEphemeral, storeEphemeral } from '../services/EphemeralAnalysisService';
import { buildTipTapDoc } from '../utils/tipTapUtils';
import { sha256, extractText, extractPreview, triggerAIAnalysis } from '../services/thesisAnalysis';
import { logSessionEvent } from '../services/sessionService';
import { suggestThesisHandler } from '../mcp/tools/suggestThesis';
import { createThesisDraftHandler } from '../mcp/tools/createThesisDraft';
import { buildEvidenceAnalysisData } from '../lib/evidenceCreateData';
import { upsertKeyFigures } from '../lib/upsertKeyFigures';
import { aiCostLimiter } from '../middleware/rateLimiting';
import { identifyResearcher, requireResearcher } from '../middleware/researcherIdentity';
import { publicationState, versionIdForViewer, type Viewer } from '../lib/thesisView';
import { loadTrajectoryCitationLabels, resolveTrajectoryCitations } from '../services/trajectoryCitation';
import { assessPublication, publishThesis, unpublishThesis } from '../services/thesisPublication';
import { getThesisProvenance } from '../services/thesisProvenance';
import { repairFramingLink } from '../services/thesisFraming';

const router = Router();

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _revisionAgent: RevisionAgent | null = null;
let _foiaAgent: FoiaLetterAgent | null = null;
function getRevisionAgent(): RevisionAgent {
  if (!_revisionAgent) _revisionAgent = new RevisionAgent();
  return _revisionAgent;
}

function getFoiaAgent(): FoiaLetterAgent {
  if (!_foiaAgent) _foiaAgent = new FoiaLetterAgent();
  return _foiaAgent;
}

// ---------------------------------------------------------------------------
// Evidence-mention enrichment — fileHash -> readable summary, shared by the
// full-thesis and single-version fetch routes below
// ---------------------------------------------------------------------------

/**
 * Trajectory-mention enrichment — ClaimTrajectory.id -> everything the chip
 * needs, resolved server-side.
 *
 * The client never receives a bare id to look up. A trajectory says what an
 * archived TEXT EXTRACTION contained, not what a page contained, and that
 * distinction only survives if whatever renders it is handed the observations,
 * the capture links and the caveat together.
 */
async function buildTrajectoryMap(mentions: readonly { type: MentionType; refId: string }[]) {
  const ids = mentions.filter((m) => m.type === 'CLAIM_TRAJECTORY').map((m) => m.refId);
  const { resolved } = await resolveTrajectoryCitations(ids);

  return Object.fromEntries(
    resolved.map((t) => [
      t.id,
      {
        claimText: t.claimText,
        url: t.url,
        trackedUrlId: t.trackedUrlId,
        transitions: t.transitions,
        firstSeen: t.firstSeen,
        lastSeen: t.lastSeen,
        finalState: t.finalState,
        // The flips, and every capture examined — the absences are half the
        // finding, and each carries the archived URL a reader can open.
        changes: t.changes.map((o) => ({ snapshotDate: o.snapshotDate, present: o.present, snapshotUrl: o.snapshotUrl })),
        observations: t.observations.map((o) => ({
          snapshotDate: o.snapshotDate,
          present: o.present,
          snapshotUrl: o.snapshotUrl,
        })),
        coMovementCount: t.coMovement.claimCount,
        coMovementCitedCount: t.coMovement.members.filter((m) => m.cited).length,
        computedAt: t.computation.computedAt,
        sourceStateHash: t.computation.sourceStateHash,
        currency: t.currency,
      },
    ]),
  );
}

async function buildEvidenceMap(evidenceRefIds: string[]) {
  const evidenceRecords = evidenceRefIds.length > 0
    ? await prisma.evidence.findMany({
        where: { fileHash: { in: evidenceRefIds } },
        select: {
          id: true,
          fileHash: true,
          summary: true,
          investigativeCategories: true,
          evidenceTier: true,
          evidenceType: true,
          urlVersionDiff: { select: { trackedUrlId: true } },
        },
      })
    : [];

  return Object.fromEntries(
    evidenceRecords.map((e) => [
      e.fileHash,
      {
        evidenceId: e.id,
        summary: e.summary,
        investigativeCategories: e.investigativeCategories,
        evidenceTier: e.evidenceTier,
        evidenceType: e.evidenceType,
        trackedUrlId: e.urlVersionDiff?.trackedUrlId ?? null,
      },
    ]),
  );
}


// ---------------------------------------------------------------------------
// Async AI trigger — fire-and-forget from POST routes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const CreateThesisSchema = z.object({
  userContent: z.record(z.string(), z.unknown()),
});

const ListThesesSchema = z.object({
  evidence: z.string().optional(),
});

const ResolveGapSchema = z.object({
  evidenceId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST /api/thesis
//
// Creates a new Thesis with its first ThesisVersion.
// Mention extraction is synchronous; AI analysis fires in the background.
// ---------------------------------------------------------------------------

router.post('/', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateThesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { userContent } = parsed.data;

  let mentions: ReturnType<typeof parseMentions>;
  try {
    mentions = parseMentions(userContent);
  } catch {
    res.status(400).json({ error: 'userContent is not a valid TipTap document' });
    return;
  }

  try {
    const contentHash = sha256(userContent);

    const { updatedThesis, version } = await prisma.$transaction(async (tx) => {
      const thesis = await tx.thesis.create({ data: {} });

      const version = await tx.thesisVersion.create({
        data: {
          thesisId: thesis.id,
          userContent: userContent as Prisma.InputJsonValue,
          contentHash,
          status: 'PENDING_AI',
          mentions: {
            createMany: { data: mentions.map((m) => ({ type: m.type, refId: m.refId })) },
          },
        },
      });

      const updatedThesis = await tx.thesis.update({
        where: { id: thesis.id },
        data: { headVersionId: version.id },
      });

      return { updatedThesis, version };
    });

    res.status(201).json({
      thesis: {
        id: updatedThesis.id,
        createdAt: updatedThesis.createdAt,
        headVersion: {
          id: version.id,
          status: version.status,
          contentHash: version.contentHash,
          preview: extractPreview(userContent),
          createdAt: version.createdAt,
        },
      },
    });

    // Fire-and-forget — do not await
    void triggerAIAnalysis(version.id, userContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to create thesis', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/thesis
//
// Lists all theses with a preview of the head version.
// ---------------------------------------------------------------------------

router.get('/', identifyResearcher, async (req: Request, res: Response): Promise<void> => {
  const { evidence } = ListThesesSchema.parse(req.query ?? {});
  const viewer: Viewer = req.researcherId ? 'RESEARCHER' : 'PUBLIC';

  // Viewer-dependent (lib/thesisView.ts): the public is listed only PUBLISHED
  // theses, previewed from the published version; a researcher gets every
  // thesis, previewed from the head, with its publication state.
  const versionFilter = evidence ? { mentions: { some: { type: 'EVIDENCE' as const, refId: evidence } } } : undefined;
  const where: Prisma.ThesisWhereInput =
    viewer === 'PUBLIC'
      ? { publishedVersionId: { not: null }, ...(versionFilter ? { publishedVersion: versionFilter } : {}) }
      : versionFilter
        ? { headVersion: versionFilter }
        : {};

  const versionSelect = {
    id: true,
    status: true,
    contentHash: true,
    userContent: true,
    aiAnalysis: true,
    createdAt: true,
    _count: { select: { mentions: true } },
  } satisfies Prisma.ThesisVersionSelect;

  try {
    const theses = await prisma.thesis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        headVersion: { select: versionSelect },
        publishedVersion: { select: versionSelect },
        publishedBy: { select: { handle: true } },
        versions: { select: { id: true, createdAt: true } },
      },
    });

    res.status(200).json({
      viewer,
      theses: theses.map((t) => {
        const served = viewer === 'RESEARCHER' ? t.headVersion : t.publishedVersion;
        const analysis = served?.aiAnalysis as {
          evidenceGaps?: unknown[];
          overallStrengthAssessment?: string;
        } | null;
        return {
          id: t.id,
          title: t.title ?? null,
          createdAt: t.createdAt,
          openGapCount: analysis?.evidenceGaps?.length ?? 0,
          publication: publicationState(t, t.versions),
          version: served
            ? {
                id: served.id,
                status: served.status,
                contentHash: served.contentHash,
                preview: extractPreview(served.userContent),
                mentionCount: served._count.mentions,
                strength: analysis?.overallStrengthAssessment ?? null,
                createdAt: served.createdAt,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to list theses', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/thesis/:id
//
// Returns a single thesis with the version this VIEWER is served, in full:
// the published version for the public (404 while unpublished — a draft does
// not exist as far as the public is concerned), the head for a researcher,
// with the publication state alongside. Backs the thesis page and the call
// page.
// ---------------------------------------------------------------------------

router.get('/:id', identifyResearcher, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }
  const viewer: Viewer = req.researcherId ? 'RESEARCHER' : 'PUBLIC';

  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id },
      include: {
        publishedBy: { select: { handle: true } },
        versions: { select: { id: true, createdAt: true } },
      },
    });

    const versionId = thesis ? versionIdForViewer(thesis, viewer) : null;
    if (!thesis || (viewer === 'PUBLIC' && versionId === null)) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    const version = versionId
      ? await prisma.thesisVersion.findUnique({
          where: { id: versionId },
          include: {
            mentions: true,
            gapResolutions: {
              include: { evidence: { select: { summary: true, investigativeCategories: true, evidenceTier: true } } },
              orderBy: { gapIndex: 'asc' },
            },
          },
        })
      : null;

    // Enrich with evidence summaries so the UI can show readable labels on mention chips
    const evidenceRefIds = (version?.mentions ?? []).filter((m) => m.type === 'EVIDENCE').map((m) => m.refId);
    const evidenceMap = await buildEvidenceMap(evidenceRefIds);
    const trajectoryMap = await buildTrajectoryMap(version?.mentions ?? []);

    const gapResolutions = (version?.gapResolutions ?? []).map((r) => ({
      gapIndex: r.gapIndex,
      evidenceId: r.evidenceId,
      evidence: r.evidence,
      createdAt: r.createdAt,
    }));

    res.status(200).json({
      thesis: {
        id: thesis.id,
        title: thesis.title,
        createdAt: thesis.createdAt,
        viewer,
        publication: publicationState(thesis, thesis.versions),
        publicInterestStatement: thesis.publicInterestStatement,
        version: version ? { ...version, gapResolutions: undefined } : null,
      },
      evidenceMap,
      trajectoryMap,
      gapResolutions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch thesis', message });
  }
});

// ---------------------------------------------------------------------------
// Publication — the gate (docs/gf-thesis-publication-gate-dev-plan.md).
// Researcher-only. The same service the MCP tools call, so the web control
// and the tools cannot disagree about what is publishable.
// ---------------------------------------------------------------------------

const PublishSchema = z.object({
  rationale: z.string().min(1),
  publicInterestStatement: z.string().optional(),
});

router.post('/:id/publication-readiness', requireResearcher, aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  const body = PublishSchema.partial().safeParse(req.body ?? {});
  if (!id || !body.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  try {
    const report = await assessPublication(id, body.data.rationale ?? null, body.data.publicInterestStatement);
    if ('error' in report) {
      res.status(404).json(report);
      return;
    }
    res.status(200).json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to assess publication readiness', message });
  }
});

router.post('/:id/publish', requireResearcher, aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  const body = PublishSchema.safeParse(req.body ?? {});
  if (!id || !body.success || !req.researcherId) {
    res.status(400).json({ error: 'Invalid request: rationale is required' });
    return;
  }
  try {
    const result = await publishThesis(id, req.researcherId, body.data.rationale, body.data.publicInterestStatement);
    if ('error' in result) {
      res.status(result.error === 'THESIS_NOT_FOUND' ? 404 : 409).json(result);
      return;
    }
    res.status(result.published ? 200 : 422).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to publish thesis', message });
  }
});

router.post('/:id/unpublish', requireResearcher, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  const body = z.object({ reason: z.string().min(1) }).safeParse(req.body ?? {});
  if (!id || !body.success || !req.researcherId) {
    res.status(400).json({ error: 'Invalid request: reason is required' });
    return;
  }
  try {
    const result = await unpublishThesis(id, req.researcherId, body.data.reason);
    if ('error' in result) {
      res.status(result.error === 'THESIS_NOT_FOUND' ? 404 : 409).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to unpublish thesis', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/thesis/:id/provenance  [RESEARCHER ONLY]
//
// How this thesis came to say what it says: every session attached to it, with
// its events in order — the framing question, each proposed framing and the
// adversary's reply, the moment a thesis was attached, the versions and
// analyses, the publication rationale and its assessment.
//
// Researcher-only, and not merely by convention. This view concentrates
// rejected framings, recorded dissent, and an adversary's objections about
// named living officials — deliberation the platform deliberately does not
// publish. COMPLIANCE.md and docs/defamation-risk.md rank AI-generated text
// about named individuals as the top risk surface, and this is a feed of
// exactly that. It is also the most interesting page on the site, which is
// precisely why someone will eventually argue for opening it.
//
// 404 rather than 403 for an unknown thesis, matching the rest of this router.
// ---------------------------------------------------------------------------
router.get('/:id/provenance', requireResearcher, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  try {
    const provenance = await getThesisProvenance(id);
    if ('error' in provenance) {
      res.status(404).json(provenance);
      return;
    }
    res.status(200).json(provenance);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load thesis provenance', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/provenance/repair  [RESEARCHER ONLY]
//
// Attach a framing session to a thesis created without one.
//
// The repair path for theses already on the wrong side of the fix: deriving the
// link at creation (services/thesisFraming.ts, linkThesisToFraming) closes the
// hole going forward and reaches nothing already created — the flip-keyed-fix
// mistake this codebase has been bitten by three times.
//
// Deliberately NOT an MCP tool: the provenance page is where a missing link is
// noticed, so the repair belongs on the same surface. It refuses to move a
// session already bound to a different thesis, and refuses a thesis that
// already has one — a repair able to overwrite an existing link is not a
// repair, it is a way to rewrite provenance.
// ---------------------------------------------------------------------------
router.post('/:id/provenance/repair', requireResearcher, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  const body = z.object({ sessionId: z.string().min(1) }).safeParse(req.body ?? {});
  if (!id || !body.success) {
    res.status(400).json({ error: 'Invalid request: sessionId is required' });
    return;
  }
  try {
    const result = await repairFramingLink(body.data.sessionId, id);
    if (!result.repaired) {
      const status =
        result.reason === 'SESSION_NOT_FOUND' || result.reason === 'THESIS_NOT_FOUND' ? 404 : 409;
      res.status(status).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to repair framing link', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/analyze
//
// Triggers Devil's Advocate AI analysis for the head version of a thesis that
// is stuck in PENDING_AI (e.g. MCP-created drafts where analysis is not
// triggered automatically). Returns 202 immediately; analysis runs async.
// If the head version is already COMPLETE, returns 200 with no-op message.
// ---------------------------------------------------------------------------

router.post('/:id/analyze', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id },
      include: { headVersion: true },
    });

    if (!thesis?.headVersion) {
      res.status(404).json({ error: 'Thesis or head version not found' });
      return;
    }

    if (thesis.headVersion.status === 'COMPLETE') {
      res.status(200).json({ message: 'Already analyzed', status: 'COMPLETE' });
      return;
    }

    void triggerAIAnalysis(thesis.headVersion.id, thesis.headVersion.userContent);
    res.status(202).json({ message: 'AI analysis started', versionId: thesis.headVersion.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to trigger analysis', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/suggest-revision
//
// Runs the RevisionAgent on the current head version:
//   1. Parses the existing AI critique (must be COMPLETE)
//   2. Finds CONFIRMED evidence not yet cited in the thesis
//   3. Calls RevisionAgent → returns revised Markdown + hashes to include
//   4. Converts revised Markdown to a TipTap doc via buildTipTapDoc
//   5. Returns { suggestedContent, revisionsExplained, newEvidenceCount }
//      — does NOT save; the client sends a POST /version to accept
// ---------------------------------------------------------------------------

router.post('/:id/suggest-revision', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id },
      include: { headVersion: { include: { mentions: true } } },
    });

    if (!thesis?.headVersion) {
      res.status(404).json({ error: 'Thesis or head version not found' });
      return;
    }

    const hv = thesis.headVersion;

    if (hv.status !== 'COMPLETE' || hv.aiAnalysis === null) {
      res.status(400).json({
        error: 'Thesis must have a completed AI analysis before suggesting a revision. ' +
          'Run POST /:id/analyze first.',
      });
      return;
    }

    const critique = DevilsAdvocateOutputSchema.safeParse(hv.aiAnalysis);
    if (!critique.success) {
      res.status(500).json({ error: 'AI analysis could not be parsed — schema mismatch.' });
      return;
    }

    // Find CONFIRMED evidence not yet cited in this version
    const citedHashes = new Set(
      hv.mentions.filter((m) => m.type === 'EVIDENCE').map((m) => m.refId),
    );

    const allConfirmed = await prisma.evidence.findMany({
      where: { status: 'CONFIRMED', fileHash: { notIn: Array.from(citedHashes) } },
      select: {
        fileHash: true,
        summary: true,
        investigativeCategories: true,
        evidenceTier: true,
        evidenceRole: true,
        evidenceDate: true,
        targetEntity: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10, // cap to avoid bloating the prompt
    });

    // Extract current thesis plain text for the agent
    const currentText = extractText(hv.userContent);

    // Run RevisionAgent
    const revision = await getRevisionAgent().revise(currentText, critique.data, allConfirmed);

    // Build label map for any newly cited evidence
    const newlyIncluded = allConfirmed.filter((e) =>
      revision.evidenceHashesToInclude.includes(e.fileHash),
    );
    const evidenceLabelMap = new Map(newlyIncluded.map((e) => [e.fileHash, e.summary.slice(0, 40)]));

    // Preserve key figures from the current version
    const currentFigures = hv.mentions
      .filter((m) => m.type === 'KEY_FIGURE')
      .map((m) => m.refId);

    // And the cited trajectories. The revision agent rewrites prose and returns
    // evidence hashes; it says nothing about trajectories, so anything not
    // carried across here would be silently dropped by accepting a revision —
    // and the trajectory citations are the deterministic ones.
    const currentTrajectoryIds = hv.mentions
      .filter((m) => m.type === 'CLAIM_TRAJECTORY')
      .map((m) => m.refId);
    const trajectoryLabels = await loadTrajectoryCitationLabels(currentTrajectoryIds);

    // All evidence to include: original cited + newly added
    const allHashes = [...Array.from(citedHashes), ...revision.evidenceHashesToInclude];

    // Enrich label map with already-cited evidence summaries
    const existingEvidence = citedHashes.size > 0
      ? await prisma.evidence.findMany({
          where: { fileHash: { in: Array.from(citedHashes) } },
          select: { fileHash: true, summary: true },
        })
      : [];
    for (const e of existingEvidence) {
      evidenceLabelMap.set(e.fileHash, e.summary.slice(0, 40));
    }

    const suggestedContent = buildTipTapDoc(
      revision.revisedBody,
      allHashes,
      currentFigures,
      evidenceLabelMap,
      undefined,
      { ids: currentTrajectoryIds, labels: trajectoryLabels.labels },
    );

    res.status(200).json({
      suggestedContent,
      revisionsExplained: revision.revisionsExplained,
      newEvidenceCount: revision.evidenceHashesToInclude.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to suggest revision', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/version
//
// Creates a new ThesisVersion (wiki edit). The previous head becomes the
// parentVersionId; the new version immediately becomes the head (latest-wins).
// Mention extraction is synchronous; AI analysis fires in the background.
// ---------------------------------------------------------------------------

router.post('/:id/version', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const thesisId = String(req.params['id'] ?? '');
  if (!thesisId) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  const parsed = CreateThesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { userContent } = parsed.data;

  let mentions: ReturnType<typeof parseMentions>;
  try {
    mentions = parseMentions(userContent);
  } catch {
    res.status(400).json({ error: 'userContent is not a valid TipTap document' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    const contentHash = sha256(userContent);
    const parentVersionId = thesis.headVersionId;

    const { version, updatedThesis } = await prisma.$transaction(async (tx) => {
      const version = await tx.thesisVersion.create({
        data: {
          thesisId,
          parentVersionId,
          userContent: userContent as Prisma.InputJsonValue,
          contentHash,
          status: 'PENDING_AI',
          mentions: {
            createMany: { data: mentions.map((m) => ({ type: m.type, refId: m.refId })) },
          },
        },
      });

      const updatedThesis = await tx.thesis.update({
        where: { id: thesisId },
        data: { headVersionId: version.id },
      });

      return { version, updatedThesis };
    });

    res.status(201).json({
      thesis: {
        id: updatedThesis.id,
        headVersion: {
          id: version.id,
          parentVersionId: version.parentVersionId,
          status: version.status,
          contentHash: version.contentHash,
          preview: extractPreview(userContent),
          createdAt: version.createdAt,
        },
      },
    });

    void triggerAIAnalysis(version.id, userContent);
    void logSessionEvent(thesisId, 'VERSION_CREATED', `New version created: ${extractPreview(userContent)}`, version.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to create version', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/thesis/:id/versions
//
// Returns all versions for a thesis, ordered oldest-first, with the head and
// published versions flagged. Does not include full userContent — use GET /:id
// for that. Researcher-only: the public sees the published version and only
// that, never the drafts around it.
// ---------------------------------------------------------------------------

router.get('/:id/versions', requireResearcher, async (req: Request, res: Response): Promise<void> => {
  const thesisId = String(req.params['id'] ?? '');
  if (!thesisId) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    const versions = await prisma.thesisVersion.findMany({
      where: { thesisId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        parentVersionId: true,
        status: true,
        contentHash: true,
        userContent: true,
        createdAt: true,
        createdBy: { select: { handle: true } },
        _count: { select: { mentions: true } },
      },
    });

    res.status(200).json({
      thesisId,
      headVersionId: thesis.headVersionId,
      publishedVersionId: thesis.publishedVersionId,
      versions: versions.map((v) => ({
        id: v.id,
        parentVersionId: v.parentVersionId,
        status: v.status,
        contentHash: v.contentHash,
        userContent: v.userContent,
        preview: extractPreview(v.userContent),
        mentionCount: v._count.mentions,
        isHead: v.id === thesis.headVersionId,
        isPublished: v.id === thesis.publishedVersionId,
        createdAt: v.createdAt,
        createdByHandle: v.createdBy?.handle ?? null,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch version history', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/thesis/:id/versions/:versionId
//
// Returns a single historical version with full userContent, aiAnalysis, and
// mentions — same shape as GET /api/thesis/:id so the frontend can render it
// identically. Also returns versionNumber (1-based) and isHead flag.
// Researcher-only, as /versions is.
// ---------------------------------------------------------------------------

router.get('/:id/versions/:versionId', requireResearcher, async (req: Request, res: Response): Promise<void> => {
  const thesisId = String(req.params['id'] ?? '');
  const versionId = String(req.params['versionId'] ?? '');
  if (!thesisId || !versionId) {
    res.status(400).json({ error: 'Missing thesis id or version id' });
    return;
  }

  try {
    const [thesis, version] = await Promise.all([
      prisma.thesis.findUnique({
        where: { id: thesisId },
        include: { publishedBy: { select: { handle: true } }, versions: { select: { id: true, createdAt: true } } },
      }),
      prisma.thesisVersion.findUnique({
        where: { id: versionId },
        include: { mentions: true },
      }),
    ]);

    if (!thesis || !version || version.thesisId !== thesisId) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }

    const olderCount = await prisma.thesisVersion.count({
      where: { thesisId, createdAt: { lt: version.createdAt } },
    });

    const evidenceRefIds = version.mentions
      .filter((m) => m.type === 'EVIDENCE')
      .map((m) => m.refId);

    const evidenceMap = await buildEvidenceMap(evidenceRefIds);
    const trajectoryMap = await buildTrajectoryMap(version.mentions);

    res.status(200).json({
      thesis: {
        id: thesis.id,
        title: thesis.title,
        createdAt: thesis.createdAt,
        viewer: 'RESEARCHER' satisfies Viewer,
        publication: publicationState(thesis, thesis.versions),
        publicInterestStatement: thesis.publicInterestStatement,
        version,
      },
      evidenceMap,
      trajectoryMap,
      versionNumber: olderCount + 1,
      isHead: thesis.headVersionId === versionId,
      isPublished: thesis.publishedVersionId === versionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch version', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/gaps/:gapIndex/resolve
//
// Marks an AI-identified evidence gap as resolved by a specific evidence record.
// Uses upsert — calling again with a different evidenceId replaces the resolution.
// ---------------------------------------------------------------------------

router.post('/:id/gaps/:gapIndex/resolve', async (req: Request, res: Response): Promise<void> => {
  const thesisId = String(req.params['id'] ?? '');
  const gapIndex = parseInt(String(req.params['gapIndex'] ?? ''), 10);
  if (!thesisId || isNaN(gapIndex) || gapIndex < 0) {
    res.status(400).json({ error: 'Missing or invalid thesis id / gapIndex' });
    return;
  }

  const parsed = ResolveGapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { evidenceId } = parsed.data;

  try {
    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis?.headVersionId) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    const evidence = await prisma.evidence.findUnique({ where: { fileHash: evidenceId } });
    if (!evidence) {
      res.status(404).json({ error: 'Evidence not found' });
      return;
    }

    const resolution = await prisma.thesisGapResolution.upsert({
      where: { thesisVersionId_gapIndex: { thesisVersionId: thesis.headVersionId, gapIndex } },
      create: { thesisVersionId: thesis.headVersionId, gapIndex, evidenceId },
      update: { evidenceId },
    });

    void logSessionEvent(
      thesisId,
      'GAP_RESOLVED',
      `Gap #${gapIndex + 1} resolved by evidence ${evidenceId.slice(0, 16)}…`,
      resolution.id,
    );
    res.status(200).json({ resolution });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to resolve gap', message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/thesis/:id/gaps/:gapIndex/resolve
//
// Removes a gap resolution, marking the gap as unresolved again.
// ---------------------------------------------------------------------------

router.delete('/:id/gaps/:gapIndex/resolve', async (req: Request, res: Response): Promise<void> => {
  const thesisId = String(req.params['id'] ?? '');
  const gapIndex = parseInt(String(req.params['gapIndex'] ?? ''), 10);
  if (!thesisId || isNaN(gapIndex) || gapIndex < 0) {
    res.status(400).json({ error: 'Missing or invalid thesis id / gapIndex' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis?.headVersionId) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    await prisma.thesisGapResolution.deleteMany({
      where: { thesisVersionId: thesis.headVersionId, gapIndex },
    });

    res.status(204).end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to unresolve gap', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/suggest
//
// REST wrapper around the suggest_thesis MCP tool — searches the evidence vault
// semantically and proposes the strongest defensible thesis the corpus supports.
// Returns a readyForDraft payload that can be passed directly to POST /draft.
// ---------------------------------------------------------------------------

const SuggestThesisSchema = z.object({
  topic: z.string().min(1),
  maxEvidence: z.number().int().min(1).max(20).optional(),
});

router.post('/suggest', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = SuggestThesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  try {
    const json = await suggestThesisHandler(parsed.data);
    const result = JSON.parse(json) as Record<string, unknown>;
    if (result['error']) {
      res.status(400).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to generate thesis suggestion', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/draft
//
// REST wrapper around the create_thesis_draft MCP tool — accepts a structured
// thesis payload and saves it as PENDING_AI. Returns { thesisId, headVersionId }.
// ---------------------------------------------------------------------------

const DraftThesisSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  evidenceHashes: z.array(z.string()).optional(),
  keyFigures: z.array(z.string()).optional(),
  citations: z
    .array(z.object({ id: z.number().int().positive(), fileHashes: z.array(z.string()).min(1) }))
    .optional(),
});

router.post('/draft', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = DraftThesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  try {
    const json = await createThesisDraftHandler(parsed.data);
    const result = JSON.parse(json) as Record<string, unknown>;
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to create thesis draft', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/foia-request
//
// Generates an Israeli Freedom of Information request letter for the gap at
// gapIndex in the thesis's head version AI analysis. The LLM infers the
// target ministry and drafts a formal Hebrew letter with numbered requests.
// Requires the head version to have a completed Devil's Advocate analysis.
// ---------------------------------------------------------------------------

const FoiaRequestSchema = z.object({
  gapIndex: z.number().int().min(0),
});

router.post('/:id/foia-request', aiCostLimiter, async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  const parsed = FoiaRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { gapIndex } = parsed.data;

  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id },
      include: { headVersion: true },
    });

    if (!thesis?.headVersion) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    const hv = thesis.headVersion;

    if (hv.status !== 'COMPLETE' || hv.aiAnalysis === null) {
      res.status(400).json({
        error:
          'Thesis must have a completed AI analysis before generating a FOIA request. ' +
          'Run POST /:id/analyze first.',
      });
      return;
    }

    const critique = DevilsAdvocateOutputSchema.safeParse(hv.aiAnalysis);
    if (!critique.success) {
      res.status(500).json({ error: 'AI analysis could not be parsed — schema mismatch.' });
      return;
    }

    const { evidenceGaps } = critique.data;

    if (gapIndex < 0 || gapIndex >= evidenceGaps.length) {
      res.status(400).json({
        error: `gapIndex ${gapIndex} is out of range — thesis has ${evidenceGaps.length} gap(s).`,
      });
      return;
    }

    const gap = evidenceGaps[gapIndex];
    if (!gap) {
      res.status(400).json({ error: `Gap at index ${gapIndex} not found.` });
      return;
    }

    const thesisTitle =
      thesis.title?.trim() ||
      extractText(hv.userContent).split('\n').find((l) => l.trim().length > 0) ||
      `Thesis ${id.slice(0, 8)}`;

    const letter = await getFoiaAgent().generate({
      thesisTitle,
      gapDescription: gap.description,
      suggestedSearch: gap.suggestedSearch,
    });

    res.status(200).json({
      letterText: letter.letterText,
      targetMinistry: letter.targetMinistry,
      legalBasis: letter.legalBasis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to generate FOIA request', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/gaps/:gapIndex/whistleblower/preview  (analyse only, no store)
// POST /api/thesis/:id/gaps/:gapIndex/whistleblower          (store, using cached analysis)
//
// Two-phase WB flow:
//   Preview: decrypt in RAM → Claude vision → return analysis + previewToken (10-min TTL)
//   Confirm: re-send ciphertext → use cached analysis → upload to IPFS → save to DB
// No identity is stored. No file ever reaches disk unencrypted.
// ---------------------------------------------------------------------------

const EphemeralFileSchema = z.object({
  ciphertext: z.string().min(1),
  aesKey: z.record(z.string(), z.unknown()),
  filename: z.string().max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf', 'image/heic', 'image/heif']),
});

const WhistleblowerBodySchema = z.object({
  files: z.array(EphemeralFileSchema).min(1).max(10),
  previewToken: z.string().uuid().optional(),
});

// In-memory cache: previewToken → per-filename analysis (10 min TTL)
interface CachedPreview {
  analyses: Map<string, Awaited<ReturnType<typeof analyzeEphemeral>>['analysis']>;
  expiresAt: number;
}
const previewCache = new Map<string, CachedPreview>();

function evictExpiredPreviews() {
  const now = Date.now();
  for (const [token, entry] of previewCache) {
    if (entry.expiresAt < now) previewCache.delete(token);
  }
}

router.post(
  '/:id/gaps/:gapIndex/whistleblower/preview',
  aiCostLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const thesisId = String(req.params['id'] ?? '');
    const gapIndex = parseInt(String(req.params['gapIndex'] ?? ''), 10);
    if (!thesisId || isNaN(gapIndex) || gapIndex < 0) {
      res.status(400).json({ error: 'Missing or invalid thesis id / gapIndex' });
      return;
    }

    const parsed = WhistleblowerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
      return;
    }

    try {
      const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
      if (!thesis) { res.status(404).json({ error: 'Thesis not found' }); return; }

      const previews = await Promise.all(
        parsed.data.files.map(async (file) => {
          const { analysis } = await analyzeEphemeral({
            ciphertext: file.ciphertext,
            aesKey: file.aesKey,
            filename: file.filename,
            mimeType: file.mimeType,
          });
          return { filename: file.filename, analysis };
        }),
      );

      evictExpiredPreviews();
      const token = crypto.randomUUID();
      const analysesMap = new Map(previews.map((p) => [p.filename, p.analysis]));
      previewCache.set(token, { analyses: analysesMap, expiresAt: Date.now() + 10 * 60 * 1000 });

      res.status(200).json({
        previews: previews.map(({ filename, analysis }) => ({
          filename,
          summary: analysis.summary,
          evidenceDate: analysis.evidenceDate,
          keyFigures: analysis.keyFigures,
          evidenceTier: analysis.evidenceTier,
          evidenceRole: analysis.evidenceRole,
          isRelevant: analysis.isRelevant,
        })),
        previewToken: token,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'Failed to analyse documents', message });
    }
  },
);

router.post(
  '/:id/gaps/:gapIndex/whistleblower',
  aiCostLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const thesisId = String(req.params['id'] ?? '');
    const gapIndex = parseInt(String(req.params['gapIndex'] ?? ''), 10);
    if (!thesisId || isNaN(gapIndex) || gapIndex < 0) {
      res.status(400).json({ error: 'Missing or invalid thesis id / gapIndex' });
      return;
    }

    const parsed = WhistleblowerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
      return;
    }

    try {
      const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
      if (!thesis) {
        res.status(404).json({ error: 'Thesis not found' });
        return;
      }

      const cached = parsed.data.previewToken ? previewCache.get(parsed.data.previewToken) : undefined;
      if (cached) previewCache.delete(parsed.data.previewToken!);

      const submissions = await Promise.all(
        parsed.data.files.map(async (file) => {
          const cachedAnalysis = cached?.analyses.get(file.filename);
          let analysis: Awaited<ReturnType<typeof analyzeEphemeral>>['analysis'];
          let ipfsCid: string | null;
          let fileUrl: string | null;

          if (cachedAnalysis) {
            analysis = cachedAnalysis;
            ({ ipfsCid, fileUrl } = await storeEphemeral({ ciphertext: file.ciphertext, filename: file.filename }));
          } else {
            ({ analysis, ipfsCid, fileUrl } = await analyzeEphemeral({
              ciphertext: file.ciphertext,
              aesKey: file.aesKey,
              filename: file.filename,
              mimeType: file.mimeType,
            }));
          }

          const fileHash = Web3Service.hashFile(Buffer.from(file.ciphertext, 'base64'));

          await upsertKeyFigures(analysis.keyFigures);

          const existing = await prisma.evidence.findUnique({ where: { fileHash } });
          if (existing) {
            return {
              evidenceId: existing.id,
              filename: file.filename,
              summary: existing.summary,
              duplicate: true,
              ipfsCid: existing.ipfsCid ?? null,
            };
          }

          const record = await prisma.evidence.create({
            data: {
              fileHash,
              status: 'PENDING_REVIEW',
              ...buildEvidenceAnalysisData(analysis),
              figures: { connect: analysis.keyFigures.map((name) => ({ name })) },
              sourceUrl: `whistleblower/thesis/${thesisId}/gap/${gapIndex}`,
              fileUrl: fileUrl ?? undefined,
              ipfsCid: ipfsCid ?? undefined,
            },
          });

          return {
            evidenceId: record.id,
            filename: file.filename,
            summary: record.summary,
            duplicate: false,
            ipfsCid: record.ipfsCid ?? null,
          };
        }),
      );

      res.status(201).json({
        submissions,
        count: submissions.length,
        message:
          `${submissions.length} encrypted document(s) received as PENDING_REVIEW. ` +
          'Plaintext was analyzed ephemerally and discarded. ' +
          'Records will not appear publicly until a human reviewer promotes them.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: 'Failed to process whistleblower submission', message });
    }
  },
);

export { router as thesisRouter };
