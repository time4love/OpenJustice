import { z } from 'zod';
import { LLMFactory, resolveModelId } from '../factories/LLMFactory';
import {
  investigativeCategoriesField,
  type InvestigativeCategory,
} from '../lib/investigativeCategories';
import { assertSchemaCompatibility } from '../lib/assertSchemaCompatibility';
import { FORENSIC_DIFF_CLASSIFICATION_PROMPT } from '../prompts/forensicDiffClassification';
import { computeDiffCoverage, type DiffCoverage } from '../lib/diffCoverage';
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

export type ForensicOutput = z.infer<typeof ForensicOutputSchema> & {
  /**
   * How much of its input this classification describes.
   *
   * Derived, not asked for: a model cannot be trusted to report its own
   * omissions, and one that drops input reports success.
   */
  coverage: DiffCoverage;
  /** How many draws were taken. >1 means an earlier draw covered less. */
  draws: number;
};

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

/**
 * Output budget for the classifier.
 *
 * Was unset, so the provider default applied. Measured against the largest real
 * diff in the corpus (68 chunks, 8,207 characters of changed text): with the
 * default, three draws covered 57%, 76% and 75% of chunks and never approached
 * completeness. With this budget, two of three draws reached 99% and 100% — the
 * proof that the model CAN enumerate every change in that diff, and that the
 * shortfall was never a capability ceiling.
 *
 * Set explicitly rather than left to the provider so that swapping providers, or
 * a provider changing its own default, cannot silently change what the corpus
 * records.
 */
export const FORENSIC_MAX_OUTPUT_TOKENS = 8192;

/**
 * How many times one diff may be classified before the best draw is kept.
 *
 * The classifier is non-deterministic at temperature 0 and the spread is wide:
 * on the same diff and the same budget, draws ranged from 43% to 100% coverage.
 * A corpus that stores ONE draw per diff stores a sample and presents it as a
 * measurement — staging's stored row for that diff covers 63%, worse than five of
 * the six draws taken while investigating it.
 *
 * Redrawing the WHOLE diff, not the missed chunks in isolation. Feeding back only
 * the uncovered text removes the surrounding page along with the crowding, and a
 * fragment judged alone is likelier to be called significant — which would bias
 * the corpus toward inflated findings on a platform where a finding names a real
 * ministry.
 *
 * Bounded, because a chunk that survives three independent draws is a finding
 * about the classifier rather than something more calls will fix.
 */
export const MAX_CLASSIFICATION_DRAWS = 3;

export class ForensicAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };
  /** `provider:model` actually used, for stamping onto whatever this classifies. */
  readonly modelId: string = resolveModelId('FORENSIC');
  private readonly maxDraws: number;

  constructor(options?: { maxOutputTokens?: number; maxDraws?: number }) {
    this.maxDraws = Math.max(1, options?.maxDraws ?? MAX_CLASSIFICATION_DRAWS);
    const model = LLMFactory.getChatModel('FORENSIC', {
      temperature: 0,
      maxOutputTokens: options?.maxOutputTokens ?? FORENSIC_MAX_OUTPUT_TOKENS,
    });
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

    // BEST OF N, SCORED ON TEXT COVERAGE.
    //
    // One draw is a sample. Storing it as though it were a measurement is how a
    // row came to describe 63% of its own input with nothing recording that fact.
    // Draws stop as soon as one is complete, so the common case — the eleven of
    // thirteen diffs already covered 1:1 — costs exactly one call.
    let best: { analysis: z.infer<typeof ForensicLlmOutputSchema>; coverage: DiffCoverage } | null =
      null;
    let draws = 0;

    for (let i = 0; i < this.maxDraws; i++) {
      draws++;
      const analysis = ForensicLlmOutputSchema.parse(await this.chain.invoke(messages));
      const coverage = computeDiffCoverage({
        rawDeletedChunks: deletions,
        rawAddedChunks: additions,
        deletedItems: analysis.deletedItems,
        addedItems: analysis.addedItems,
      });

      // Strictly greater: ties keep the earlier draw, so an equally-covering
      // redraw cannot churn the stored prose for no gain.
      if (best === null || coverage.coveredChars > best.coverage.coveredChars) {
        best = { analysis, coverage };
      }
      if (coverage.complete) break;
    }

    /* istanbul ignore next -- the loop runs at least once, so best is set. */
    if (best === null) throw new Error('Classification produced no draw');

    if (!best.coverage.complete) {
      // Counted and loud. The defect this guards was silent: a classification
      // that described part of its input reported success, and nothing anywhere
      // recorded how much it had left out.
      console.warn(
        `[ForensicAgent] Coverage incomplete for ${url} @ ${date} after ` +
          `${String(draws)} draw(s): ${String(best.coverage.uncoveredChunks.length)} of ` +
          `${String(best.coverage.chunkCount)} chunks described by no item ` +
          `(${String(Math.round(best.coverage.charRatio * 100))}% of characters covered).`,
      );
    }

    const analysis = best.analysis;
    const investigativeCategories = deriveDiffCategories([
      ...analysis.deletedItems,
      ...analysis.addedItems,
    ]);

    return {
      ...analysis,
      investigativeCategories,
      isLegallySignificant: deriveSignificance(investigativeCategories),
      coverage: best.coverage,
      draws,
    };
  }
}
