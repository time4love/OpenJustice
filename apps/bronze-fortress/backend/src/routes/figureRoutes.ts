import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { caseAuth, AuthenticatedRequest } from '../middleware/caseAuth';
import { FigureService, NoCaseCourtError } from '../services/FigureService';
import { KeyFigureType } from '../generated/prisma';
import { prisma } from '../lib/prisma';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res, next).catch(next);

const router = Router();
const figureService = new FigureService();

const NominateSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(KeyFigureType),
  organization: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/figures/nominate
// Authenticated: nominate a key figure and register pattern allegations.
// Court is read from the case — set it first via PUT /api/cases/me/court.
// ---------------------------------------------------------------------------
router.post('/nominate', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;

  const parse = NominateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid nomination data', details: parse.error.flatten() });
    return;
  }

  try {
    const result = await figureService.nominateAndCommit(caseId, parse.data);
    res.status(201).json({
      figureId: result.figure.id,
      figureName: result.figure.name,
      figureStatus: result.figure.status,
      courtId: result.court.id,
      patterns: result.patterns,
      newAllegationsCreated: result.newAllegationsCreated,
    });
  } catch (err) {
    if (err instanceof NoCaseCourtError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}));

// ---------------------------------------------------------------------------
// GET /api/figures/courts
// No auth: returns seeded court list for the nomination dropdown.
// ---------------------------------------------------------------------------
router.get('/courts', asyncHandler(async (_req, res) => {
  const courts = await prisma.court.findMany({
    orderBy: [{ district: 'asc' }, { city: 'asc' }],
    select: { id: true, name: true, city: true, district: true },
  });
  res.json({ courts });
}));

// ---------------------------------------------------------------------------
// GET /api/figures/patterns/public
// No auth: public aggregation — (figure, pattern, count) where count >= threshold.
// Zero personal data. Safe to embed in homepage.
// ---------------------------------------------------------------------------
router.get('/patterns/public', asyncHandler(async (_req, res) => {
  const rows = await figureService.getPublicPatternCounts();
  res.json({ patterns: rows });
}));

export { router as figureRouter };
