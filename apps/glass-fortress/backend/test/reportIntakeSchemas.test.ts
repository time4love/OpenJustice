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
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.formalBasisAsserted).toBe('UNKNOWN');
      expect(result.data.consequenceSeverity).toBe('NONE');
      expect(result.data.outcomeStatus).toBe('UNKNOWN');
      expect(result.data.timingRelativeToEvent).toBe('UNKNOWN');
    }
  });

  it('accepts a fully specified report', () => {
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'MILITARY_DISCHARGE',
      formalBasisAsserted: 'RELIGIOUS_ACCOMMODATION_DENIED',
      consequenceSeverity: 'CAREER_TRAJECTORY_IMPACT',
      outcomeStatus: 'RESOLVED_REVERSED',
      documentationAvailable: true,
      timingRelativeToEvent: 'WITHIN_1_MONTH',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown impactCategory value', () => {
    const result = socialEconomicImpactReportSchema.safeParse({
      impactCategory: 'NOT_A_REAL_CATEGORY',
    });
    expect(result.success).toBe(false);
  });
});
