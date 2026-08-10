import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { caseAuth, AuthenticatedRequest } from '../middleware/caseAuth';
import { CaseVaultService } from '../services/CaseVaultService';
import { ConsentService } from '../services/ConsentService';
import { supabaseAdmin } from '../lib/supabase';
import { CooperationLevel } from '../generated/prisma';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res, next).catch(next);

const router = Router();
const vaultService = new CaseVaultService();
const consentService = new ConsentService();

const RegisterSchema = z.object({
  publicKeyHex: z.string().min(1),
});

const IntakeSchema = z.object({
  encryptedIntakeData: z.string().min(1),
});

const ConsentSchema = z.object({
  tier: z.nativeEnum(CooperationLevel),
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

export { router as caseRouter };
