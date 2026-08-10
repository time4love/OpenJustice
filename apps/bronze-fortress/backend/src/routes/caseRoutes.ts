import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { caseAuth, AuthenticatedRequest } from '../middleware/caseAuth';
import { CaseVaultService } from '../services/CaseVaultService';
import { ConsentService } from '../services/ConsentService';
import { StructuredIntakeService } from '../services/StructuredIntakeService';
import { supabaseAdmin } from '../lib/supabase';
import { CooperationLevel, PoliceCaseStatus, NzakutOrderType } from '../generated/prisma';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res, next).catch(next);

const router = Router();
const vaultService = new CaseVaultService();
const consentService = new ConsentService();
const intakeService = new StructuredIntakeService();

const RegisterSchema = z.object({
  publicKeyHex: z.string().min(1),
});

const IntakeSchema = z.object({
  encryptedIntakeData: z.string().min(1),
});

const ConsentSchema = z.object({
  tier: z.nativeEnum(CooperationLevel),
});

const ComplaintSchema = z.object({
  policeStatus: z.nativeEnum(PoliceCaseStatus),
  closureConsideredByCourt: z.boolean().optional(),
  custodyChangedAfterClosure: z.enum(['worsened', 'unchanged', 'improved']).optional(),
  welfareReportCitedAfterClose: z.boolean().optional(),
  complaintDate: z.coerce.date().optional(),
  closureDate: z.coerce.date().optional(),
});

const NzakutSchema = z.object({
  orderType: z.nativeEnum(NzakutOrderType),
  evidentiaryHearingHeld: z.boolean(),
  daysToFullHearing: z.number().int().nonnegative().optional(),
  childrenLocation: z.enum(['other_parent', 'foster', 'institution']).optional(),
  daysWithoutMeritsHearing: z.number().int().nonnegative().optional(),
  orderDate: z.coerce.date().optional(),
  hearingDate: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/cases
// Register a new case vault. Requires a valid Supabase auth token.
// The authenticated user becomes the PRIMARY_CONTACT member.
// ---------------------------------------------------------------------------
router.post('/', asyncHandler(async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const parse = RegisterSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'publicKeyHex is required' });
    return;
  }

  // Prevent duplicate registration
  const existing = await vaultService.getCaseByMember(data.user.id);
  if (existing) {
    res.status(409).json({ error: 'A case vault already exists for this user', caseId: existing.id });
    return;
  }

  const legalCase = await vaultService.createCase({
    publicKeyHex: parse.data.publicKeyHex,
    supabaseUserId: data.user.id,
  });

  res.status(201).json({ caseId: legalCase.id, cooperationLevel: legalCase.cooperationLevel });
}));

// ---------------------------------------------------------------------------
// GET /api/cases/me
// Returns the authenticated case's profile + active consents.
// ---------------------------------------------------------------------------
router.get('/me', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;

  const [legalCase, consents] = await Promise.all([
    vaultService.getCase(caseId),
    consentService.getActiveConsents(caseId),
  ]);

  if (!legalCase) {
    res.status(404).json({ error: 'Case vault not found' });
    return;
  }

  res.json({
    caseId: legalCase.id,
    cooperationLevel: legalCase.cooperationLevel,
    publicKeyHex: legalCase.publicKeyHex,
    hasIntakeData: legalCase.encryptedIntakeData !== null,
    activeConsents: consents.map((c) => ({ tier: c.tier, grantedAt: c.grantedAt })),
  });
}));

// ---------------------------------------------------------------------------
// POST /api/cases/me/intake
// Store encrypted questionnaire responses. Body is ciphertext — server never
// sees plaintext. Petitioners encrypt client-side before uploading.
// ---------------------------------------------------------------------------
router.post('/me/intake', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;

  const parse = IntakeSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'encryptedIntakeData is required' });
    return;
  }

  await vaultService.storeEncryptedIntake({
    caseId,
    encryptedIntakeData: parse.data.encryptedIntakeData,
  });

  res.json({ message: 'Intake data stored.' });
}));

// ---------------------------------------------------------------------------
// POST /api/cases/me/consent
// Grant a cooperation tier.
// ---------------------------------------------------------------------------
router.post('/me/consent', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;

  const parse = ConsentSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Valid tier is required', validTiers: Object.values(CooperationLevel) });
    return;
  }

  if (parse.data.tier === CooperationLevel.NONE) {
    res.status(400).json({ error: 'Cannot grant NONE tier — use DELETE /me/consent/:tier to revoke' });
    return;
  }

  const record = await consentService.grantConsent(caseId, parse.data.tier);
  res.status(201).json({ consentId: record.id, tier: record.tier, grantedAt: record.grantedAt });
}));

// ---------------------------------------------------------------------------
// DELETE /api/cases/me/consent/:tier
// Revoke a cooperation tier.
// ---------------------------------------------------------------------------
router.delete('/me/consent/:tier', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;
  const tier = req.params['tier'] as CooperationLevel;

  if (!Object.values(CooperationLevel).includes(tier)) {
    res.status(400).json({ error: 'Invalid tier', validTiers: Object.values(CooperationLevel) });
    return;
  }

  await consentService.revokeConsent(caseId, tier);
  res.json({ message: `Consent for ${tier} revoked.` });
}));

// ---------------------------------------------------------------------------
// POST /api/cases/me/complaints
// Add a criminal complaint record (domain A — criminal-to-family interface).
// ---------------------------------------------------------------------------
router.post('/me/complaints', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;

  const parse = ComplaintSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid complaint data', details: parse.error.flatten() });
    return;
  }

  const complaint = await intakeService.addCriminalComplaint(caseId, parse.data);
  res.status(201).json(complaint);
}));

// ---------------------------------------------------------------------------
// GET /api/cases/me/complaints
// List all criminal complaint records for the authenticated case.
// ---------------------------------------------------------------------------
router.get('/me/complaints', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;
  const complaints = await intakeService.listCriminalComplaints(caseId);
  res.json({ complaints });
}));

// ---------------------------------------------------------------------------
// POST /api/cases/me/nzakut
// Add a צו נזקקות record (domain B — חוק הנוער procedural violations).
// ---------------------------------------------------------------------------
router.post('/me/nzakut', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;

  const parse = NzakutSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid nzakut order data', details: parse.error.flatten() });
    return;
  }

  const order = await intakeService.addNzakutOrder(caseId, parse.data);
  res.status(201).json(order);
}));

// ---------------------------------------------------------------------------
// GET /api/cases/me/nzakut
// List all צו נזקקות records for the authenticated case.
// ---------------------------------------------------------------------------
router.get('/me/nzakut', caseAuth, asyncHandler(async (req, res) => {
  const { caseId } = req as AuthenticatedRequest;
  const orders = await intakeService.listNzakutOrders(caseId);
  res.json({ orders });
}));

export { router as caseRouter };
