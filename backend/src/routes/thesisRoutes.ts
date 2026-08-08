import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { parseMentions } from '../utils/parseMentions';
import { DevilsAdvocateAgent, type ReferencedEvidence } from '../services/DevilsAdvocateAgent';

const router = Router();

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _agent: DevilsAdvocateAgent | null = null;

function getAgent(): DevilsAdvocateAgent {
  if (!_agent) _agent = new DevilsAdvocateAgent();
  return _agent;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Walk a TipTap document JSON and extract plain text, resolving mention nodes
 * to human-readable tokens (e.g. @Netanyahu, #ev_abc123).
 */
function extractText(doc: unknown): string {
  function walk(node: Record<string, unknown>): string {
    if (node.type === 'text') return String(node.text ?? '');
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (node.type === 'keyFigureMention') return `@${String(attrs?.['id'] ?? '')}`;
    if (node.type === 'evidenceMention') return `#ev_${String(attrs?.['id'] ?? '')}`;
    if (node.type === 'trackedUrlMention') return `#url_${String(attrs?.['id'] ?? '')}`;
    const content = node.content;
    if (!Array.isArray(content)) return '';
    return (content as unknown[]).map((c) => walk(c as Record<string, unknown>)).join(' ');
  }
  return walk(doc as Record<string, unknown>)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPreview(doc: unknown): string {
  return extractText(doc).slice(0, 120);
}

// ---------------------------------------------------------------------------
// Async AI trigger — fire-and-forget from POST routes
// ---------------------------------------------------------------------------

async function triggerAIAnalysis(versionId: string, userContent: unknown): Promise<void> {
  try {
    const version = await prisma.thesisVersion.findUnique({
      where: { id: versionId },
      include: { mentions: { where: { type: 'EVIDENCE' } } },
    });
    if (!version) return;

    const evidenceRecords = await prisma.evidence.findMany({
      where: { fileHash: { in: version.mentions.map((m) => m.refId) } },
      select: {
        fileHash: true,
        category: true,
        targetEntity: true,
        evidenceTier: true,
        evidenceRole: true,
        evidenceDate: true,
        summary: true,
      },
    });

    const referenced: ReferencedEvidence[] = evidenceRecords;
    const thesisText = extractText(userContent);
    const aiAnalysis = await getAgent().analyze(thesisText, referenced);
    const contentHash = sha256({ userContent, aiAnalysis });

    await prisma.thesisVersion.update({
      where: { id: versionId },
      data: { aiAnalysis, contentHash, status: 'COMPLETE' },
    });
  } catch (err) {
    console.error('[thesis] AI analysis failed for version', versionId, err);
  }
}

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
          select: { fileHash: true, summary: true, category: true },
        })
      : [];

    const evidenceMap = Object.fromEntries(
      evidenceRecords.map((e) => [e.fileHash, { summary: e.summary, category: e.category }]),
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

export { router as thesisRouter };
