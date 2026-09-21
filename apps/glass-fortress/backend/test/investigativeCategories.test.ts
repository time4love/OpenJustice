import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveSignificance,
  flaggedByClassifier,
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

// ---------------------------------------------------------------------------
// THE TWO HALVES OF SIGNIFICANCE, PINNED APART — UI-8 chunk 5a, on the R69
// REVIEW seat's correction of 2026-09-21.
//
// `deriveSignificance` is the WRITE-side derivation and `flaggedByClassifier` is
// the READ-side gate, and the brief that asked for the gate CONFLATED THEM — it
// named `deriveSignificance` as the gate, which answers `false` on a diff with
// no opinion and would dim exactly the rows ruling (g) rules are never gated.
// The confusion is the reason this table exists: the two live one function apart
// in one module, and the only thing that keeps them apart is a case that states
// what each one answers.
// ---------------------------------------------------------------------------

describe('significance: the write-side derivation and the read-side gate are different predicates', () => {
  const opinion = (legallySignificant: boolean, categories: readonly string[]) => ({ legallySignificant, categories });

  it('deriveSignificance is category membership and nothing else', () => {
    expect(deriveSignificance([])).toBe(false);
    expect(deriveSignificance(['STATISTICAL_MANIPULATION'])).toBe(true);
    // It takes `readonly string[]` and NOT the enum, because a STORED classification is read back as plain
    // strings — a row written under an older taxonomy is still a row, and narrowing it away here would change
    // the gate's answer for exactly those rows.
    expect(deriveSignificance(['A_CATEGORY_NO_LONGER_IN_THE_TAXONOMY'])).toBe(true);
  });

  it.each([
    ['a capture — never gated, whatever else is true', { kind: 'CAPTURE' } as const, true],
    ['a diff with NO opinion — a classifier that has not spoken has not judged it (the researcher, 2026-09-19)', { kind: 'DIFF', opinion: null } as const, true],
    ['legallySignificant true with EMPTY categories — the flag alone passes it', { kind: 'DIFF', opinion: opinion(true, []) } as const, true],
    ['legallySignificant FALSE with a category — the categories alone pass it', { kind: 'DIFF', opinion: opinion(false, ['SAFETY_CLAIM_ALTERATION']) } as const, true],
    ['legallySignificant false with NO category — the one row the gate hides', { kind: 'DIFF', opinion: opinion(false, []) } as const, false],
  ])('flaggedByClassifier: %s', (_name, entry, expected) => {
    expect(flaggedByClassifier(entry)).toBe(expected);
  });

  it('the gate is NOT deriveSignificance — the two disagree on the opinion-less diff, which is the whole correction', () => {
    // Written as a DISAGREEMENT rather than as two separate answers: this is the line that fails the day someone
    // "simplifies" the gate into the derivation, which is what the brief for this chunk asked for in its first issue.
    const awaiting = { kind: 'DIFF', opinion: null } as const;
    expect(flaggedByClassifier(awaiting)).toBe(true);
    // The derivation cannot be handed an opinion that does not exist, so a gate spelled as `deriveSignificance`
    // reaches this row with the empty list — and answers the OPPOSITE of the gate. That is the whole divergence.
    expect(deriveSignificance([])).toBe(false);
  });

  it("the frontend holds the SAME three arms under the SAME name — copied with its source named, never imported across the workspace", () => {
    // The researcher refused a cross-workspace import on 2026-09-19 over a 20-character regex, so the two are
    // copies — and a copy with no case over it is the copy that drifts. This reads the other spelling as TEXT and
    // holds that it is still a three-arm gate on `legallySignificant` and the categories, never on `editorial`.
    const twin = readFileSync(join(__dirname, '../../frontend/src/lib/corpusSignificance.ts'), 'utf8');
    const start = twin.indexOf('export function flaggedByClassifier');
    expect(start).toBeGreaterThan(-1);
    const body = twin.slice(start, twin.indexOf('\n}', start)).replace(/\s+/g, ' ');

    // THE ARMS WITH THEIR ANSWERS, not merely their conditions. The first spelling of this case asserted that
    // the twin CONTAINED `entry.opinion === null` — which a twin returning `false` on that arm also contains, so
    // it passed against the very drift it was written to catch. A decoy is what found that, which is the whole
    // reason this repository plants them: a case that reddens proves the suite RUNS, not that the instrument SEES.
    expect(body).toContain("if (entry.kind !== 'DIFF') return true;");
    expect(body).toContain('if (entry.opinion === null) return true;');
    expect(body).toContain('return entry.opinion.legallySignificant || entry.opinion.categories.length > 0;');
    // `editorial` gates NOTHING — 20 of 21 real diffs carry it and 8 of those are flagged (§24 :663–:670).
    expect(body).not.toContain('editorial');
  });
});
