import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ReporterAgeRange, ReporterGender } from '@prisma/client';
import { requireVerifiedReporterEmail } from '../middleware/supabaseAuth';
import {
  medicalAdverseEventReportSchema,
  socialEconomicImpactReportSchema,
} from '../lib/reportIntakeSchemas';
import { createMedicalReport, createSocialEconomicReport } from '../services/reportIntake';

const router = Router();

// ---------------------------------------------------------------------------
// Public adverse-outcome self-report intake.
//
// No researcher gate — mirrors the already-shipped blocked-URL evidence
// recovery pattern (open submission, always PENDING_REVIEW). The only auth
// requirement is requireVerifiedReporterEmail: a Supabase magic-link/OTP
// session proving a real, controllable email, which the middleware itself
// deletes immediately after verifying — see supabaseAuth.ts and
// docs/gf-adverse-event-report-schema-dev-plan.md §2.8. Report retains no
// identity-derived field, so nothing here ever sees or stores the email.
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
  requireVerifiedReporterEmail,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = MedicalReportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { report, ...envelope } = parsed.data;

    try {
      const created = await createMedicalReport(envelope, report);
      res.status(201).json({ id: created.id, status: created.status });
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
  requireVerifiedReporterEmail,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SocialEconomicReportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
      return;
    }

    const { report, ...envelope } = parsed.data;

    try {
      const created = await createSocialEconomicReport(envelope, report);
      res.status(201).json({ id: created.id, status: created.status });
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

export { router as reportRouter };
