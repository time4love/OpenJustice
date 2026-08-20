import { useMessages, useTranslations } from 'next-intl';
import type enMessages from '../../messages/en.json';

// ---------------------------------------------------------------------------
// The adverse-outcome report taxonomy, as the frontend sees it.
//
// These enums are declared in the backend's schema.prisma and cannot be
// imported across the Express/Next.js boundary, so something on this side has
// to know both their values and their order. The message catalogs already do:
// messages/{he,en}.json carry one label per enum member, in schema order (see
// the dev plan §2.7). Rather than hand-copying the same 16 unions a second
// time — a drift risk with no compiler watching it — both the TYPES and the
// runtime option lists here are derived from that catalog:
//
//   - types, from `import type` of en.json (erased at build, zero bundle cost;
//     the ~46KB catalog is never duplicated into a chunk)
//   - values, from the active locale's messages at render time
//
// Parity between the catalogs and the real Prisma enums — same members, same
// order, no empty or untranslated labels — is enforced by a backend test
// (backend/test/reportLabelParity.test.ts), which is what makes deriving
// option lists from JSON safe rather than merely convenient.
// ---------------------------------------------------------------------------

type Messages = typeof enMessages;

/** Message namespaces that mirror a Prisma enum one-key-per-member. */
export type EnumNamespace =
  | 'medicalSymptomCategories'
  | 'medicalSeriousness'
  | 'cancerPresentationTypes'
  | 'cancerCourses'
  | 'cancerTypes'
  | 'cognitiveSymptomTypes'
  | 'symptomPersistence'
  | 'medicalCareEngagement'
  | 'vaccineManufacturers'
  | 'reportTimingWindows'
  | 'socialEconomicImpactCategories'
  | 'formalBasisAsserted'
  | 'consequenceSeverity'
  | 'socialOutcomeStatus'
  | 'reporterAgeRanges'
  | 'reporterGenders'
  | 'vaccinationStatuses'
  | 'reportCalendarPeriods'
  | 'employmentSectors'
  | 'remediesPursued'
  | 'relationshipsAffected';

/** The union of valid values for one taxonomy enum, e.g. 'ONCOLOGIC' | … */
export type EnumValue<N extends EnumNamespace> = keyof Messages[N] & string;

export type MedicalSymptomCategory = EnumValue<'medicalSymptomCategories'>;
export type MedicalSeriousness = EnumValue<'medicalSeriousness'>;
export type CancerPresentationType = EnumValue<'cancerPresentationTypes'>;
export type CancerCourse = EnumValue<'cancerCourses'>;
export type CancerType = EnumValue<'cancerTypes'>;
export type CognitiveSymptomType = EnumValue<'cognitiveSymptomTypes'>;
export type SymptomPersistence = EnumValue<'symptomPersistence'>;
export type MedicalCareEngagement = EnumValue<'medicalCareEngagement'>;
export type VaccineManufacturer = EnumValue<'vaccineManufacturers'>;
export type ReportTimingWindow = EnumValue<'reportTimingWindows'>;
export type SocialEconomicImpactCategory = EnumValue<'socialEconomicImpactCategories'>;
export type FormalBasisAsserted = EnumValue<'formalBasisAsserted'>;
export type ConsequenceSeverity = EnumValue<'consequenceSeverity'>;
export type SocialOutcomeStatus = EnumValue<'socialOutcomeStatus'>;
export type ReporterAgeRange = EnumValue<'reporterAgeRanges'>;
export type ReporterGender = EnumValue<'reporterGenders'>;
export type VaccinationStatus = EnumValue<'vaccinationStatuses'>;
export type ReportCalendarPeriod = EnumValue<'reportCalendarPeriods'>;
export type EmploymentSector = EnumValue<'employmentSectors'>;
export type RemedyPursued = EnumValue<'remediesPursued'>;
export type RelationshipAffected = EnumValue<'relationshipsAffected'>;

/**
 * The two categories the medical form branches on. Named constants rather
 * than inline string literals so the conditional sub-field logic is checked
 * against the derived union — a typo here fails `tsc` instead of silently
 * never matching and dropping a whole section of the questionnaire.
 */
/**
 * The single answer anywhere in this form that reveals a GDPR Art. 9(1)
 * special category other than health: asking for a religious accommodation
 * discloses religious belief. Named so the consent text can mention it only
 * when the reporter actually selected it.
 */
export const RELIGIOUS_ACCOMMODATION_DENIED: FormalBasisAsserted = 'RELIGIOUS_ACCOMMODATION_DENIED';

export const ONCOLOGIC: MedicalSymptomCategory = 'ONCOLOGIC';
export const NEUROCOGNITIVE_PVS: MedicalSymptomCategory = 'NEUROCOGNITIVE_PVS';

/**
 * Which social/economic categories each conditional follow-up applies to.
 *
 * These MUST stay identical to reportIntakeSchemas.ts's exported lists on the
 * backend: the form asking a question the schema then rejects — or omitting one
 * it requires — is a 400 the reporter cannot act on. The two cannot share a
 * module across the Express/Next.js boundary, so they are kept in step by hand,
 * the same standing duplication as the enum labels.
 */
export const EMPLOYMENT_CATEGORIES: readonly SocialEconomicImpactCategory[] = [
  'EMPLOYMENT_TERMINATION',
  'DEMOTION_REASSIGNMENT',
  'DENIED_HIRE',
];

export const FORMAL_PROCESS_CATEGORIES: readonly SocialEconomicImpactCategory[] = [
  ...EMPLOYMENT_CATEGORIES,
  'MILITARY_DISCHARGE',
];

export const RELATIONAL_CATEGORIES: readonly SocialEconomicImpactCategory[] = [
  'FAMILY_RELATIONSHIP_RUPTURE',
  'SOCIAL_OSTRACIZATION',
];

/**
 * The values of one taxonomy enum, in schema order, read from the loaded
 * message catalog. The two casts are the whole reason this helper exists in
 * one place instead of at 16 call sites: next-intl types messages as an
 * opaque nested record, and Object.keys always widens to string[].
 */
export function useEnumValues<N extends EnumNamespace>(namespace: N): EnumValue<N>[] {
  const messages = useMessages() as unknown as Record<EnumNamespace, Record<string, string>>;
  return Object.keys(messages[namespace]) as EnumValue<N>[];
}

/**
 * The label for one taxonomy value, in the active locale.
 *
 * next-intl only types message keys for a literal namespace; called with a
 * generic one it widens the catalog to Record<string, unknown> and stops
 * recognising any key at all. The cast narrows the translator back to what
 * it actually is here — a string-keyed lookup — in one place, applied only
 * to values that came out of the very namespace being read.
 */
export function useEnumLabel<N extends EnumNamespace>(namespace: N): (value: EnumValue<N>) => string {
  const t = useTranslations(namespace) as unknown as (key: string) => string;
  return (value) => t(value);
}
