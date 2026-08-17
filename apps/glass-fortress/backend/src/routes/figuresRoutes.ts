import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { mapEvidenceToRecord } from '../lib/evidenceRecord';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/figures
//
// Returns all KeyFigure records ordered alphabetically, with evidence counts.
// ---------------------------------------------------------------------------

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const figures = await prisma.keyFigure.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { evidence: true } } },
    });

    res.status(200).json({
      figures: figures.map((f) => ({
        id: f.id,
        name: f.name,
        evidenceCount: f._count.evidence,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to list figures', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/figures/:id
//
// Returns a single KeyFigure and all Evidence records linked to it, ordered
// chronologically. Response shape mirrors the timeline endpoint so the
// frontend can reuse the same card components.
// ---------------------------------------------------------------------------

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  try {
    const figure = await prisma.keyFigure.findUnique({
      where: { id },
      include: {
        evidence: {
          orderBy: [{ evidenceDate: 'asc' }, { createdAt: 'asc' }],
          include: {
            figures: { select: { id: true, name: true } },
            urlVersionDiff: { select: { trackedUrlId: true } },
          },
        },
      },
    });

    if (!figure) {
      res.status(404).json({ error: 'Figure not found' });
      return;
    }

    const evidence = figure.evidence.map((r) => ({
      content: r.summary,
      metadata: mapEvidenceToRecord(r, r.urlVersionDiff?.trackedUrlId ?? null),
    }));

    res.status(200).json({
      figure: { id: figure.id, name: figure.name },
      evidence,
      totalCount: evidence.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to fetch figure', message });
  }
});

export { router as figuresRouter };
