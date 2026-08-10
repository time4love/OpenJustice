import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

const MENTION_LIMIT = 5;

// ---------------------------------------------------------------------------
// GET /api/mentions/figures?q=
//
// Typeahead search for KeyFigure names used by the TipTap @ mention trigger.
// Returns up to 5 results ordered alphabetically.
// ---------------------------------------------------------------------------

router.get('/figures', async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';

  try {
    const figures = await prisma.keyFigure.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: MENTION_LIMIT,
      select: { id: true, name: true },
    });

    res.status(200).json({ figures });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to search figures', message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mentions/evidence?q=
//
// Typeahead search for Evidence records used by the TipTap # mention trigger.
// Searches summary and category. Returns display-friendly fields only —
// fileHash is an implementation detail and is not returned here.
// ---------------------------------------------------------------------------

router.get('/evidence', async (req: Request, res: Response): Promise<void> => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';

  try {
    const evidence = await prisma.evidence.findMany({
      where: q
        ? {
            OR: [
              { summary: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: MENTION_LIMIT,
      select: { id: true, summary: true, category: true, evidenceDate: true },
    });

    res.status(200).json({ evidence });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to search evidence', message });
  }
});

export { router as mentionRouter };
