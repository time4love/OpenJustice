import { prisma } from '../lib/prisma';
import { Report, ReporterAgeRange, ReporterGender } from '@prisma/client';
import { MedicalAdverseEventReportInput, SocialEconomicImpactReportInput } from '../lib/reportIntakeSchemas';

// ---------------------------------------------------------------------------
// Creates a Report + its domain row in one nested Prisma write (implicitly
// transactional — Report is created with medicalReport/socialEconomicReport
// point to it, matching Report's discriminated-union design in schema.prisma:
// a Report never exists without exactly one domain row, and vice versa.
//
// Always PENDING_REVIEW (the Prisma default) — this is public, unauthenticated
// intake, same open-submission pattern already shipped for blocked-URL
// evidence recovery. Nothing here sets status explicitly; it fails closed.
// ---------------------------------------------------------------------------

interface ReportEnvelope {
  consentGiven: true;
  reporterAgeRange: ReporterAgeRange;
  reporterGender: ReporterGender;
}

export async function createMedicalReport(
  envelope: ReportEnvelope,
  payload: MedicalAdverseEventReportInput,
): Promise<Report> {
  return prisma.report.create({
    data: {
      domain: 'MEDICAL',
      consentGiven: envelope.consentGiven,
      reporterAgeRange: envelope.reporterAgeRange,
      reporterGender: envelope.reporterGender,
      medicalReport: { create: payload },
    },
  });
}

export async function createSocialEconomicReport(
  envelope: ReportEnvelope,
  payload: SocialEconomicImpactReportInput,
): Promise<Report> {
  return prisma.report.create({
    data: {
      domain: 'SOCIAL_ECONOMIC',
      consentGiven: envelope.consentGiven,
      reporterAgeRange: envelope.reporterAgeRange,
      reporterGender: envelope.reporterGender,
      socialEconomicReport: { create: payload },
    },
  });
}
