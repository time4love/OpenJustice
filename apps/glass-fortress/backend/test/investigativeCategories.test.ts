import {
  INVESTIGATIVE_CATEGORIES,
  INVESTIGATIVE_CATEGORY_LABELS,
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
        editorial: true,
        editorialReason: 'fixture reason',
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
});
