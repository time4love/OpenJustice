import {
  INVESTIGATIVE_CATEGORIES,
  INVESTIGATIVE_CATEGORY_LABELS,
  forensicTierReasoning,
  investigativeCategoriesField,
} from '../src/lib/investigativeCategories';
import { ForensicOutputSchema } from '../src/services/ForensicAgent';
import { IntakeOutputSchema } from '../src/services/IntakeAgent';

describe('investigative categories', () => {
  // -------------------------------------------------------------------------
  // The taxonomy is shared. If ForensicAgent and IntakeAgent ever accept
  // different category sets, evidence created through one path becomes
  // invisible to filters written against the other — which is the bug this
  // module exists to prevent.
  // -------------------------------------------------------------------------
  describe('shared across every classifying agent', () => {
    const sample = INVESTIGATIVE_CATEGORIES.map((c) => c);

    it('ForensicAgent accepts the full taxonomy', () => {
      const result = ForensicOutputSchema.safeParse({
        isLegallySignificant: true,
        investigativeCategories: sample,
        deletedItems: [],
        addedItems: [],
        legalSignificance: 'נימוק',
      });
      expect(result.success).toBe(true);
    });

    it('IntakeAgent accepts the full taxonomy', () => {
      const field = IntakeOutputSchema.shape.investigativeCategories;
      expect(field.safeParse(sample).success).toBe(true);
    });

    it('both agents reject the same unknown category', () => {
      const bogus = ['NOT_A_CATEGORY'];
      expect(investigativeCategoriesField.safeParse(bogus).success).toBe(false);
      expect(IntakeOutputSchema.shape.investigativeCategories.safeParse(bogus).success).toBe(false);
    });

    it('every category has a Hebrew label', () => {
      for (const category of INVESTIGATIVE_CATEGORIES) {
        expect(INVESTIGATIVE_CATEGORY_LABELS[category]).toBeTruthy();
      }
      expect(Object.keys(INVESTIGATIVE_CATEGORY_LABELS)).toHaveLength(
        INVESTIGATIVE_CATEGORIES.length,
      );
    });
  });

  // -------------------------------------------------------------------------
  // forensicTierReasoning replaced a hardcoded string that asserted
  // "ראיה ישירה לכוונת הטעיה" — direct evidence of intent to mislead — on every
  // automatically created record. Intent is a court's inference, not a
  // classifier's output.
  // -------------------------------------------------------------------------
  describe('forensicTierReasoning', () => {
    it('names the concerns the change advances', () => {
      const text = forensicTierReasoning('https://health.gov.il/x', '2021-06-01', [
        'WITHHOLDING_INFORMATION',
        'INFORMED_CONSENT',
      ]);

      expect(text).toContain('https://health.gov.il/x');
      expect(text).toContain('2021-06-01');
      expect(text).toContain(INVESTIGATIVE_CATEGORY_LABELS.WITHHOLDING_INFORMATION);
      expect(text).toContain(INVESTIGATIVE_CATEGORY_LABELS.INFORMED_CONSENT);
    });

    it('omits the concerns clause when nothing matched', () => {
      const text = forensicTierReasoning('https://health.gov.il/x', '2021-06-01', []);
      expect(text).toContain('https://health.gov.il/x');
      expect(text).not.toContain('רלוונטי לתחומי החקירה');
    });

    it('never asserts intent, motive, or knowledge', () => {
      const text = forensicTierReasoning('https://health.gov.il/x', '2021-06-01', [
        ...INVESTIGATIVE_CATEGORIES,
      ]);

      for (const claim of ['כוונת', 'במתכוון', 'ביודעין', 'מזיד']) {
        expect(text).not.toContain(claim);
      }
    });
  });
});
