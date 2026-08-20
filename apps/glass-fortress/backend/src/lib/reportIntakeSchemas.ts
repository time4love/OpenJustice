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
  VaccinationStatus,
  ReportCalendarPeriod,
} from '@prisma/client';

// ---------------------------------------------------------------------------
// Medical
// ---------------------------------------------------------------------------

const medicalBaseSchema = z.object({
  symptomCategory: z.enum(MedicalSymptomCategory),
  seriousness: z.enum(MedicalSeriousness).default('NONE'),

  // Required only when symptomCategory = ONCOLOGIC (enforced below).
  // cancerType and cancerCourse are required-when-ONCOLOGIC because each has
  // a designed-for "don't know" member (NOT_YET_TYPED / UNKNOWN) — a reporter
  // should explicitly choose it, not have the system silently default to it.
  // cancerCourse only joined them once CancerCourse.UNKNOWN was added
  // (migration 20260820090000); before that, requiring it would have forced a
  // guess between "typical pace" and "unusually rapid" with no honest third
  // option, which is worse than a null.
  //
  // cancerPresentationType still has no such member (NEW_DIAGNOSIS /
  // RECURRENCE_OR_PROGRESSION / OTHER — "other" is an escape hatch, not an
  // admission of not knowing), so it stays optional even when ONCOLOGIC, for
  // exactly the reason cancerCourse used to. Closing that one needs its own
  // decision about whether OTHER is doing that job already.
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

  if (isOncologic && data.cancerCourse === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['cancerCourse'],
      message: 'cancerCourse is required when symptomCategory is ONCOLOGIC (use UNKNOWN if not known)',
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

  // Deliberately NOT .default(...) — the only required field here besides
  // impactCategory. It is the causal antecedent that makes a row in this
  // domain interpretable at all (see schema.prisma's own comment), so a
  // caller that omits it must get a 400 rather than a silent UNDISCLOSED
  // that looks like a deliberate answer. The Prisma column keeps a default
  // so the write is safe regardless; this is where the promise is kept.
  vaccinationStatus: z.enum(VaccinationStatus),

  // Calendar period, not an interval. The old timingRelativeToEvent asked
  // "how long after vaccination" — an anchor that does not exist for a
  // reporter who never was vaccinated.
  occurredDuring: z.enum(ReportCalendarPeriod).default('UNKNOWN'),
});

export type SocialEconomicImpactReportInput = z.infer<typeof socialEconomicImpactReportSchema>;
