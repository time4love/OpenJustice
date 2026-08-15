import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';
import {
  INVESTIGATIVE_CATEGORY_PROMPT_BLOCK,
  investigativeCategoriesField,
  type InvestigativeCategory,
} from '../lib/investigativeCategories';

// ---------------------------------------------------------------------------
// Related evidence context — summarised DB records passed to the agent
// ---------------------------------------------------------------------------

export interface RelatedEvidenceContext {
  date: string;
  summary: string;
  investigativeCategories: string[];
  targetEntity: string;
  evidenceRole: string;
}

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

// Guards the schema actually sent to the model — a field silently dropped in
// translation would be a field the model never fills in.
function assertForensicSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(ForensicLlmOutputSchema) as {
    properties?: Record<string, unknown>;
  };
  const schemaFields = Object.keys(ForensicLlmOutputSchema.shape);
  const missing = schemaFields.filter((f) => !(f in (jsonSchema.properties ?? {})));
  if (missing.length > 0) {
    throw new Error(
      `[ForensicAgent] Schema compatibility failure: fields dropped by zodToJsonSchema — [${missing.join(', ')}].`,
    );
  }
}

assertForensicSchemaCompatibility();

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Forensic Legal Analyst building a class-action lawsuit against government health authorities for Covid-19 policy failures.

You are given a TEXT DIFF — the exact text that was DELETED and ADDED to an official government or health authority web page on a specific DATE, discovered by comparing Wayback Machine archive snapshots.

You are also given a list of INTERNAL EVIDENCE from our legal database that occurred within a 60-day window around the same date. This evidence was previously submitted by whistleblowers, citizens, and researchers.

YOUR TASK:
1. Classify the change against the standing investigative concerns listed below. Return every concern the change materially supports — and an EMPTY ARRAY if it supports none.
2. If correlated DB evidence exists (same entity, overlapping timeframe, related subject matter), EXPLICITLY cross-reference it in your legalSignificance explanation. The correlation is the most powerful forensic finding — "they silently deleted the mRNA safety claim 3 weeks after this internal report surfaced."

${INVESTIGATIVE_CATEGORY_PROMPT_BLOCK}

Return an empty array for: navigation and menu updates, formatting and styling, broken-link fixes, contact-page edits, rewording that preserves meaning, and content on unrelated subjects (budgets, tenders, appointments, unrelated press releases). Most page changes fall here. An empty array is a correct, expected, and useful answer. A missed change can be found again by re-scanning; a corpus full of weak claims cannot be repaired.

Populate deletedItems and addedItems with the actual text changes in ALL cases, including when investigativeCategories is empty.

LANGUAGE RULES:
- deletedItems[].summary and addedItems[].summary: concise 1-sentence factual statements in highly professional Hebrew
- deletedItems[].exactQuote and addedItems[].exactQuote: verbatim copy of the diff text — no Hebrew, no paraphrasing
- legalSignificance: 2-4 sharp, forensic sentences in highly professional Hebrew. When investigativeCategories is empty, one sentence stating why the change is immaterial.

Describe what the change DID and what it supports. Do not assert intent, motive, or knowledge — that is for a court to infer, not for this classification to declare.`;

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
      { role: 'system' as const, content: SYSTEM_PROMPT },
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
