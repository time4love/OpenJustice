import { z } from 'zod';
import { LLMFactory } from '../factories/LLMFactory';
import {
  investigativeCategoriesField,
  type InvestigativeCategory,
} from '../lib/investigativeCategories';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FORENSIC_DIFF_CLASSIFICATION_PROMPT } from '../prompts/forensicDiffClassification';
import type { EvidenceContext } from '../lib/evidenceContext';

// ---------------------------------------------------------------------------
// Related evidence context — summarised DB records passed to the agent
// ---------------------------------------------------------------------------

export type RelatedEvidenceContext = Pick<
  EvidenceContext,
  'summary' | 'investigativeCategories' | 'targetEntity' | 'evidenceRole'
> & { date: string };

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const DiffItemSchema = z.object({
  summary: z
    .string()
    .describe(
      'A concise 1-sentence forensic label in highly professional Hebrew describing this specific change.',
    ),
  exactQuote: z
    .string()
    .describe(
      'The EXACT verbatim text from the diff input that this summary describes. ' +
        'Copy it character-for-character — do not paraphrase, shorten, or reconstruct.',
    ),
});

export type DiffItem = z.infer<typeof DiffItemSchema>;

/**
 * What the model is asked to return.
 *
 * Note the absence of `isLegallySignificant`: significance is DERIVED from
 * investigativeCategories rather than judged separately. Asking for both invites
 * the model to contradict itself — "significant, but matching no concern we are
 * investigating" — and that hedge is exactly what filled the evidence table with
 * changes nobody could act on. Classification is a concrete task; a bare
 * significance boolean is not.
 */
const ForensicLlmOutputSchema = z.object({
  investigativeCategories: investigativeCategoriesField,

  deletedItems: z
    .array(DiffItemSchema)
    .describe(
      'One object per substantive DELETION. For each deleted chunk: write a Hebrew summary AND ' +
        'copy the exact verbatim text from the diff that was removed. ' +
        'Always populate this array with the actual text changes — even for cosmetic diffs. ' +
        'Return an empty array only if there were literally no deletions in the diff.',
    ),

  addedItems: z
    .array(DiffItemSchema)
    .describe(
      'One object per substantive ADDITION. For each added chunk: write a Hebrew summary AND ' +
        'copy the exact verbatim text from the diff that was introduced. ' +
        'Always populate this array with the actual text changes — even for cosmetic diffs. ' +
        'Return an empty array only if there were literally no additions in the diff.',
    ),

  legalSignificance: z
    .string()
    .describe(
      'A sharp, professional forensic note in highly professional Hebrew (1-4 sentences). ' +
        'For SIGNIFICANT changes: explain WHY this matters legally. ' +
        'CRITICAL: if correlated evidence from the database was provided ' +
        'AND a meaningful correlation exists (same entity, overlapping dates, related subject), you MUST ' +
        'explicitly reference it — e.g., "שינוי זה נעשה כ-18 יום לאחר שדו\"ח פנימי של משרד הבריאות ' +
        'הדגיש סיכונים קרדיולוגיים — מה שמציע כי מחיקת האזהרה לא הייתה מקרית." ' +
        'For NON-SIGNIFICANT changes: write a brief 1-sentence note explaining why this change was classified as cosmetic ' +
        '(e.g., "עדכון קישורי ניווט בלבד ללא שינוי בתוכן הרפואי או הרגולטורי.").',
    ),
});

/**
 * The public shape, as persisted and consumed downstream.
 *
 * `isLegallySignificant` is computed, never asked for — see deriveSignificance.
 * It remains on the type because it is a column on UrlVersionDiff and is read by
 * the forensics routes and MCP tools.
 */
export const ForensicOutputSchema = ForensicLlmOutputSchema.extend({
  isLegallySignificant: z
    .boolean()
    .describe('Derived: true when investigativeCategories is non-empty.'),
});

export type ForensicOutput = z.infer<typeof ForensicOutputSchema>;

/**
 * Significance is category membership — a change matters to this investigation
 * exactly when it advances one of its standing concerns. Single source of truth,
 * so the flag and the classification can never disagree.
 */
export function deriveSignificance(categories: readonly InvestigativeCategory[]): boolean {
  return categories.length > 0;
}

// ---------------------------------------------------------------------------
// Schema integrity guard
// ---------------------------------------------------------------------------

assertSchemaCompatibility(ForensicLlmOutputSchema, 'ForensicAgent');

// ---------------------------------------------------------------------------
// ForensicAgent
// ---------------------------------------------------------------------------

export class ForensicAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('FORENSIC', { temperature: 0 });
    this.chain = model.withStructuredOutput(ForensicLlmOutputSchema, {
      name: 'forensic_analysis',
    }) as { invoke(input: unknown): Promise<unknown> };
  }

  async analyzeChange(
    deletions: string[],
    additions: string[],
    url: string,
    date: string,
    relatedEvidence: RelatedEvidenceContext[],
  ): Promise<ForensicOutput> {
    const deletionsText =
      deletions.length > 0 ? deletions.map((d) => `  - "${d}"`).join('\n') : '  (none)';
    const additionsText =
      additions.length > 0 ? additions.map((a) => `  + "${a}"`).join('\n') : '  (none)';

    const evidenceText =
      relatedEvidence.length > 0
        ? relatedEvidence
            .map(
              (e, i) =>
                `  [${i + 1}] Date: ${e.date} | Entity: ${e.targetEntity} | Role: ${e.evidenceRole} | Concerns: ${e.investigativeCategories.join(", ") || "none"}\n` +
                `       Summary: ${e.summary.slice(0, 300)}`,
            )
            .join('\n\n')
        : '  (no correlated evidence found in database for this time window)';

    const messages = [
      { role: 'system' as const, content: FORENSIC_DIFF_CLASSIFICATION_PROMPT },
      {
        role: 'human' as const,
        content:
          `FORENSIC DIFF ANALYSIS REQUEST\n` +
          `================================\n` +
          `Target URL: ${url}\n` +
          `Date of detected change: ${date}\n\n` +
          `TEXT DELETED in this snapshot (vs. previous):\n${deletionsText}\n\n` +
          `TEXT ADDED in this snapshot (vs. previous):\n${additionsText}\n\n` +
          `CORRELATED INTERNAL EVIDENCE (±60 days from ${date}):\n${evidenceText}\n\n` +
          `Analyze the forensic and legal significance of this change.`,
      },
    ];

    const result = await this.chain.invoke(messages);
    const analysis = ForensicLlmOutputSchema.parse(result);

    return {
      ...analysis,
      isLegallySignificant: deriveSignificance(analysis.investigativeCategories),
    };
  }
}
