import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ReporterAgeRange, ReporterGender } from '@prisma/client';
import { verifyAndConsumeReporterEmail } from '../middleware/supabaseAuth';
import {
  medicalAdverseEventReportSchema,
  socialEconomicImpactReportSchema,
} from '../lib/reportIntakeSchemas';
import { createMedicalReport, createSocialEconomicReport } from '../services/reportIntake';
import { getMedicalPattern, getSocialEconomicPattern } from '../services/reportPatternService';
import {
  MEDICAL_DIMENSION_NAMES,
  SOCIAL_ECONOMIC_DIMENSION_NAMES,
  MedicalDimension,
  SocialEconomicDimension,
} from '../lib/reportDimensions';

const router = Router();

// ---------------------------------------------------------------------------
// Public adverse-outcome self-report intake.
//
// No researcher gate, no moderation queue — a report counts toward the
// aggregate the moment it's created, having cleared every check that
// matters (verified email, explicit consent, schema validation). See
// docs/gf-adverse-event-report-schema-dev-plan.md §2.10 for why no blanket
// per-report human review exists at all, and why Report has no status
// field to represent one. The only auth requirement is
// verifyAndConsumeReporterEmail: a Supabase magic-link/OTP session proving
// a real, controllable email, whose account is deleted the moment it is
// verified — see supabaseAuth.ts and §2.8. Report retains no
// identity-derived field, so nothing here ever sees or stores the email.
//
// Order matters and is load-bearing: validate the body FIRST, verify
// SECOND. The verification is one-shot and destructive (it deletes the
// reporter's Supabase account), so verifying before validating would spend
// a reporter's single magic-link on a submission the schema then rejects,
// leaving them to redo the whole email round trip to fix a typo'd field.
// That is why this is an awaited call inside the handler rather than a
// middleware in the router chain — a middleware cannot run second.
// ---------------------------------------------------------------------------

const ReporterEnvelopeSchema = z.object({
  consentGiven: z.literal(true, { error: 'Explicit consent is required to submit a report.' }),
  reporterAgeRange: z.enum(ReporterAgeRange).default('UNKNOWN'),
  reporterGender: z.enum(ReporterGender).default('UNKNOWN'),
});

const MedicalReportRequestSchema = ReporterEnvelopeSchema.extend({
  report: medicalAdverseEventReportSchema,
});

const SocialEconomicReportRequestSchema = ReporterEnvelopeSchema.extend({
  report: socialEconomicImpactReportSchema,
});

// ---------------------------------------------------------------------------
// POST /api/reports/medical
// ---------------------------------------------------------------------------

router.post(
  '/medical',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = MedicalReportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const verification = await verifyAndConsumeReporterEmail(req);
    if (!verification.ok) {
      res.status(verification.status).json(verification.body);
      return;
    }

    const { report, ...envelope } = parsed.data;

    try {
      const created = await createMedicalReport(envelope, report);
      res.status(201).json({ id: created.id });
    } catch (err) {
      console.error('[reports/medical] Failed to create report:', err instanceof Error ? err.stack : err);
      res.status(500).json({
        error: 'Failed to create report',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/reports/social-economic
// ---------------------------------------------------------------------------

router.post(
  '/social-economic',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SocialEconomicReportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const verification = await verifyAndConsumeReporterEmail(req);
    if (!verification.ok) {
      res.status(verification.status).json(verification.body);
      return;
    }

    const { report, ...envelope } = parsed.data;

    try {
      const created = await createSocialEconomicReport(envelope, report);
      res.status(201).json({ id: created.id });
    } catch (err) {
      console.error(
        '[reports/social-economic] Failed to create report:',
        err instanceof Error ? err.stack : err,
      );
      res.status(500).json({
        error: 'Failed to create report',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
);

// ---------------------------------------------------------------------------
// Aggregate pattern endpoints — Phase 6 (§0, §5 of the dev plan).
//
// Public, no auth — same precedent as GET /api/stats (server.ts): this
// returns only aggregate counts that survived disclosure control (applied
// inside reportPatternService.ts, never left to the caller), never anything
// about an individual report. Cells below SUPPRESSION_THRESHOLD are not
// returned at all — their existence alone can identify someone — and any
// rollup total that would let a withheld cell be recovered by subtraction is
// withheld with it. dimensions/filters are validated against
// reportDimensions.ts's allowlist before ever reaching raw SQL — that file
// is the actual security boundary, not this validation, but this is where
// an invalid dimension name gets a clean 400 instead of a raw-SQL error.
// ---------------------------------------------------------------------------

const PatternRequestSchema = (validDimensions: readonly string[]) =>
  z.object({
    dimensions: z
      .array(z.enum(validDimensions as [string, ...string[]]))
      .min(1, 'At least one dimension is required')
      .max(3, 'At most 3 dimensions at a time'),
    filters: z.record(z.enum(validDimensions as [string, ...string[]]), z.array(z.string())).optional(),
  });

const MedicalPatternRequestSchema = PatternRequestSchema(MEDICAL_DIMENSION_NAMES);
const SocialEconomicPatternRequestSchema = PatternRequestSchema(SOCIAL_ECONOMIC_DIMENSION_NAMES);

router.post('/medical/aggregate', async (req: Request, res: Response): Promise<void> => {
  const parsed = MedicalPatternRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  try {
    const cells = await getMedicalPattern(parsed.data.dimensions as MedicalDimension[], parsed.data.filters);
    res.status(200).json({ cells });
  } catch (err) {
    console.error('[reports/medical/aggregate] Query failed:', err instanceof Error ? err.stack : err);
    res.status(500).json({
      error: 'Failed to compute pattern',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post('/social-economic/aggregate', async (req: Request, res: Response): Promise<void> => {
  const parsed = SocialEconomicPatternRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  try {
    const cells = await getSocialEconomicPattern(
      parsed.data.dimensions as SocialEconomicDimension[],
      parsed.data.filters,
    );
    res.status(200).json({ cells });
  } catch (err) {
    console.error(
      '[reports/social-economic/aggregate] Query failed:',
      err instanceof Error ? err.stack : err,
    );
    res.status(500).json({
      error: 'Failed to compute pattern',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export { router as reportRouter };
