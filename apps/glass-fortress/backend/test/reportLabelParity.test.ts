// ---------------------------------------------------------------------------
// Report taxonomy label parity — Prisma enums <-> frontend message catalogs.
//
// Every enum a reporter sees is defined once in schema.prisma and labelled
// twice more, by hand, across a boundary no compiler crosses: the backend's
// own Record<PrismaEnum, string> label maps (which tsc does check) and the
// Next.js frontend's messages/{he,en}.json (which nothing checked until
// this file existed). §2.7 of docs/gf-adverse-event-report-schema-dev-plan.md
// verified that parity once, by hand, as a one-off script.
//
// A one-off check was enough while the JSON was only a lookup table for
// labels. It stopped being enough with Phase 8: the intake form derives its
// option lists — the actual set and ORDER of radio buttons a reporter can
// choose from — from these namespaces' keys. An enum value added to
// schema.prisma and forgotten here is now an option that silently cannot be
// reported, which is exactly the kind of quiet, data-corrupting failure this
// project's standing rule says to guard with a test rather than fix once.
//
// Ordered, not just set-equal: schema declaration order IS the UI display
// order (that is why UNKNOWN/OTHER members sit last in the schema). A
// deliberate reordering of the form belongs in schema.prisma, where every
// consumer sees it, not in one locale's JSON.
// ---------------------------------------------------------------------------

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
  ReporterAgeRange,
  ReporterGender,
  VaccinationStatus,
  ReportCalendarPeriod,
} from '@prisma/client';

import en from '../../frontend/messages/en.json';
import he from '../../frontend/messages/he.json';

type LabelCatalog = Record<string, Record<string, string>>;

const CATALOGS: [locale: string, messages: LabelCatalog][] = [
  ['en', en as unknown as LabelCatalog],
  ['he', he as unknown as LabelCatalog],
];

// namespace in messages/*.json -> the Prisma enum it must mirror exactly.
const NAMESPACE_TO_ENUM: Record<string, Record<string, string>> = {
  medicalSymptomCategories: MedicalSymptomCategory,
  medicalSeriousness: MedicalSeriousness,
  cancerPresentationTypes: CancerPresentationType,
  cancerCourses: CancerCourse,
  cancerTypes: CancerType,
  cognitiveSymptomTypes: CognitiveSymptomType,
  symptomPersistence: SymptomPersistence,
  medicalCareEngagement: MedicalCareEngagement,
  vaccineManufacturers: VaccineManufacturer,
  reportTimingWindows: ReportTimingWindow,
  socialEconomicImpactCategories: SocialEconomicImpactCategory,
  formalBasisAsserted: FormalBasisAsserted,
  consequenceSeverity: ConsequenceSeverity,
  socialOutcomeStatus: SocialOutcomeStatus,
  reporterAgeRanges: ReporterAgeRange,
  reporterGenders: ReporterGender,
  vaccinationStatuses: VaccinationStatus,
  reportCalendarPeriods: ReportCalendarPeriod,
};

describe('report taxonomy labels mirror the Prisma enums', () => {
  for (const [namespace, prismaEnum] of Object.entries(NAMESPACE_TO_ENUM)) {
    const expected = Object.values(prismaEnum);

    for (const [locale, messages] of CATALOGS) {
      it(`${locale}.json "${namespace}" covers ${Object.keys(prismaEnum).length} enum values, in schema order`, () => {
        expect(messages[namespace]).toBeDefined();
        expect(Object.keys(messages[namespace] as Record<string, string>)).toEqual(expected);
      });

      it(`${locale}.json "${namespace}" has no empty label`, () => {
        for (const [key, label] of Object.entries(messages[namespace] as Record<string, string>)) {
          expect(typeof label).toBe('string');
          expect(label.trim()).not.toBe('');
          // A label left as its own identifier is an untranslated placeholder,
          // not a translation — catch it here rather than in the UI.
          expect(label).not.toBe(key);
        }
      });
    }
  }
});
