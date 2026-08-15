import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
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

router.post('/', async (req: Request, res: Response): Promise<void> => {
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

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { evidence } = ListThesesSchema.parse(req.query ?? {});

  const where = evidence
    ? { headVersion: { mentions: { some: { type: 'EVIDENCE' as const, refId: evidence } } } }
    : undefined;

  try {
    const theses = await prisma.thesis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        headVersion: {
          select: {
            id: true,
            status: true,
            contentHash: true,
            userContent: true,
            aiAnalysis: true,
            createdAt: true,
            _count: { select: { mentions: true } },
          },
        },
      },
    });

    res.status(200).json({
      theses: theses.map((t) => {
        const analysis = t.headVersion?.aiAnalysis as {
          evidenceGaps?: unknown[];
          overallStrengthAssessment?: string;
        } | null;
        return {
          id: t.id,
          title: t.title ?? null,
          createdAt: t.createdAt,
          openGapCount: analysis?.evidenceGaps?.length ?? 0,
          headVersion: t.headVersion
            ? {
                id: t.headVersion.id,
                status: t.headVersion.status,
                contentHash: t.headVersion.contentHash,
                preview: extractPreview(t.headVersion.userContent),
                mentionCount: t.headVersion._count.mentions,
                strength: analysis?.overallStrengthAssessment ?? null,
                createdAt: t.headVersion.createdAt,
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
// Returns a single thesis with its full head version content and AI analysis.
// ---------------------------------------------------------------------------

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id },
      include: {
        headVersion: {
          include: {
            mentions: true,
            gapResolutions: {
              include: { evidence: { select: { summary: true, category: true, evidenceTier: true } } },
              orderBy: { gapIndex: 'asc' },
            },
          },
        },
      },
    });

    if (!thesis) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    // Enrich with evidence summaries so the UI can show readable labels on mention chips
    const evidenceRefIds = (thesis.headVersion?.mentions ?? [])
      .filter((m) => m.type === 'EVIDENCE')
      .map((m) => m.refId);

    const evidenceRecords = evidenceRefIds.length > 0
      ? await prisma.evidence.findMany({
          where: { fileHash: { in: evidenceRefIds } },
          select: {
            id: true,
            fileHash: true,
            summary: true,
            category: true,
            evidenceTier: true,
            evidenceType: true,
            urlVersionDiff: { select: { trackedUrlId: true } },
          },
        })
      : [];

    const evidenceMap = Object.fromEntries(
      evidenceRecords.map((e) => [
        e.fileHash,
        {
          evidenceId: e.id,
          summary: e.summary,
          category: e.category,
          evidenceTier: e.evidenceTier,
          evidenceType: e.evidenceType,
          trackedUrlId: e.urlVersionDiff?.trackedUrlId ?? null,
        },
      ]),
    );

    const gapResolutions = (thesis.headVersion?.gapResolutions ?? []).map((r) => ({
      gapIndex: r.gapIndex,
      evidenceId: r.evidenceId,
      evidence: r.evidence,
      createdAt: r.createdAt,
    }));

    res.status(200).json({ thesis, evidenceMap, gapResolutions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch thesis', message });
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

router.post('/:id/analyze', async (req: Request, res: Response): Promise<void> => {
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

router.post('/:id/suggest-revision', async (req: Request, res: Response): Promise<void> => {
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
        category: true,
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

router.post('/:id/version', async (req: Request, res: Response): Promise<void> => {
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
// Returns all versions for a thesis, ordered oldest-first, with the head
// version flagged. Does not include full userContent — use GET /:id for that.
// ---------------------------------------------------------------------------

router.get('/:id/versions', async (req: Request, res: Response): Promise<void> => {
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
      versions: versions.map((v) => ({
        id: v.id,
        parentVersionId: v.parentVersionId,
        status: v.status,
        contentHash: v.contentHash,
        userContent: v.userContent,
        preview: extractPreview(v.userContent),
        mentionCount: v._count.mentions,
        isHead: v.id === thesis.headVersionId,
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
// ---------------------------------------------------------------------------

router.get('/:id/versions/:versionId', async (req: Request, res: Response): Promise<void> => {
  const thesisId = String(req.params['id'] ?? '');
  const versionId = String(req.params['versionId'] ?? '');
  if (!thesisId || !versionId) {
    res.status(400).json({ error: 'Missing thesis id or version id' });
    return;
  }

  try {
    const [thesis, version] = await Promise.all([
      prisma.thesis.findUnique({ where: { id: thesisId } }),
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

    const evidenceRecords = evidenceRefIds.length > 0
      ? await prisma.evidence.findMany({
          where: { fileHash: { in: evidenceRefIds } },
          select: {
            id: true,
            fileHash: true,
            summary: true,
            category: true,
            evidenceTier: true,
            evidenceType: true,
            urlVersionDiff: { select: { trackedUrlId: true } },
          },
        })
      : [];

    const evidenceMap = Object.fromEntries(
      evidenceRecords.map((e) => [
        e.fileHash,
        {
          evidenceId: e.id,
          summary: e.summary,
          category: e.category,
          evidenceTier: e.evidenceTier,
          evidenceType: e.evidenceType,
          trackedUrlId: e.urlVersionDiff?.trackedUrlId ?? null,
        },
      ]),
    );

    res.status(200).json({
      thesis: {
        id: thesis.id,
        headVersionId: thesis.headVersionId,
        createdAt: thesis.createdAt,
        headVersion: version,
      },
      evidenceMap,
      versionNumber: olderCount + 1,
      isHead: thesis.headVersionId === versionId,
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

router.post('/suggest', async (req: Request, res: Response): Promise<void> => {
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
});

router.post('/draft', async (req: Request, res: Response): Promise<void> => {
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

router.post('/:id/foia-request', async (req: Request, res: Response): Promise<void> => {
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
          category: analysis.category,
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

          if (analysis.keyFigures.length > 0) {
            await prisma.keyFigure.createMany({
              data: analysis.keyFigures.map((name) => ({ name })),
              skipDuplicates: true,
            });
          }

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
              evidenceRole: analysis.evidenceRole,
              category: analysis.category,
              targetEntity: analysis.targetEntity,
              evidenceTier: analysis.evidenceTier,
              evidencePerspective: analysis.evidencePerspective ?? null,
              tierReasoning: analysis.tierReasoning ?? null,
              summary: analysis.summary,
              evidenceDate: analysis.evidenceDate,
              figures: { connect: analysis.keyFigures.map((name) => ({ name })) },
              medicalConditions: JSON.stringify(analysis.medicalConditions),
              statisticalClaims: JSON.stringify(analysis.statisticalClaims),
              regulatoryMentions: JSON.stringify(analysis.regulatoryMentions),
              euaOmissionStatus: analysis.euaOmissionStatus,
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
