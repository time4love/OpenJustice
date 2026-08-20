/**
 * Public adverse-event self-report intake validation.
 *
 * Covers only the two structured domain payloads
 * (MedicalAdverseEventReport / SocialEconomicImpactReport) — the Report
 * envelope (reporter email, domain discriminator) is composed on top of
 * these by the intake endpoint, not part of this file.
 *
 * Enums are z.enum(...) against the generated Prisma client rather
 * than hand-copied string tuples (the convention elsewhere in this codebase,
 * e.g. investigativeCategoriesField). That convention exists because
 * investigativeCategories is deliberately NOT a Prisma enum, so there is
 * nothing to import — these fields are real Prisma enums (14 of them), and
 * hand-copying that many literal unions would create a drift risk the
 * existing convention never had to solve. Importing the generated enum
 * eliminates it by construction.
 */

import { z } from 'zod';
import {
  MedicalSymptomCategory,
  MedicalSeriousness,
  CancerPresentationType,
  CancerCourse,
  CancerType,
  CognitiveSymptomType,
  SymptomPersistence,
  MedicalCareEngagement,
  VaccineManufacturer,
  ReportTimingWindow,
  SocialEconomicImpactCategory,
  FormalBasisAsserted,
  ConsequenceSeverity,
  SocialOutcomeStatus,
} from '@prisma/client';

// Defensive cap on public free-text input — not present in the Prisma column
// (unbounded text) or discussed when the schema was designed; added here at
// the intake boundary as a standard abuse guard, not a data-model decision.
const FREE_TEXT_MAX = 5000;

// ---------------------------------------------------------------------------
// Medical
// ---------------------------------------------------------------------------

const medicalBaseSchema = z.object({
  symptomCategory: z.enum(MedicalSymptomCategory),
  seriousness: z.enum(MedicalSeriousness).default('NONE'),

  // Required only when symptomCategory = ONCOLOGIC (enforced below).
  // cancerType is required-when-set because CancerType has a designed-for
  // "don't know yet" member (NOT_YET_TYPED) — a reporter should explicitly
  // choose it, not have the system silently default to it. cancerCourse and
  // cancerPresentationType have no such member (no CancerCourse.UNKNOWN
  // exists), so they stay optional even when ONCOLOGIC: forcing a choice
  // with no honest "I don't know" option would push reporters toward
  // guessing. Flagged as a real gap worth a follow-up migration
  // (CancerCourse.UNKNOWN), not silently decided — see chat.
  cancerPresentationType: z.enum(CancerPresentationType).optional(),
  cancerCourse: z.enum(CancerCourse).optional(),
  cancerAtypicalFeatures: z.boolean().optional(),
  cancerType: z.enum(CancerType).optional(),

  // Required only when symptomCategory = NEUROCOGNITIVE_PVS (enforced below).
  cognitiveSymptomType: z.enum(CognitiveSymptomType).optional(),
  postExertionalMalaise: z.boolean().optional(),

  // Schema-wide, not category-scoped — see SymptomPersistence's own comment
  // in schema.prisma for why.
  symptomPersistence: z.enum(SymptomPersistence).default('UNKNOWN'),

  vaccineManufacturer: z.enum(VaccineManufacturer).default('UNKNOWN'),
  doseNumber: z.number().int().positive().optional(),

  onsetWindow: z.enum(ReportTimingWindow).default('UNKNOWN'),
  medicalCareEngagement: z.enum(MedicalCareEngagement).default('UNKNOWN'),
  preExistingCondition: z.boolean().optional(),

  freeTextElaboration: z.string().max(FREE_TEXT_MAX).optional(),
});

const CANCER_FIELDS = [
  'cancerPresentationType',
  'cancerCourse',
  'cancerAtypicalFeatures',
  'cancerType',
] as const;

const COGNITIVE_FIELDS = ['cognitiveSymptomType', 'postExertionalMalaise'] as const;

/**
 * Enforces the "set only when symptomCategory = X; null otherwise" rule
 * documented on the cancer-prefixed and cognitive-prefixed fields in
 * schema.prisma — the DB can't enforce it, so this is where that promise
 * actually gets kept.
 */
export const medicalAdverseEventReportSchema = medicalBaseSchema.superRefine((data, ctx) => {
  const isOncologic = data.symptomCategory === MedicalSymptomCategory.ONCOLOGIC;
  const isNeurocognitive = data.symptomCategory === MedicalSymptomCategory.NEUROCOGNITIVE_PVS;

  if (isOncologic && data.cancerType === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['cancerType'],
      message: 'cancerType is required when symptomCategory is ONCOLOGIC (use NOT_YET_TYPED if unknown)',
    });
  }

  if (!isOncologic) {
    for (const field of CANCER_FIELDS) {
      if (data[field] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} may only be set when symptomCategory is ONCOLOGIC`,
        });
      }
    }
  }

  if (isNeurocognitive && data.cognitiveSymptomType === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['cognitiveSymptomType'],
      message: 'cognitiveSymptomType is required when symptomCategory is NEUROCOGNITIVE_PVS',
    });
  }

  if (!isNeurocognitive) {
    for (const field of COGNITIVE_FIELDS) {
      if (data[field] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} may only be set when symptomCategory is NEUROCOGNITIVE_PVS`,
        });
      }
    }
  }
});

export type MedicalAdverseEventReportInput = z.infer<typeof medicalAdverseEventReportSchema>;

// ---------------------------------------------------------------------------
// Social/economic
// ---------------------------------------------------------------------------

// No conditional fields — every field applies to every impactCategory, so a
// plain object schema is sufficient (no superRefine needed).
export const socialEconomicImpactReportSchema = z.object({
  impactCategory: z.enum(SocialEconomicImpactCategory),
  formalBasisAsserted: z.enum(FormalBasisAsserted).default('UNKNOWN'),
  consequenceSeverity: z.enum(ConsequenceSeverity).default('NONE'),
  outcomeStatus: z.enum(SocialOutcomeStatus).default('UNKNOWN'),
  documentationAvailable: z.boolean().optional(),
  timingRelativeToEvent: z.enum(ReportTimingWindow).default('UNKNOWN'),
  freeTextElaboration: z.string().max(FREE_TEXT_MAX).optional(),
});

export type SocialEconomicImpactReportInput = z.infer<typeof socialEconomicImpactReportSchema>;
