import {
  medicalAdverseEventReportSchema,
  socialEconomicImpactReportSchema,
} from '../src/lib/reportIntakeSchemas';

describe('medicalAdverseEventReportSchema', () => {
  it('accepts a minimal non-oncologic, non-cognitive report and applies defaults', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'CARDIOVASCULAR',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seriousness).toBe('NONE');
      expect(result.data.symptomPersistence).toBe('UNKNOWN');
      expect(result.data.vaccineManufacturer).toBe('UNKNOWN');
      expect(result.data.onsetWindow).toBe('UNKNOWN');
    }
  });

  it('requires cancerType when symptomCategory is ONCOLOGIC', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'ONCOLOGIC',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'cancerType')).toBe(true);
    }
  });

  it('requires cancerCourse when symptomCategory is ONCOLOGIC', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'ONCOLOGIC',
      cancerType: 'NOT_YET_TYPED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'cancerCourse')).toBe(true);
    }
  });

  it('accepts ONCOLOGIC with both unknowns stated explicitly (NOT_YET_TYPED / UNKNOWN)', () => {
    // The whole point of CancerCourse.UNKNOWN (migration 20260820090000): a
    // reporter who does not know the progression rate can now say so, instead
    // of the field being left optional so as not to force a guess.
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'ONCOLOGIC',
      cancerType: 'NOT_YET_TYPED',
      cancerCourse: 'UNKNOWN',
    });
    expect(result.success).toBe(true);
  });

  it('rejects cancer fields set on a non-ONCOLOGIC category', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'CARDIOVASCULAR',
      cancerType: 'BREAST',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'cancerType')).toBe(true);
    }
  });

  it('requires cognitiveSymptomType when symptomCategory is NEUROCOGNITIVE_PVS', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'NEUROCOGNITIVE_PVS',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.') === 'cognitiveSymptomType'),
      ).toBe(true);
    }
  });

  it('accepts a full NEUROCOGNITIVE_PVS report with postExertionalMalaise', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'NEUROCOGNITIVE_PVS',
      cognitiveSymptomType: 'BRAIN_FOG',
      postExertionalMalaise: true,
      symptomPersistence: 'ONGOING_PERSISTENT',
    });
    expect(result.success).toBe(true);
  });

  it('rejects cognitive fields set on a non-NEUROCOGNITIVE_PVS category', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'ONCOLOGIC',
      cancerType: 'NOT_YET_TYPED',
      cancerCourse: 'UNKNOWN',
      postExertionalMalaise: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.') === 'postExertionalMalaise'),
      ).toBe(true);
    }
  });

  it('rejects an unknown symptomCategory value', () => {
    const result = medicalAdverseEventReportSchema.safeParse({
      symptomCategory: 'NOT_A_REAL_CATEGORY',
    });
    expect(result.success).toBe(false);
  });
});

describe('socialEconomicImpactReportSchema', () => {
  it('accepts a minimal report and applies defaults', () => {
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'MILITARY_DISCHARGE',
      vaccinationStatus: 'NOT_RECEIVED',
      remedyPursued: 'NONE',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.formalBasisAsserted).toBe('UNKNOWN');
      expect(result.data.consequenceSeverity).toBe('NONE');
      expect(result.data.outcomeStatus).toBe('UNKNOWN');
      expect(result.data.occurredDuring).toBe('UNKNOWN');
    }
  });

  it('accepts a fully specified report', () => {
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'MILITARY_DISCHARGE',
      formalBasisAsserted: 'RELIGIOUS_ACCOMMODATION_DENIED',
      consequenceSeverity: 'CAREER_TRAJECTORY_IMPACT',
      outcomeStatus: 'RESOLVED_REVERSED',
      documentationAvailable: true,
      vaccinationStatus: 'NOT_RECEIVED',
      occurredDuring: 'YEAR_2021_H2',
      remedyPursued: 'LITIGATION',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown impactCategory value', () => {
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'NOT_A_REAL_CATEGORY',
      vaccinationStatus: 'NOT_RECEIVED',
    });
    expect(result.success).toBe(false);
  });

  // vaccinationStatus is what tells a refusal-side consequence apart from a
  // vaccination-side one. Every other optional field here defaults; this one
  // deliberately must not, because a silent UNDISCLOSED would be indistinguishable
  // from a reporter who genuinely chose not to say.
  it('REQUIRES vaccinationStatus — it does not quietly default', () => {
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'FAMILY_RELATIONSHIP_RUPTURE',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('vaccinationStatus'))).toBe(true);
    }
  });

  it('accepts UNDISCLOSED as a real, explicitly chosen answer', () => {
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'FAMILY_RELATIONSHIP_RUPTURE',
      vaccinationStatus: 'UNDISCLOSED',
      relationshipAffected: 'PARENT',
    });
    expect(result.success).toBe(true);
  });

  it('records both directions of harm distinctly', () => {
    // The whole point of the field: these two reports describe opposite
    // situations and previously produced identical rows.
    const refused = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'FAMILY_RELATIONSHIP_RUPTURE',
      vaccinationStatus: 'NOT_RECEIVED',
      relationshipAffected: 'SIBLING',
    });
    const vaccinated = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'FAMILY_RELATIONSHIP_RUPTURE',
      vaccinationStatus: 'RECEIVED',
      relationshipAffected: 'SIBLING',
    });
    expect(refused.success && vaccinated.success).toBe(true);
    if (refused.success && vaccinated.success) {
      expect(refused.data.vaccinationStatus).not.toBe(vaccinated.data.vaccinationStatus);
    }
  });

  describe('per-category conditional follow-ups', () => {
    it('requires employmentSector and remedyPursued for an employment category', () => {
      const result = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'EMPLOYMENT_TERMINATION',
        vaccinationStatus: 'NOT_RECEIVED',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.flatMap((i) => i.path);
        expect(paths).toContain('employmentSector');
        expect(paths).toContain('remedyPursued');
      }
    });

    it('accepts an employment report with both follow-ups', () => {
      const result = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'EMPLOYMENT_TERMINATION',
        vaccinationStatus: 'NOT_RECEIVED',
        employmentSector: 'HEALTHCARE',
        remedyPursued: 'REGULATOR_COMPLAINT',
      });
      expect(result.success).toBe(true);
    });

    it('asks MILITARY_DISCHARGE for a remedy but NOT for an employment sector', () => {
      // Military is a formal-process category but not an employment one — the
      // sector question does not describe military service.
      const withSector = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'MILITARY_DISCHARGE',
        vaccinationStatus: 'NOT_RECEIVED',
        remedyPursued: 'INTERNAL_APPEAL',
        employmentSector: 'PUBLIC_SECTOR',
      });
      expect(withSector.success).toBe(false);

      const correct = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'MILITARY_DISCHARGE',
        vaccinationStatus: 'NOT_RECEIVED',
        remedyPursued: 'INTERNAL_APPEAL',
      });
      expect(correct.success).toBe(true);
    });

    it('requires relationshipAffected for a relational category and rejects it elsewhere', () => {
      const missing = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'FAMILY_RELATIONSHIP_RUPTURE',
        vaccinationStatus: 'RECEIVED',
      });
      expect(missing.success).toBe(false);

      const ok = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'FAMILY_RELATIONSHIP_RUPTURE',
        vaccinationStatus: 'RECEIVED',
        relationshipAffected: 'SPOUSE_PARTNER',
      });
      expect(ok.success).toBe(true);

      const misplaced = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'ACCESS_DENIAL_HEALTHCARE',
        vaccinationStatus: 'NOT_RECEIVED',
        relationshipAffected: 'SPOUSE_PARTNER',
      });
      expect(misplaced.success).toBe(false);
    });

    it('asks nothing extra of the access-denial categories', () => {
      // Deliberate: ACCESS_DENIAL_* already say what was denied, so a sub-field
      // repeating it would be the redundancy §2.9 removed elsewhere.
      const result = socialEconomicImpactReportSchema.safeParse({
        impactCategory: 'ACCESS_DENIAL_SERVICES',
        vaccinationStatus: 'NOT_RECEIVED',
      });
      expect(result.success).toBe(true);
    });
  });

  it('no longer accepts the mis-anchored timingRelativeToEvent field', () => {
    // It asked "how long after vaccination" of reporters who were never
    // vaccinated. Dropped, not renamed — see the migration header.
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'MILITARY_DISCHARGE',
      vaccinationStatus: 'NOT_RECEIVED',
      remedyPursued: 'NONE',
      timingRelativeToEvent: 'WITHIN_1_MONTH',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('timingRelativeToEvent');
    }
  });
});
