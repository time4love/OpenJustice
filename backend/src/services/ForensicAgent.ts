import { z } from 'zod';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { LLMFactory } from '../factories/LLMFactory';

// ---------------------------------------------------------------------------
// Related evidence context — summarised DB records passed to the agent
// ---------------------------------------------------------------------------

export interface RelatedEvidenceContext {
  date: string;
  summary: string;
  category: string;
  targetEntity: string;
  evidenceRole: string;
}

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

export const ForensicOutputSchema = z.object({
  isLegallySignificant: z
    .boolean()
    .describe(
      'true if the change has substantive legal relevance — a safety claim was removed, ' +
        'an EUA qualifier was dropped, mandate language was added, or a statistic was silently altered. ' +
        'false if the change is purely cosmetic: navigation updates, formatting, footer links, ' +
        'language tweaks with no change in meaning, or completely unrelated page sections.',
    ),

  deletedClaims: z
    .array(z.string())
    .describe(
      'One item per substantive DELETION. Write each item in highly professional Hebrew as a ' +
        'concise factual statement of what was removed (e.g., "הובטח כי החיסון יישאר בגוף לפחות 3 חודשים"). ' +
        'Always populate this array with the actual text changes — even for cosmetic diffs. ' +
        'Return an empty array only if there were literally no deletions in the diff.',
    ),

  addedClaims: z
    .array(z.string())
    .describe(
      'One item per substantive ADDITION. Write each item in highly professional Hebrew as a ' +
        'concise factual statement of what was newly introduced (e.g., "נוספה הוראה המחייבת עובדים לקבל חיסון"). ' +
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

export type ForensicOutput = z.infer<typeof ForensicOutputSchema>;

// ---------------------------------------------------------------------------
// Schema integrity guard
// ---------------------------------------------------------------------------

function assertForensicSchemaCompatibility(): void {
  const jsonSchema = toJsonSchema(ForensicOutputSchema) as { properties?: Record<string, unknown> };
  const schemaFields = Object.keys(ForensicOutputSchema.shape);
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
1. Determine if the website change is legally significant — did it remove a safety promise, drop emergency authorization language, add coercive mandates, or alter factual health claims in a misleading way?
2. If correlated DB evidence exists (same entity, overlapping timeframe, related subject matter), EXPLICITLY cross-reference it in your legalSignificance explanation. The correlation is the most powerful forensic finding — "they silently deleted the mRNA safety claim 3 weeks after this internal report surfaced."

LEGAL SIGNIFICANCE CRITERIA:
- SIGNIFICANT (isLegallySignificant: true): Deletion of safety warnings or biological safety promises (e.g., claims about mRNA remaining in the body for a limited period, immune system effects), removal of EUA/emergency-use qualifiers, addition of coercion/mandate language, silent changes to efficacy or adverse-event statistics, removal of named officials or accountability references, removal of informed consent disclosures, deletion of adverse event reporting links, removal of contraindications or risk disclosures, alterations that downplay or conceal known side effects.
- NOT SIGNIFICANT (isLegallySignificant: false): Navigation updates, formatting changes, broken link fixes, contact page updates, language tweaks with identical meaning, unrelated page sections (budget, tenders, press releases about unrelated topics).

IMPORTANT: Err on the side of significance. A deleted safety promise that seems minor may be the most critical piece of evidence in a class-action. When in doubt about a biological/medical claim being removed, flag it as significant.

LANGUAGE RULES:
- deletedClaims and addedClaims: concise factual statements in highly professional Hebrew
- legalSignificance: 2-4 sharp, forensic sentences in highly professional Hebrew
- isLegallySignificant: boolean (strict binary — do not hedge)

CRITICAL: Never force significance onto cosmetic changes. A false positive wastes legal resources and reduces credibility. Be precise and honest.`;

// ---------------------------------------------------------------------------
// ForensicAgent
// ---------------------------------------------------------------------------

export class ForensicAgent {
  private readonly chain: { invoke(input: unknown): Promise<unknown> };

  constructor() {
    const model = LLMFactory.getChatModel('FORENSIC', { temperature: 0 });
    this.chain = model.withStructuredOutput(ForensicOutputSchema, {
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
                `  [${i + 1}] Date: ${e.date} | Entity: ${e.targetEntity} | Role: ${e.evidenceRole} | Category: ${e.category}\n` +
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
    return ForensicOutputSchema.parse(result);
  }
}
