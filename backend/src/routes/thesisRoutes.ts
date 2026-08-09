import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { parseMentions } from '../utils/parseMentions';
import { DevilsAdvocateOutputSchema } from '../services/DevilsAdvocateAgent';
import { RevisionAgent } from '../services/RevisionAgent';
import { buildTipTapDoc } from '../utils/tipTapUtils';
import { sha256, extractText, extractPreview, triggerAIAnalysis } from '../services/thesisAnalysis';

const router = Router();

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _revisionAgent: RevisionAgent | null = null;

function getRevisionAgent(): RevisionAgent {
  if (!_revisionAgent) _revisionAgent = new RevisionAgent();
  return _revisionAgent;
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
            createdAt: true,
            _count: { select: { mentions: true } },
          },
        },
      },
    });

    res.status(200).json({
      theses: theses.map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        headVersion: t.headVersion
          ? {
              id: t.headVersion.id,
              status: t.headVersion.status,
              contentHash: t.headVersion.contentHash,
              preview: extractPreview(t.headVersion.userContent),
              mentionCount: t.headVersion._count.mentions,
              createdAt: t.headVersion.createdAt,
            }
          : null,
      })),
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
          select: { fileHash: true, summary: true, category: true, evidenceTier: true },
        })
      : [];

    const evidenceMap = Object.fromEntries(
      evidenceRecords.map((e) => [e.fileHash, { summary: e.summary, category: e.category, evidenceTier: e.evidenceTier }]),
    );

    res.status(200).json({ thesis, evidenceMap });
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
          select: { fileHash: true, summary: true, category: true, evidenceTier: true },
        })
      : [];

    const evidenceMap = Object.fromEntries(
      evidenceRecords.map((e) => [e.fileHash, { summary: e.summary, category: e.category, evidenceTier: e.evidenceTier }]),
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

export { router as thesisRouter };
