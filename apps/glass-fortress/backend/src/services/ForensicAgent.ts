import { z } from 'zod';
import { LLMFactory, resolveModelId } from '../factories/LLMFactory';
import {
  investigativeCategoriesField,
  type InvestigativeCategory,
} from '../lib/investigativeCategories';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FORENSIC_DIFF_CLASSIFICATION_PROMPT } from '../prompts/forensicDiffClassification';
import type { EvidenceContext } from '../lib/evidenceContext';
import { FORENSIC_SUMMARY_REWRITE_PROMPT } from '../prompts/forensicSummaryRewrite';

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
  investigativeCategories: investigativeCategoriesField.describe(
    'Every standing concern THIS ITEM materially supports, judged on its own merits. ' +
      'Empty array when it supports none — which is the common and correct answer.',
  ),
  relocated: z
    .boolean()
    .describe(
      'True when this text was MOVED rather than genuinely removed or introduced — i.e. the same ' +
        'content appears on the other side of this same diff, just in a different position on the ' +
        'page. A relocated item changes nothing a reader would notice and must not be treated as ' +
        'a deletion or addition of the claim it contains.',
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
 *
 * Note also the absence of a diff-level `investigativeCategories`. Categories are
 * asked for PER ITEM and the diff-level set is derived as their union.
 *
 * Judging the diff as a whole let a consequential change be masked by the company
 * it kept. On 2026-08-22 the deletion of the 4th-dose efficacy figures — the same
 * text classified significant in five other diffs of the same scan — was rated
 * immaterial in the one diff where it arrived bundled with six routine
 * administrative removals and six additions announcing a new campaign. The
 * aggregate read as a campaign transition, so the item vanished into it.
 *
 * That is a structural property, not bad luck: it means the reliable way to
 * remove a consequential claim unnoticed is to remove it alongside housekeeping.
 * A forensic classifier must not have that property regardless of anyone's intent.
 */
const ForensicLlmOutputSchema = z.object({
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
  investigativeCategories: investigativeCategoriesField.describe(
    'Derived: the union of the items\' categories, excluding relocations.',
  ),
  isLegallySignificant: z
    .boolean()
    .describe('Derived: true when investigativeCategories is non-empty.'),
});

export type ForensicOutput = z.infer<typeof ForensicOutputSchema>;

/**
 * The diff's categories: the union of what its items carry, ignoring relocations.
 *
 * Relocated items are excluded deliberately. Text moved from one part of a page
 * to another appears in this diff as both a deletion and an addition, and reading
 * the deletion on its own would report the removal of a claim that is still on
 * the page. The aggregate judgment used to absorb that; per-item classification
 * would not, so the model is asked to mark it and the derivation drops it.
 */
export function deriveDiffCategories(
  items: readonly { investigativeCategories: readonly InvestigativeCategory[]; relocated: boolean }[],
): InvestigativeCategory[] {
  const union = new Set<InvestigativeCategory>();
  for (const item of items) {
    if (item.relocated) continue;
    for (const c of item.investigativeCategories) union.add(c);
  }
  return [...union];
}

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

/**
 * Rewrites one diff's legalSignificance from its ALREADY-EXTRACTED items.
 *
 * Deliberately a separate chain with a separate prompt, and deliberately given no
 * correlated evidence at all. The defect it exists to repair was an instruction to
 * cross-reference other records inside this field; withholding those records from
 * the input makes leakage structurally impossible rather than merely forbidden.
 *
 * It never re-extracts. The items are the input, not the output — which is what
 * keeps the evidence fileHash (url + date + deletedText + addedText) stable, and
 * therefore keeps seven on-chain anchors pointing at something.
 */
export class ForensicSummaryRewriter {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('FORENSIC', { temperature: 0 });
    this.chain = model.withStructuredOutput(
      z.object({ legalSignificance: z.string().min(1) }),
      { name: 'forensic_summary_rewrite' },
    ) as { invoke(input: unknown): Promise<unknown> };
  }

  async rewrite(input: {
    url: string;
    date: string;
    deletedItems: DiffItem[];
    addedItems: DiffItem[];
  }): Promise<string> {
    const render = (items: DiffItem[], mark: string) =>
      items.length > 0
        ? items
            .map(
              (i) =>
                `  ${mark} "${i.exactQuote}"\n` +
                `     סיווג: ${i.investigativeCategories.join(', ') || 'ללא'}` +
                (i.relocated ? ' | הועבר למקום אחר באותו דף' : ''),
            )
            .join('\n')
        : '  (אין)';

    const raw = await this.chain.invoke([
      { role: 'system' as const, content: FORENSIC_SUMMARY_REWRITE_PROMPT },
      {
        role: 'human' as const,
        content:
          `דף: ${input.url}\n` +
          `תאריך התצלום שבו זוהה השינוי: ${input.date}\n\n` +
          `פריטים שנמחקו:\n${render(input.deletedItems, '-')}\n\n` +
          `פריטים שנוספו:\n${render(input.addedItems, '+')}\n\n` +
          `כתוב את legalSignificance עבור שינוי זה.`,
      },
    ]);

    return z.object({ legalSignificance: z.string().min(1) }).parse(raw).legalSignificance;
  }
}

export class ForensicAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };
  /** `provider:model` actually used, for stamping onto whatever this classifies. */
  readonly modelId: string = resolveModelId('FORENSIC');

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

    const investigativeCategories = deriveDiffCategories([
      ...analysis.deletedItems,
      ...analysis.addedItems,
    ]);

    return {
      ...analysis,
      investigativeCategories,
      isLegallySignificant: deriveSignificance(investigativeCategories),
    };
  }
}
