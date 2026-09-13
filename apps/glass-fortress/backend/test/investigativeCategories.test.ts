import {
  INVESTIGATIVE_CATEGORIES,
  INVESTIGATIVE_CATEGORY_LABELS,
  investigativeCategoriesField,
} from '../src/lib/investigativeCategories';
import { ForensicOutputSchema } from '../src/services/ForensicAgent';

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

    // `IntakeAgent`'s two cases went with the agent at evidence step 11a. This
    // group asserted that TWO classifying agents shared ONE taxonomy — the point
    // being that a category accepted by one and rejected by the other is a
    // vocabulary with two meanings. The intake classifier is retired by document
    // flows §3: what a document says is a `DocumentContentVersion` under
    // `CURRENT_EXTRACTOR`, computed and pinned, with the model's reading beside
    // it as a labelled opinion. One agent classifies now, and the field below is
    // still the one definition it and every future one must parse.

    it('the shared field rejects an unknown category', () => {
      expect(investigativeCategoriesField.safeParse(['NOT_A_CATEGORY']).success).toBe(false);
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
