/**
 * Allowlisted dimensions for the report pattern-aggregation endpoints
 * (reportPatternService.ts).
 *
 * This is the actual security boundary for that service. `$queryRaw`'s
 * tagged-template parameterization (see VectorStoreService.ts) is safe for
 * VALUES but cannot parameterize identifiers — a column name in GROUP BY or
 * SELECT has to be composed as raw SQL text. Every raw-inserted identifier
 * in reportPatternService.ts must come from this file's fixed string
 * literals, never from a request body, however validated it looks upstream.
 *
 * Deliberately a curated subset, not every column on either domain table —
 * MVP scope covers the headline stratification questions (what happened,
 * how severe, demographics), matching real pharmacovigilance practice
 * (VAERS/EudraVigilance stratify by category/severity/timing/age/sex).
 * Oncology/cognitive sub-fields (only meaningful conditioned on a specific
 * symptomCategory), doseNumber, documentationAvailable, and
 * timingRelativeToEvent were deliberately deferred, not forgotten — extend
 * this file when a real need for them shows up.
 */

export type MedicalDimension =
  | 'symptomCategory'
  | 'seriousness'
  | 'onsetWindow'
  | 'vaccineManufacturer'
  | 'reporterAgeRange'
  | 'reporterGender';

export type SocialEconomicDimension =
  | 'impactCategory'
  | 'formalBasisAsserted'
  | 'consequenceSeverity'
  | 'outcomeStatus'
  | 'reporterAgeRange'
  | 'reporterGender';

interface DimensionColumn {
  /** Fully qualified, pre-quoted SQL column reference — safe to insert raw. */
  sqlColumn: string;
}

// reporterAgeRange/reporterGender live on "Report" (aliased r); every other
// dimension lives on the domain table (aliased m or s) — see
// reportPatternService.ts for the join.
export const MEDICAL_DIMENSIONS: Record<MedicalDimension, DimensionColumn> = {
  symptomCategory: { sqlColumn: 'm."symptomCategory"' },
  seriousness: { sqlColumn: 'm."seriousness"' },
  onsetWindow: { sqlColumn: 'm."onsetWindow"' },
  vaccineManufacturer: { sqlColumn: 'm."vaccineManufacturer"' },
  reporterAgeRange: { sqlColumn: 'r."reporterAgeRange"' },
  reporterGender: { sqlColumn: 'r."reporterGender"' },
};

export const SOCIAL_ECONOMIC_DIMENSIONS: Record<SocialEconomicDimension, DimensionColumn> = {
  impactCategory: { sqlColumn: 's."impactCategory"' },
  formalBasisAsserted: { sqlColumn: 's."formalBasisAsserted"' },
  consequenceSeverity: { sqlColumn: 's."consequenceSeverity"' },
  outcomeStatus: { sqlColumn: 's."outcomeStatus"' },
  reporterAgeRange: { sqlColumn: 'r."reporterAgeRange"' },
  reporterGender: { sqlColumn: 'r."reporterGender"' },
};

export const MEDICAL_DIMENSION_NAMES = Object.keys(MEDICAL_DIMENSIONS) as MedicalDimension[];
export const SOCIAL_ECONOMIC_DIMENSION_NAMES = Object.keys(
  SOCIAL_ECONOMIC_DIMENSIONS,
) as SocialEconomicDimension[];

export function isMedicalDimension(value: string): value is MedicalDimension {
  return Object.prototype.hasOwnProperty.call(MEDICAL_DIMENSIONS, value);
}

export function isSocialEconomicDimension(value: string): value is SocialEconomicDimension {
  return Object.prototype.hasOwnProperty.call(SOCIAL_ECONOMIC_DIMENSIONS, value);
}

// Minimum cell count before a value is suppressed — NCHS/CDC WONDER's own
// public-health-statistics standard (adopted 2011, replacing an earlier
// 1-4 rule found insufficient to prevent re-identification): any count
// under 10 is withheld. Not an invented number.
export const SUPPRESSION_THRESHOLD = 10;
