import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ThesisValidatorAgent } from '../services/ThesisValidatorAgent';
import type { EvidenceSummary } from '../services/ThesisValidatorAgent';
import type { FalsificationResult } from '../services/ThesisValidatorAgent';

const router = Router();

// ---------------------------------------------------------------------------
// Rate limit — max evaluations per thesis (in-memory guard, UX protection)
// ---------------------------------------------------------------------------

const EVALUATE_LIMIT = 5;
const _evaluationCounts = new Map<string, number>();

export function getEvaluationCount(thesisId: string): number {
  return _evaluationCounts.get(thesisId) ?? 0;
}

export function incrementEvaluationCount(thesisId: string): number {
  const next = getEvaluationCount(thesisId) + 1;
  _evaluationCounts.set(thesisId, next);
  return next;
}

// ---------------------------------------------------------------------------
// Lazy singleton
// ---------------------------------------------------------------------------

let _validator: ThesisValidatorAgent | null = null;

function getValidator(): ThesisValidatorAgent {
  if (!_validator) _validator = new ThesisValidatorAgent();
  return _validator;
}

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const CreateThesisSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300),
  content: z.string().min(1, 'Content is required'),
  taggedEvidenceIds: z.array(z.string()).default([]),
  taggedFigureIds: z.array(z.string()).default([]),
});

export const UpdateThesisSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).optional(),
  taggedEvidenceIds: z.array(z.string()).optional(),
  taggedFigureIds: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/thesis
//
// Create a new thesis draft.
// ---------------------------------------------------------------------------

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateThesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { title, content, taggedEvidenceIds, taggedFigureIds } = parsed.data;

  try {
    const thesis = await prisma.thesis.create({
      data: {
        title,
        content,
        taggedEvidence: { connect: taggedEvidenceIds.map((id) => ({ id })) },
        taggedFigures: { connect: taggedFigureIds.map((id) => ({ id })) },
      },
      include: {
        taggedEvidence: { select: { id: true, summary: true, category: true } },
        taggedFigures: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ thesis });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to create thesis', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/thesis
//
// List all PUBLISHED theses for the public feed.
// ---------------------------------------------------------------------------

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const theses = await prisma.thesis.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        createdAt: true,
        taggedFigures: { select: { id: true, name: true } },
        _count: { select: { taggedEvidence: true } },
      },
    });

    res.status(200).json({
      theses: theses.map((t) => ({
        id: t.id,
        title: t.title,
        publishedAt: t.publishedAt,
        createdAt: t.createdAt,
        taggedFigures: t.taggedFigures,
        evidenceCount: t._count.taggedEvidence,
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
// Get a single thesis with full content and tagged items.
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
        taggedEvidence: {
          select: { id: true, summary: true, category: true, evidenceDate: true },
        },
        taggedFigures: { select: { id: true, name: true } },
      },
    });

    if (!thesis) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    const aiFeedback = thesis.aiFeedback
      ? (JSON.parse(thesis.aiFeedback) as FalsificationResult)
      : null;

    res.status(200).json({ thesis: { ...thesis, aiFeedback } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch thesis', message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/thesis/:id
//
// Update a DRAFT thesis. Replaces M2M relations in full when provided.
// ---------------------------------------------------------------------------

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  const parsed = UpdateThesisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  try {
    const existing = await prisma.thesis.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(409).json({ error: 'Only DRAFT theses can be edited', status: existing.status });
      return;
    }

    const { title, content, taggedEvidenceIds, taggedFigureIds } = parsed.data;

    const thesis = await prisma.thesis.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(taggedEvidenceIds !== undefined && {
          taggedEvidence: { set: taggedEvidenceIds.map((eid) => ({ id: eid })) },
        }),
        ...(taggedFigureIds !== undefined && {
          taggedFigures: { set: taggedFigureIds.map((fid) => ({ id: fid })) },
        }),
      },
      include: {
        taggedEvidence: { select: { id: true, summary: true, category: true } },
        taggedFigures: { select: { id: true, name: true } },
      },
    });

    res.status(200).json({ thesis });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to update thesis', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/evaluate
//
// Runs the ThesisValidatorAgent (devil's advocate) against the thesis.
// Fetches full evidence metadata from Prisma — the agent receives real text,
// not just IDs. Saves the FalsificationResult to aiFeedback (JSON).
// Rate-limited: max 5 evaluations per thesis (in-memory guard).
// ---------------------------------------------------------------------------

router.post('/:id/evaluate', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id },
      include: {
        taggedEvidence: {
          select: {
            id: true,
            summary: true,
            category: true,
            evidenceDate: true,
            targetEntity: true,
            evidenceRole: true,
          },
        },
      },
    });

    if (!thesis) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    if (thesis.status === 'PUBLISHED' || thesis.status === 'PENDING_MODERATION') {
      res.status(409).json({
        error: 'Cannot evaluate a thesis that is already submitted or published',
        status: thesis.status,
      });
      return;
    }

    const count = getEvaluationCount(id);
    if (count >= EVALUATE_LIMIT) {
      res.status(429).json({
        error: 'Evaluation limit reached',
        message: `This thesis has already been evaluated ${EVALUATE_LIMIT} times. Revise and resubmit as a new draft if needed.`,
      });
      return;
    }

    const evidenceSummaries: EvidenceSummary[] = thesis.taggedEvidence.map((e) => ({
      id: e.id,
      summary: e.summary,
      category: e.category,
      evidenceDate: e.evidenceDate,
      targetEntity: e.targetEntity,
      evidenceRole: e.evidenceRole,
    }));

    const feedback = await getValidator().validate(thesis.content, evidenceSummaries);

    await prisma.thesis.update({
      where: { id },
      data: {
        aiFeedback: JSON.stringify(feedback),
        status: 'AI_REVIEWED',
      },
    });

    incrementEvaluationCount(id);

    res.status(200).json({ feedback });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[thesis/evaluate] Error:', err instanceof Error ? err.stack : err);
    res.status(500).json({ error: 'Evaluation failed', message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/thesis/:id/submit
//
// Moves an AI_REVIEWED thesis to PENDING_MODERATION.
// Requires at least one tagged evidence item — unanchored theses cannot be
// submitted for publication.
// ---------------------------------------------------------------------------

router.post('/:id/submit', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id },
      include: { _count: { select: { taggedEvidence: true } } },
    });

    if (!thesis) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    if (thesis.status !== 'AI_REVIEWED') {
      res.status(409).json({
        error: 'Only AI_REVIEWED theses can be submitted for moderation',
        status: thesis.status,
      });
      return;
    }

    if (thesis._count.taggedEvidence === 0) {
      res.status(422).json({
        error: 'Cannot submit a thesis with no tagged evidence',
      });
      return;
    }

    const updated = await prisma.thesis.update({
      where: { id },
      data: { status: 'PENDING_MODERATION' },
      select: { id: true, status: true },
    });

    res.status(200).json({ submitted: true, thesis: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to submit thesis', message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/thesis/:id
//
// Deletes a DRAFT or REJECTED thesis. Published / pending theses are
// protected — contact a moderator to retract.
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params['id'] ?? '');
  if (!id) {
    res.status(400).json({ error: 'Missing thesis id' });
    return;
  }

  try {
    const thesis = await prisma.thesis.findUnique({ where: { id } });
    if (!thesis) {
      res.status(404).json({ error: 'Thesis not found' });
      return;
    }

    if (thesis.status !== 'DRAFT' && thesis.status !== 'REJECTED') {
      res.status(409).json({
        error: 'Only DRAFT or REJECTED theses can be deleted',
        status: thesis.status,
      });
      return;
    }

    await prisma.thesis.delete({ where: { id } });
    _evaluationCounts.delete(id);

    res.status(200).json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to delete thesis', message });
  }
});

export { router as thesisRouter };
